import { timingSafeEqual } from 'node:crypto';
import type { RequestListener, Server } from 'node:http';

const header = 'x-0xdmme-synthetic-admission';

function validToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === 64 &&
    /^[a-f0-9]{64}$/u.test(value)
  );
}

function admitted(value: unknown, expected: Buffer): boolean {
  return validToken(value) && timingSafeEqual(Buffer.from(value), expected);
}

/** Protects one explicitly owned fixture request handler before LAN exposure.
 * The existing server still owns sockets, timeouts, resources and shutdown.
 * This extra test gate never substitutes for real account/device authorization.
 */
export function protectNativePhysicalFixture(
  server: Pick<Server, 'listeners' | 'removeListener' | 'on'>,
  token: string,
): void {
  if (!validToken(token))
    throw new Error('Invalid physical fixture admission.');
  const listeners = server.listeners('request');
  const candidate: unknown = listeners[0];
  if (listeners.length !== 1 || typeof candidate !== 'function')
    throw new Error('Physical admission requires one owned request handler.');
  // Node's generic EventEmitter API erases the event's listener type. This is
  // our own HTTP server's sole request handler, checked before replacement.
  const original = candidate as RequestListener;
  const expected = Buffer.from(token);
  server.removeListener('request', original);
  server.on('request', (request, response) => {
    if (!admitted(request.headers[header], expected)) {
      response.writeHead(403, { connection: 'close', 'content-length': '0' });
      response.once('finish', () => request.destroy());
      response.end();
      return;
    }
    delete request.headers[header];
    request.rawHeaders = request.rawHeaders.filter(
      (_, index, values) =>
        (index % 2 === 0 ? values[index] : values[index - 1])?.toLowerCase() !==
        header,
    );
    original(request, response);
  });
}
