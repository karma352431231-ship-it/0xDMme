import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Database } from '../database/index.ts';
import type { ObjectStore } from '../object-store/index.ts';
import { recoveryEntry } from '../../shared/wallet-recovery/index.ts';
import {
  approvalDocumentUrl,
  approvalEntryUrl,
} from '../../shared/wallet-approval/index.ts';

export interface WebAsset {
  content: Uint8Array;
  type: string;
  etag?: string;
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
  if (!Array.isArray(manifest) || manifest.length > 38)
    throw new Error('Build inválido.');
  const assets = new Map<string, WebAsset>();
  for (const value of manifest as unknown[]) {
    const entry = assetEntry(value);
    const content = await readFile(new URL(entry.path.slice(1), root));
    const maximum =
      entry.path === '/matrix-crypto-18.9.0.wasm'
        ? 8 * 1024 * 1024
        : 2 * 1024 * 1024;
    if (content.length > maximum) throw new Error('Asset excedido.');
    assets.set(entry.path === '/index.html' ? '/' : entry.path, {
      content,
      type: entry.type,
      etag: `"${createHash('sha256').update(content).digest('hex')}"`,
    });
  }
  if (!assets.has('/') || !assets.has('/sw.js'))
    throw new Error('Build incompleto.');
  return assets;
}

function securityHeaders(
  response: ServerResponse,
  scriptSources = "'self'",
): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; script-src ${scriptSources}; style-src 'self'; img-src 'self' blob:; media-src blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
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

function sendPublicAsset(
  request: IncomingMessage,
  response: ServerResponse,
  assets: ReadonlyMap<string, WebAsset>,
): void {
  const nativeProbe = nativeProbeRequest(request);
  const appShell = appShellRequest(request);
  const entry = assets.get(publicAssetPath(request));
  // Only the app (Matrix) and the admitted NaCl probe need WebAssembly.
  // Errors, APIs and wallet approval retain the default policy.
  if ((nativeProbe || appShell) && entry?.type.startsWith('text/html'))
    securityHeaders(response, "'self' 'wasm-unsafe-eval'");
  if (appShell && entry?.type.startsWith('text/html'))
    response.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(self), geolocation=(), payment=()',
    );
  attachmentWorkerPolicy(request, response, entry);
  sendAsset(request, response, entry);
}

function appShellRequest(request: IncomingMessage): boolean {
  // This fixed public entry bypasses old offline shells without clearing keys.
  // Other query strings remain outside the public asset allowlist.
  return request.url === '/' || request.url === '/?atualizar=1';
}

function publicAssetPath(request: IncomingMessage): string {
  if (appShellRequest(request)) return '/';
  if (nativeProbeRequest(request)) return '/phantom-probe.html';
  return request.url ?? '/';
}

function attachmentWorkerPolicy(
  request: IncomingMessage,
  response: ServerResponse,
  entry: WebAsset | undefined,
): void {
  if (
    /^\/attachment-worker-[a-f0-9]{16}\.js$/u.test(request.url ?? '') &&
    entry
  )
    securityHeaders(response, "'self' 'wasm-unsafe-eval'");
}
function publicNavigation(request: IncomingMessage): boolean {
  // A wallet's browse link may navigate from another site. Only the public
  // shell can be opened this way; account APIs and mutations remain protected.
  return (
    request.method === 'GET' &&
    (appShellRequest(request) ||
      request.url === '/wallet.html' ||
      nativeProbeRequest(request) ||
      recoveryEntry(request.url) !== null ||
      approvalEntry(request)) &&
    request.headers['sec-fetch-mode'] === 'navigate' &&
    request.headers['sec-fetch-dest'] === 'document'
  );
}

function nativeProbeRequest(request: IncomingMessage): boolean {
  const raw = request.url ?? '';
  return (
    raw.length <= 6144 &&
    (raw === '/phantom-probe.html' || raw.startsWith('/phantom-probe.html?'))
  );
}

function approvalEntry(request: IncomingMessage): boolean {
  return approvalEntryUrl(request.url) || approvalDocumentUrl(request.url);
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
function accountRequest(request: IncomingMessage): boolean {
  return (
    request.url?.startsWith('/api/account/') === true ||
    approvalEntry(request) ||
    recoveryEntry(request.url) !== null
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
  if (asset.etag) {
    response.setHeader('ETag', asset.etag);
    if (request.headers['if-none-match'] === asset.etag) {
      response.writeHead(304).end();
      return;
    }
  }
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
  publicProfiles?: {
    handle: (
      request: IncomingMessage,
      response: ServerResponse,
    ) => Promise<void>;
    close: () => void;
  };
  publicMedia?: {
    handle: (
      request: IncomingMessage,
      response: ServerResponse,
    ) => Promise<void>;
    close: () => void;
  };
  communities?: {
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
    const publicHandler = publicDataHandler(request);
    if (publicHandler) {
      if (stopping) response.writeHead(503).end();
      else await publicHandler.handle(request, response);
      return;
    }
    if (accountRequest(request) && options.account) {
      if (stopping) {
        response.writeHead(503).end();
        return;
      }
      await options.account.handle(request, response);
      return;
    }
    await publicRequest(request, response);
  }
  function publicDataHandler(request: IncomingMessage) {
    if (request.url?.startsWith('/api/public-media/'))
      return options.publicMedia;
    if (request.url?.startsWith('/api/public-profiles/'))
      return options.publicProfiles;
    if (request.url?.startsWith('/api/communities')) return options.communities;
    return undefined;
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
    sendPublicAsset(request, response, options.assets);
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
      options.publicProfiles?.close();
      options.publicMedia?.close();
      options.communities?.close();
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
