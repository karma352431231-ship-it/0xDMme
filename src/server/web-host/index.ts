import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { Database } from '../database/index.ts';
import type { ObjectStore } from '../object-store/index.ts';

export interface WebAsset {
  content: Uint8Array;
  type: string;
}

function assetEntry(entry: unknown): { path: string; type: string } {
  if (
    typeof entry !== 'object' ||
    entry === null ||
    !('path' in entry) ||
    typeof entry.path !== 'string' ||
    !('type' in entry) ||
    typeof entry.type !== 'string' ||
    !/^\/[a-zA-Z0-9.-]+$/u.test(entry.path)
  )
    throw new Error('Asset inválido.');
  return { path: entry.path, type: entry.type };
}

export async function loadWebAssets(): Promise<ReadonlyMap<string, WebAsset>> {
  const root = new URL('../../../dist/web/', import.meta.url);
  const manifest: unknown = JSON.parse(
    await readFile(new URL('assets.json', root), 'utf8'),
  );
  if (!Array.isArray(manifest) || manifest.length > 16)
    throw new Error('Build inválido.');
  const assets = new Map<string, WebAsset>();
  for (const value of manifest as unknown[]) {
    const entry = assetEntry(value);
    const content = await readFile(new URL(entry.path.slice(1), root));
    if (content.length > 2 * 1024 * 1024) throw new Error('Asset excedido.');
    assets.set(entry.path === '/index.html' ? '/' : entry.path, {
      content,
      type: entry.type,
    });
  }
  if (!assets.has('/') || !assets.has('/sw.js'))
    throw new Error('Build incompleto.');
  return assets;
}

function securityHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
}

function publicNavigation(request: IncomingMessage): boolean {
  // A wallet's browse link may navigate from another site. Only the public
  // shell can be opened this way; account APIs and mutations remain protected.
  return (
    request.method === 'GET' &&
    (request.url === '/' ||
      request.url === '/wallet.html' ||
      approvalEntry(request)) &&
    request.headers['sec-fetch-mode'] === 'navigate' &&
    request.headers['sec-fetch-dest'] === 'document'
  );
}

function approvalEntry(request: IncomingMessage): boolean {
  return (
    request.url === '/wallet-entry' ||
    request.url?.startsWith('/wallet-entry?') === true
  );
}

function admitted(request: IncomingMessage, origin: string): boolean {
  return (
    request.headers.host === new URL(origin).host &&
    (request.headers.origin === undefined ||
      request.headers.origin === origin) &&
    (request.headers['sec-fetch-site'] !== 'cross-site' ||
      publicNavigation(request))
  );
}

function sendAsset(
  request: IncomingMessage,
  response: ServerResponse,
  asset: WebAsset | undefined,
): void {
  if (!asset) {
    response.writeHead(404).end();
    return;
  }
  if (request.url === '/sw.js')
    response.setHeader('Service-Worker-Allowed', '/');
  response.setHeader('Content-Type', asset.type);
  response.setHeader('Content-Length', asset.content.byteLength);
  response.writeHead(200);
  response.end(request.method === 'HEAD' ? undefined : asset.content);
}

function sendHealth(
  response: ServerResponse,
  method: string,
  healthy: boolean,
): void {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.writeHead(healthy ? 200 : 503);
  response.end(
    method === 'HEAD'
      ? undefined
      : JSON.stringify({ status: healthy ? 'ok' : 'unavailable' }),
  );
}

export function createWebServer(options: {
  origin: string;
  assets: ReadonlyMap<string, WebAsset>;
  database: Pick<Database, 'healthy'>;
  objects: Pick<ObjectStore, 'healthy'>;
  account?: {
    handle: (
      request: IncomingMessage,
      response: ServerResponse,
    ) => Promise<void>;
    close: () => void;
  };
  tls?: { cert: Buffer; key: Buffer };
}) {
  let stopping = false;
  let pendingHealth: Promise<boolean> | undefined;
  async function ready(): Promise<boolean> {
    if (stopping) return false;
    // Concurrent health checks share one bounded operation, not N SQL reads.
    pendingHealth ??= Promise.all([
      options.database.healthy(),
      options.objects.healthy(),
    ])
      .then((results) => results.every(Boolean))
      .finally(() => {
        pendingHealth = undefined;
      });
    return pendingHealth;
  }
  async function handle(request: IncomingMessage, response: ServerResponse) {
    securityHeaders(response);
    if (!admitted(request, options.origin)) {
      response.writeHead(403).end();
      return;
    }
    if (
      (request.url?.startsWith('/api/account/') || approvalEntry(request)) &&
      options.account
    ) {
      if (stopping) {
        response.writeHead(503).end();
        return;
      }
      await options.account.handle(request, response);
      return;
    }
    await publicRequest(request, response);
  }
  async function publicRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      response.writeHead(405).end();
      return;
    }
    const path = request.url ?? '/';
    if (path === '/health/live' || path === '/health/ready') {
      const healthy = path === '/health/live' ? !stopping : await ready();
      sendHealth(response, request.method, healthy);
      return;
    }
    sendAsset(request, response, options.assets.get(path));
  }
  const listener = (request: IncomingMessage, response: ServerResponse) => {
    void handle(request, response).catch(() => {
      if (response.headersSent) response.destroy();
      else response.writeHead(503).end();
    });
  };
  const server = options.tls
    ? createTlsServer(
        { ...options.tls, maxHeaderSize: 8192, minVersion: 'TLSv1.2' },
        listener,
      )
    : createServer({ maxHeaderSize: 8192 }, listener);
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;
  server.maxConnections = 32;
  server.maxHeadersCount = 32;
  server.maxRequestsPerSocket = 32;
  return {
    server,
    async close(): Promise<void> {
      stopping = true;
      options.account?.close();
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => server.closeAllConnections(), 5_000);
        timeout.unref();
        server.close((error) => {
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve();
        });
        server.closeIdleConnections();
      });
    },
  };
}
