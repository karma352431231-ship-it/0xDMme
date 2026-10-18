import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { CallTransport } from '../src/client/calls/transport.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
function fixture(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  let reads = 0,
    rejected = false;
  const requests: Record<string, unknown>[] = [];
  const authority: VaultAuthority = {
    session: {
      accountId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      csrf: 'a'.repeat(64),
    },
    directory: 'a'.repeat(64),
    epoch: 1,
    events: [],
    offline: false,
    key: () => {
      throw new Error('Content key must never be requested.');
    },
    openSecret: () => {
      throw new Error('Wrapping key must never be requested.');
    },
    sign: () => Promise.resolve('synthetic-signature'),
  };
  const access: VaultAccess = {
    withVault: (offline, work) => {
      assert.equal(offline, false);
      reads++;
      return work(authority);
    },
    withLocalVault: () => {
      throw new Error('Offline signing is forbidden.');
    },
  };
  t.mock.method(globalThis, 'fetch', (_url: unknown, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get('X-0xdmme-Call-Invite'), '1');
    assert.ok(typeof options.body === 'string');
    requests.push(JSON.parse(options.body) as Record<string, unknown>);
    return Promise.resolve(
      rejected
        ? Response.json({ error: 'Forbidden' }, { status: 403 })
        : Response.json({ status: 'ok' }),
    );
  });
  return {
    transport: new CallTransport(access),
    requests,
    reads: () => reads,
    reject: () => {
      rejected = true;
    },
  };
}
await test('call signing reuses only a bounded online capability, preserves counters and refreshes at expiry/reset', async (t) => {
  const f = fixture(t);
  await Promise.all([
    f.transport.request('sync', {}),
    f.transport.request('start', {}),
    f.transport.request('end', {}),
  ]);
  assert.equal(f.reads(), 1);
  assert.deepEqual(
    f.requests.map((r) => (r['payload'] as Record<string, unknown>)['request']),
    [1, 2, 3],
  );
  t.mock.timers.tick(19999);
  await f.transport.request('sync', {});
  assert.equal(f.reads(), 1);
  t.mock.timers.tick(1);
  await f.transport.request('sync', {});
  assert.equal(f.reads(), 2);
  const previous = f.requests.at(-1)?.['payload'] as Record<string, unknown>;
  f.transport.reset();
  await f.transport.request('sync', {});
  assert.equal(f.reads(), 3);
  const current = f.requests.at(-1)?.['payload'] as Record<string, unknown>;
  assert.notEqual(current['channel'], previous['channel']);
  assert.equal(current['request'], 1);
});
await test('server revocation rejects cached signing and forces a fresh authority read', async (t) => {
  const f = fixture(t);
  await f.transport.request('sync', {});
  f.reject();
  await assert.rejects(f.transport.request('start', {}));
  assert.equal(f.reads(), 1);
  await assert.rejects(f.transport.request('sync', {}));
  assert.equal(f.reads(), 2);
});
