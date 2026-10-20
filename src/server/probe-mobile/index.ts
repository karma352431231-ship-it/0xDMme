import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';

export type MobileListener = {
  address: string;
  cert: Buffer;
  key: Buffer;
  accessToken: string;
};

function privateIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [first, second] = address.split('.').map(Number);
  if (first === 10) return true;
  if (first === 192) return second === 168;
  return first === 172 && second !== undefined && second >= 16 && second <= 31;
}

/** Explicit private LAN; never turns the lab into a public listener. */
export function mobileOrigin(port: number, mobile: MobileListener): string {
  if (!privateIPv4(mobile.address))
    throw new Error(
      'The mobile listener requires a private-network IPv4 address.',
    );
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid mobile port.');
  if (!/^[A-Za-z0-9_-]{43}$/u.test(mobile.accessToken))
    throw new Error('Invalid temporary token.');
  return `https://${mobile.address}:${port}`;
}

export function allowedProbeOrigin(
  request: IncomingMessage,
  origin: string,
): boolean {
  return (
    request.headers.host === new URL(origin).host &&
    (request.headers.origin === undefined ||
      request.headers.origin === origin) &&
    request.headers['sec-fetch-site'] !== 'cross-site'
  );
}

/** HttpOnly cookie also covers assets and synthetic API tokens. */
export function authorizeMobile(
  request: IncomingMessage,
  response: ServerResponse,
  accessToken: string,
): boolean {
  const entryPath = ['/', '/vault.html', '/zk.html'].find(
    (path) => request.url === `${path}?access=${accessToken}`,
  );
  if (request.method === 'GET' && entryPath) {
    response.writeHead(303, {
      Location: entryPath,
      'Set-Cookie': `__Host-hash-talk-probe=${accessToken}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=7200`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    response.end();
    return false;
  }
  const cookies = (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim());
  return cookies.includes(`__Host-hash-talk-probe=${accessToken}`);
}

/** HTTP bootstrap serves only the public certificate, without assets or API. */
export function serveMobileCertificate(address: string, certificate: Buffer) {
  if (!privateIPv4(address))
    throw new Error('Bootstrap requires a private network.');
  const port = 45103;
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (
      request.headers.host !== `${address}:${port}` ||
      request.method !== 'GET' ||
      request.url !== '/hash-talk-test.cer'
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'application/x-x509-ca-cert',
      'Content-Disposition': 'attachment; filename="hash-talk-test.cer"',
      'Content-Length': certificate.length,
    });
    response.end(certificate);
  });
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;
  server.maxConnections = 2;
  server.maxHeadersCount = 10;
  server.listen(port, address);
  return server;
}
