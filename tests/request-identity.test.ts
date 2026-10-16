import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { clientAddress } from '../src/server/request-identity/index.ts';
import { AccountRateLimit } from '../src/server/account/rate-limit.ts';

function request(
  peer: string | undefined,
  forwarded: string | string[] | undefined,
) {
  const socket = new Socket();
  Object.defineProperty(socket, 'remoteAddress', { value: peer });
  const message = new IncomingMessage(socket);
  if (forwarded !== undefined)
    message.headers['x-0xdmme-client-address'] = forwarded;
  return message;
}

await test('TCP client identity cannot be replaced by a forged proxy header', () => {
  for (const trustUnixProxy of [false, true])
    assert.equal(
      clientAddress({
        request: request('127.0.0.1', '198.51.100.1'),
        trustUnixProxy,
      }),
      '127.0.0.1',
    );
});

await test('only an explicitly trusted Unix proxy may identify a client', () => {
  for (const address of ['198.51.100.1', '2001:db8::1'])
    assert.equal(
      clientAddress({
        request: request(undefined, address),
        trustUnixProxy: true,
      }),
      address,
    );
  for (const forwarded of [
    undefined,
    '',
    'unknown',
    '198.51.100.1, 198.51.100.2',
    ['198.51.100.1'],
  ])
    assert.throws(() =>
      clientAddress({
        request: request(undefined, forwarded),
        trustUnixProxy: true,
      }),
    );
  assert.throws(() =>
    clientAddress({
      request: request(undefined, '198.51.100.1'),
      trustUnixProxy: false,
    }),
  );
});

await test('login protection stays per client behind the Unix proxy', () => {
  const limit = new AccountRateLimit({ requests: null });
  const admit = (address: string) =>
    limit.admit(
      clientAddress({
        request: request(undefined, address),
        trustUnixProxy: true,
      }),
      true,
    );
  try {
    for (let i = 0; i < 6; i++) admit('198.51.100.1');
    assert.throws(() => admit('198.51.100.1'), { status: 429 });
    assert.doesNotThrow(() => admit('198.51.100.2'));
  } finally {
    limit.close();
  }
});
