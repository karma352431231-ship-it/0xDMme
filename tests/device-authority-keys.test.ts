import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthorityKeys } from '../src/client/devices/authority-keys.ts';

const secret = Buffer.alloc(32, 7).toString('base64');
await test('epoch imports coalesce only inside their authorized turn and retain non-exportable keys', async () => {
  let reads = 0;
  const keys = new AuthorityKeys(
    () => {
      reads++;
      return secret;
    },
    () => {},
  );
  const [first, second] = await Promise.all([keys.key(1), keys.key(1)]);
  assert.equal(first, second);
  assert.equal(first.extractable, false);
  assert.equal(reads, 1);
  assert.notEqual(await keys.key(2), first);
  for (let epoch = 3; epoch <= 33; epoch++) await keys.key(epoch);
  assert.notEqual(await keys.key(1), first, 'The import cache is bounded.');
  keys.dispose();
  await assert.rejects(keys.key(1), /Authority turn ended/);
  const next = new AuthorityKeys(
    () => secret,
    () => {},
  );
  assert.notEqual(await next.key(1), first);
  next.dispose();
});

for (const change of ['session', 'dispose'] as const)
  await test(`an in-flight import rejects a ${change} change before returning its key`, async () => {
    let valid = true;
    const keys = new AuthorityKeys(
      () => secret,
      () => {
        if (!valid) throw new Error('Session changed.');
      },
    );
    const opening = keys.key(1);
    if (change === 'session') valid = false;
    else keys.dispose();
    await assert.rejects(opening, /Session changed|Authority turn ended/);
    await assert.rejects(keys.key(1), /Session changed|Authority turn ended/);
    keys.dispose();
  });
