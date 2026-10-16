import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

/** TCP peers cannot override their address; the private Unix proxy is explicitly trusted. */
export function clientAddress(input: {
  request: Pick<IncomingMessage, 'socket' | 'headers'>;
  trustUnixProxy: boolean;
}): string {
  const peer = input.request.socket.remoteAddress;
  if (peer) return peer;
  const forwarded = input.request.headers['x-0xdmme-client-address'];
  if (input.trustUnixProxy && typeof forwarded === 'string' && isIP(forwarded))
    return forwarded;
  // Never collapse unrelated visitors into a shared login bucket.
  throw new Error('Trusted proxy client identity unavailable.');
}
