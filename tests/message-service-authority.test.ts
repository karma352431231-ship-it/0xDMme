import assert from 'node:assert/strict';
import { test } from 'node:test';
import { messageServiceFixture } from './fixtures/message-service.ts';

await test('a current device signature reaches the representative domain with its authenticated authority', async (t) => {
  const f = await messageServiceFixture(t);
  const result = await f.service.operate(
    'representative-status',
    f.session,
    await f.proof('representative-status'),
  );
  assert.deepEqual(result, { status: 'accepted' });
  assert.equal(f.data.domain, 1);
});

for (const invalid of [
  'operation',
  'payload',
  'device',
  'head',
  'missing-directory',
] as const)
  await test(`representative dispatch rejects ${invalid} before domain work`, async (t) => {
    const f = await messageServiceFixture(t);
    const proof = await f.proof(
      invalid === 'operation'
        ? 'representative-register'
        : 'representative-status',
    );
    if (invalid === 'payload') proof.payload = { modified: true };
    if (invalid === 'device') proof.deviceId = crypto.randomUUID();
    if (invalid === 'head') proof.directory = 'f'.repeat(64);
    if (invalid === 'missing-directory') f.data.current = null;
    await assert.rejects(
      f.service.operate('representative-status', f.session, proof),
    );
    assert.equal(f.data.domain, 0);
  });

await test('delete uses the signed current revision before invoking protected removal', async (t) => {
  const f = await messageServiceFixture(t);
  const remove = t.mock.method(f.db.messages, 'remove', () =>
    Promise.resolve(),
  );
  const payload = {
    id: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    revision: 2,
  };
  await assert.rejects(
    f.service.operate('delete', f.session, await f.proof('delete', payload)),
    { status: 409 },
  );
  assert.equal(remove.mock.callCount(), 0);
  const result = await f.service.operate(
    'delete',
    f.session,
    await f.proof('delete', { ...payload, revision: 1 }),
  );
  assert.deepEqual(result, { status: 'saved' });
  assert.equal(remove.mock.callCount(), 1);
});

await test('prototype properties and unknown operations are unavailable without entering authentication or a domain', async (t) => {
  const f = await messageServiceFixture(t);
  for (const operation of ['__proto__', 'constructor', 'synthetic-unknown'])
    await assert.rejects(f.service.operate(operation, f.session, {}), {
      status: 404,
    });
  assert.equal(f.current.mock.callCount(), 0);
  assert.equal(f.data.domain, 0);
});

await test('live authorization checks the current directory on every validation', async (t) => {
  const f = await messageServiceFixture(t);
  assert.equal(
    await f.service.liveCurrent(f.session, f.participant.head),
    true,
  );
  assert.equal(
    await f.service.liveCurrent(
      { ...f.session, deviceId: crypto.randomUUID() },
      f.participant.head,
    ),
    false,
  );
  assert.equal(await f.service.liveCurrent(f.session, 'b'.repeat(64)), false);
  f.data.current = null;
  assert.equal(
    await f.service.liveCurrent(f.session, f.participant.head),
    false,
  );
});
