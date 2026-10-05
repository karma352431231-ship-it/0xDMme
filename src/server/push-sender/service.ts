import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { validatePushToken } from './client.ts';
import { pushDispatch } from './protocol.ts';
import { sendPush } from './network.ts';
import type { PushConfiguration } from './network.ts';

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const value of request) {
    const chunk: Buffer = Buffer.isBuffer(value)
      ? value
      : Buffer.from(String(value));
    length += chunk.length;
    if (length > 4096) throw new Error('Pedido excedido.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
function authorized(request: IncomingMessage, token: string): boolean {
  const candidate = Buffer.from(request.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}
function reply(response: ServerResponse, status: number): void {
  response.writeHead(status, { 'Cache-Control': 'no-store' });
  response.end();
}
/** No SQL, object store, disk queue, diagnostic payloads or arbitrary HTTP proxy. */
export function createPushSender(options: {
  config: PushConfiguration;
  token: string;
  send?: typeof sendPush;
}) {
  validatePushToken(options.token);
  let active = 0,
    requests = 0,
    windowStart = Date.now();
  const send = options.send ?? sendPush;
  function admission(request: IncomingMessage): number {
    if (!authorized(request, options.token)) return 401;
    if (request.method !== 'POST' || request.url !== '/send') return 404;
    if (request.headers['x-push-key'] !== options.config.publicKey) return 503;
    if (Date.now() - windowStart >= 60_000) {
      requests = 0;
      windowStart = Date.now();
    }
    return active >= 4 || ++requests > 600 ? 429 : 0;
  }
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const status = admission(request);
    if (status) return reply(response, status);
    active++;
    try {
      const d = pushDispatch(await body(request));
      await send(d.subscription, options.config, d);
      response.setHeader('X-Push-Key', options.config.publicKey);
      reply(response, 204);
    } catch (error: unknown) {
      const status =
        typeof error === 'object' && error !== null && 'statusCode' in error
          ? Number(error.statusCode)
          : 503;
      reply(response, status === 404 || status === 410 ? status : 503);
    } finally {
      active--;
    }
  }
  const server = createServer(
    { maxHeaderSize: 1024, requestTimeout: 3000, headersTimeout: 3000 },
    (request, response) => {
      void handle(request, response).catch(() => {
        if (!response.headersSent) reply(response, 503);
        else response.destroy();
      });
    },
  );
  server.maxConnections = 8;
  server.timeout = 8000;
  server.keepAliveTimeout = 1000;
  return server;
}
