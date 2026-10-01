import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mobileWebAddress } from '../src/server/web-mobile/index.ts';

await test('base web mobile recusa endereços públicos, hosts, wildcard e IPv6', () => {
  for (const address of [
    '0.0.0.0',
    '127.0.0.1',
    '8.8.8.8',
    '172.15.0.1',
    '172.32.0.1',
    '192.0.2.1',
    '::1',
    'example.org',
  ])
    assert.throws(() => mobileWebAddress(address));
  for (const address of [
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.0.1',
  ])
    assert.equal(mobileWebAddress(address), address);
});
