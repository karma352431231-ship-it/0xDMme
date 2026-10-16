import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { validatePushToken } from './client.ts';
import { pushDispatch } from './protocol.ts';
import { sendPush } from './network.ts';
import type { PushConfiguration } from './network.ts';
import { PushSendBudget } from './admission.ts';

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
  const budget = new PushSendBudget();
  const send = options.send ?? sendPush;
  function admission(request: IncomingMessage): number {
    if (!authorized(request, options.token)) return 401;
    if (request.method !== 'POST' || request.url !== '/send') return 404;
    if (request.headers['x-push-key'] !== options.config.publicKey) return 503;
    return 0;
  }
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const status = admission(request);
    if (status) return reply(response, status);
    const release = budget.take();
    if (!release) return reply(response, 429);
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
      release();
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
  server.timeout = 8000;
  server.keepAliveTimeout = 1000;
  return server;
}
