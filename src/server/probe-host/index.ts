import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import ts from 'typescript';
import { build } from 'esbuild';
import {
  isOperation,
  isRole,
  maxBodyBytes,
} from '../../shared/crypto-probe/index.ts';
import { ProbeRelay } from '../crypto-probe/index.ts';
import { readArtifact } from '../zk-artifacts/index.ts';

const importMap =
  '{"imports":{"@matrix-org/matrix-sdk-crypto-wasm":"/vendor/index.mjs"}}';
const mapHash = createHash('sha256').update(importMap).digest('base64');
const root = new URL('../../../', import.meta.url);
const assets = new Map([
  ['/', ['src/client/crypto-probe/lab.html', 'text/html']],
  ['/client.html', ['src/client/crypto-probe/client.html', 'text/html']],
  ['/probe.css', ['src/client/crypto-probe/probe.css', 'text/css']],
  ['/vault.html', ['src/client/vault-probe/vault.html', 'text/html']],
  ['/zk.html', ['src/client/zk-probe/zk.html', 'text/html']],
  ...[
    'src/client/probe.ts',
    'src/client/crypto-probe/index.ts',
    'src/shared/crypto-probe/index.ts',
    'src/client/probe-ui/index.ts',
    'src/client/probe-transport/index.ts',
    'src/client/vault.ts',
    'src/client/vault-probe/index.ts',
    'src/shared/vault-probe/index.ts',
    'src/client/zk.ts',
  ].map((path) => [`/${path}`, [path, 'text/javascript']]),
  ...[
    'index.mjs',
    'pkg/matrix_sdk_crypto_wasm_bg.js',
    'pkg/matrix_sdk_crypto_wasm_bg.wasm',
  ].map((path) => [
    `/vendor/${path}`,
    [
      `node_modules/@matrix-org/matrix-sdk-crypto-wasm/${path}`,
      path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
    ],
  ]),
] as [string, [string, string]][]);
let workerBundle: Promise<Uint8Array> | undefined;

async function zkAsset(
  path: string,
  response: ServerResponse,
): Promise<boolean> {
  if (path === '/zk-worker.js') {
    workerBundle ??= build({
      entryPoints: [fileURLToPath(new URL('src/client/zk-worker.ts', root))],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      target: 'es2023',
      write: false,
      logLevel: 'silent',
      legalComments: 'inline',
    }).then((result) => {
      const output = result.outputFiles[0];
      if (!output) throw new Error('Bundle ZK ausente.');
      return output.contents;
    });
    const content = await workerBundle;
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(content);
    return true;
  }
  if (path !== '/zk/semaphore-4.wasm' && path !== '/zk/semaphore-4.zkey')
    return false;
  const name =
    path === '/zk/semaphore-4.wasm' ? 'semaphore-4.wasm' : 'semaphore-4.zkey';
  const bytes = await readArtifact(name);
  response.writeHead(200, {
    'Content-Type': name.endsWith('.wasm')
      ? 'application/wasm'
      : 'application/octet-stream',
  });
  response.end(bytes);
  return true;
}
function allowedOrigin(request: IncomingMessage, port: number): boolean {
  return (
    request.headers.host === `127.0.0.1:${port}` &&
    (request.headers.origin === undefined ||
      request.headers.origin === `http://127.0.0.1:${port}`) &&
    request.headers['sec-fetch-site'] !== 'cross-site'
  );
}

function postRoute(request: IncomingMessage) {
  const parts = (request.url ?? '').split('/');
  const [, api, role, operation] = parts;
  if (
    request.method !== 'POST' ||
    parts.length !== 4 ||
    api !== 'api' ||
    !isRole(role) ||
    !isOperation(operation)
  ) {
    return undefined;
  }
  return { role, operation };
}

function headers(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'sha256-${mapHash}'; worker-src 'self' blob:; style-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`,
  );
}

function json(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(body);
}

async function body(request: IncomingMessage): Promise<string> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    bytes += buffer.length;
    if (bytes > maxBodyBytes) throw new Error('Entrada excedida.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function asset(path: string, response: ServerResponse): Promise<boolean> {
  const entry = assets.get(path);
  if (!entry) return false;
  const [file, type] = entry;
  let content: Buffer | string = await readFile(new URL(file, root));
  if (file.endsWith('.ts')) {
    content = ts.transpileModule(content.toString(), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
  }
  if (file.endsWith('.html'))
    // Canonicalizar só o conteúdo do importmap para manter seu hash CSP após formatação.
    content = content
      .toString()
      .replace(/\s*\{\{IMPORT_MAP\}\}\s*/u, importMap);
  response.writeHead(200, { 'Content-Type': type });
  response.end(content);
  return true;
}

export function startProbe(port = 45101) {
  const relay = new ProbeRelay();
  const tokens = { alice: randomUUID(), bob: randomUUID() };
  const origin = `http://127.0.0.1:${port}`;

  async function get(path: string, response: ServerResponse): Promise<boolean> {
    if (path === '/api/config') {
      json(response, 200, JSON.stringify(tokens));
      return true;
    }
    if (path === '/api/inspect') {
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(relay.inspect());
      return true;
    }
    if (await zkAsset(path, response)) return true;
    return asset(path, response);
  }

  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    headers(response);
    if (!allowedOrigin(request, port)) {
      json(response, 403, '{"error":"Origem não permitida."}');
      return;
    }
    const path = request.url ?? '/';
    if (request.method === 'GET' && (await get(path, response))) return;
    const route = postRoute(request);
    if (!route) {
      json(response, 404, '{"error":"Rota não disponível."}');
      return;
    }
    if (
      request.headers.authorization !== `Bearer ${tokens[route.role]}` ||
      request.headers['content-type'] !== 'application/json'
    ) {
      json(response, 403, '{"error":"Pedido não permitido."}');
      return;
    }
    json(
      response,
      200,
      relay.dispatch(route.role, route.operation, await body(request)),
    );
  }

  const server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      if (!response.headersSent)
        json(response, 400, '{"error":"Operação rejeitada pelo laboratório."}');
      else response.destroy();
    });
  });
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;
  server.maxConnections = 8;
  server.maxHeadersCount = 20;
  server.on('error', () => {
    process.stderr.write('Não foi possível iniciar o laboratório local.\n');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () =>
    process.stdout.write(`Laboratório sintético: ${origin}\n`),
  );
  const shutdown = () => {
    server.close();
    server.closeAllConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}
