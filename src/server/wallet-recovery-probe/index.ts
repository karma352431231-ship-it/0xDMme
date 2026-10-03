import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { allowedProbeOrigin } from '../probe-mobile/index.ts';

const root = new URL('../../../', import.meta.url);
async function bundle(path: string): Promise<Uint8Array> {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, root))],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: ['safari16.4', 'chrome111'],
    write: false,
    logLevel: 'silent',
    legalComments: 'inline',
  });
  const bytes = result.outputFiles[0]?.contents;
  if (!bytes || bytes.length > 1024 * 1024)
    throw new Error('Build do ensaio ausente ou excedido.');
  return bytes;
}
function headers(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
}
export async function startWalletRecoveryProbe(
  input: {
    port?: number;
    synthetic?: boolean;
  } = {},
) {
  const port = input.port ?? 45107;
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Porta do ensaio inválida.');
  const page = await bundle('src/client/wallet-recovery-probe/page.ts');
  const fixture = input.synthetic
    ? await bundle('tests/fixtures/wallet-recovery-probe-browser.ts')
    : null;
  const html = (
    await readFile(
      new URL('src/client/wallet-recovery-probe/lab.html', root),
      'utf8',
    )
  ).replace('{{SCRIPT}}', fixture ? '/fixture.js' : '/probe.js');
  const assets = new Map([
    ['/', { type: 'text/html; charset=utf-8', bytes: Buffer.from(html) }],
    [
      '/probe.js',
      { type: 'text/javascript; charset=utf-8', bytes: Buffer.from(page) },
    ],
    [
      '/probe.css',
      {
        type: 'text/css; charset=utf-8',
        bytes: await readFile(
          new URL('src/client/crypto-probe/probe.css', root),
        ),
      },
    ],
  ]);
  if (fixture)
    assets.set('/fixture.js', {
      type: 'text/javascript; charset=utf-8',
      bytes: Buffer.from(fixture),
    });
  const server = createServer((request, response) => {
    headers(response);
    const address = server.address();
    if (!address || typeof address === 'string') {
      response.writeHead(503);
      response.end();
      return;
    }
    const origin = `http://127.0.0.1:${address.port}`;
    if (!allowedProbeOrigin(request, origin)) {
      response.writeHead(403);
      response.end();
      return;
    }
    const asset = assets.get(request.url ?? '');
    if (request.method !== 'GET' || !asset) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': asset.type,
      'Content-Length': asset.bytes.length,
    });
    response.end(asset.bytes);
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxConnections = 4;
  server.maxHeadersCount = 20;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const expiry = setTimeout(() => {
    server.close();
    server.closeAllConnections();
  }, 30 * 60_000);
  expiry.unref();
  server.once('close', () => clearTimeout(expiry));
  return server;
}
