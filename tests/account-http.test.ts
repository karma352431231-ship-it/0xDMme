import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import { accountHttpFixture } from './fixtures/account-http.ts';

await test('origin rejection and attachment preflight happen before consuming upload bytes', async (t) => {
  const f = accountHttpFixture(t);
  const origin = f.request('messages/attachment-part', null);
  origin.incoming.headers.origin = 'https://other.invalid';
  await origin.run();
  assert.equal(origin.response.statusCode, 403);
  assert.equal(origin.incoming.readableFlowing, null);
  t.mock.method(f.messages, 'preflightAttachment', () =>
    Promise.reject(new AccountError(403, 'Synthetic attachment denial.')),
  );
  const denied = f.request('messages/attachment-part', null);
  await denied.run();
  assert.equal(denied.response.statusCode, 403);
  assert.equal(denied.incoming.readableFlowing, null);
  assert.deepEqual(f.data.operations, []);
});

await test('ambiguous session cookies cannot bypass authorization or consume an attachment body', async (t) => {
  const f = accountHttpFixture(t),
    r = f.request('messages/attachment-part', null);
  r.incoming.headers.cookie += '; ' + r.incoming.headers.cookie;
  await r.run();
  assert.equal(r.response.statusCode, 401);
  assert.equal(r.incoming.readableFlowing, null);
  assert.deepEqual(f.data.operations, []);
});

for (const [route, maximum] of [
  ['calls/offer', 365_000],
  ['calls/sync', 16_000],
  ['messages/dm-attachment-reserve', 12_000],
  ['messages/snapshot', 4096],
] as const)
  await test(`route body byte budget is exact for ${route}`, async (t) => {
    const f = accountHttpFixture(t);
    for (const size of [maximum, maximum + 1]) {
      const r = f.request(route, '"' + 'a'.repeat(size - 2) + '"');
      await r.run();
      assert.equal(r.response.statusCode, size === maximum ? 200 : 413);
    }
    assert.equal(f.data.operations.length, 1);
  });

await test('a stalled JSON body is destroyed at its deadline and a later request still succeeds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = accountHttpFixture(t),
    r = f.request('calls/sync', null);
  const reading = r.run();
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.tick(5000);
  await reading;
  assert.equal(r.incoming.destroyed, true);
  assert.equal(r.response.statusCode, 503);
  const next = f.request('calls/sync');
  await next.run();
  assert.equal(next.response.statusCode, 200);
  assert.deepEqual(f.data.operations, ['sync']);
});

await test('successful and invalid JSON reads release their body deadline timers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = accountHttpFixture(t);
  for (const [body, status] of [
    ['{}', 200],
    ['{', 400],
  ] as const) {
    const r = f.request('calls/sync', body);
    const destroy = t.mock.method(r.incoming, 'destroy');
    await r.run();
    assert.equal(r.response.statusCode, status);
    const completed = destroy.mock.callCount();
    t.mock.timers.tick(5000);
    assert.equal(destroy.mock.callCount(), completed);
  }
});

await test('closing the HTTP handler removes pending enrollment invitations', async (t) => {
  const f = accountHttpFixture(t);
  t.mock.method(f.devices, 'enrollmentSource', () => Promise.resolve());
  t.mock.method(f.devices, 'assertEnrollmentSource', () => Promise.resolve());
  const input = {
    id: crypto.randomUUID(),
    codeHash: 'a'.repeat(64),
    root: 'b'.repeat(64),
    head: 'c'.repeat(64),
    expiresAt: new Date(Date.now() + 299_000).toISOString(),
    signature: 'd'.repeat(64),
  };
  const created = f.request('devices/enrollment-create', JSON.stringify(input));
  await created.run();
  assert.equal(created.response.statusCode, 200);
  const pending = () =>
    f.request('devices/enrollment-pending', JSON.stringify({ id: input.id }));
  const before = pending();
  await before.run();
  assert.equal(before.response.statusCode, 200);
  assert.equal(before.response.content, 'null');
  f.handler.close();
  const after = pending();
  await after.run();
  assert.equal(after.response.statusCode, 409);
});
