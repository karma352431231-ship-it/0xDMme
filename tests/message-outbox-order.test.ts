import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordDatabase } from './fixtures/record-database.ts';
import {
  enqueueOutbox,
  outboxPage,
  removeOutbox,
  localGet,
  localDelete,
  localPut,
  sealLocal,
  openLocal,
} from '../src/client/message-storage/index.ts';
import { aesKey, newSecret } from '../src/client/device-keys/index.ts';
import { vaultQuota } from '../src/shared/vault/index.ts';
import type { VaultAuthority } from '../src/client/vault-authority/index.ts';
import type { LocalCipher } from '../src/client/message-storage/index.ts';

await test('encrypted outbox commits FIFO order atomically, survives reopening, retries without replacing packets and removes its quota/index together', async (t) => {
  const db = recordDatabase();
  const previous = ['indexedDB', 'IDBKeyRange'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: db.factory,
  });
  Object.defineProperty(globalThis, 'IDBKeyRange', {
    configurable: true,
    value: db.range,
  });
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const secret = newSecret(),
    scope = crypto.randomUUID(),
    ids = [
      'z-last-lexically',
      'a-first-lexically',
      ...Array.from({ length: 18 }, () => crypto.randomUUID()),
    ];
  const authority: VaultAuthority = {
    session: { accountId: scope, deviceId: crypto.randomUUID(), csrf: '' },
    offline: true,
    directory: 'a'.repeat(64),
    epoch: 1,
    events: [],
    key: () => aesKey(secret),
    sign: () => Promise.reject(new Error('No network in this storage test.')),
  };
  const cipher = await sealLocal(
    authority,
    crypto.randomUUID(),
    'Private synthetic draft',
  );
  const save = (id: string, current = () => true) =>
    enqueueOutbox({
      scope,
      id,
      value: { id, draft: cipher, packet: null },
      size: cipher.bytes.length + 512,
      current,
    });
  for (const id of ids) await save(id);
  const page = await outboxPage<{ id: string; draft: LocalCipher }>(scope);
  assert.deepEqual(
    page.map((item) => item.value.id),
    ids.slice(0, 16),
  );
  assert.equal(
    await openLocal(authority, page[0]!.value.draft),
    'Private synthetic draft',
  );
  assert.ok(!JSON.stringify(page).includes('Private synthetic draft'));
  const used = await localGet<number>(scope, 'usage');
  await save(ids[0]!);
  assert.equal(await localGet(scope, 'usage'), used);
  assert.deepEqual(
    (await outboxPage<{ id: string }>(scope)).map((item) => item.value.id),
    ids.slice(0, 16),
  );
  await assert.rejects(
    save('cancelled', () => false),
    /Gravação/u,
  );
  await assert.rejects(
    enqueueOutbox({
      scope,
      id: 'over-budget',
      value: {},
      size: vaultQuota,
      current: () => true,
    }),
    /Gravação/u,
  );
  assert.equal(await localGet(scope, 'outbox:cancelled'), null);
  assert.equal(await localGet(scope, 'outbox:over-budget'), null);
  assert.equal(await localGet(scope, 'usage'), used);
  const targets = page.map((item) => item.name);
  await save('later-peer');
  assert.deepEqual(
    (await outboxPage<{ id: string }>(scope, targets)).map(
      (item) => item.value.id,
    ),
    ids.slice(0, 16),
  );
  for (const id of [...ids, 'later-peer'])
    await removeOutbox(scope, `outbox:${id}`);
  assert.deepEqual(await outboxPage(scope), []);
  assert.equal(await localGet(scope, 'usage'), 0);
  await localPut(scope, 'outbox:legacy', { id: 'legacy', draft: cipher }, 512);
  assert.equal(
    (await outboxPage<{ id: string }>(scope))[0]?.value.id,
    'legacy',
  );
  await removeOutbox(scope, 'outbox:legacy');
  assert.equal(await localGet(scope, 'usage'), 0);
  assert.deepEqual(await outboxPage(crypto.randomUUID()), []);
  const oldTab = crypto.randomUUID();
  for (let n = 0; n < 33; n++) {
    const id = String(n);
    await enqueueOutbox({
      scope: oldTab,
      id,
      value: { id },
      size: 512,
      current: () => true,
    });
    await localDelete(oldTab, `outbox:${id}`);
  }
  await enqueueOutbox({
    scope: oldTab,
    id: 'still-pending',
    value: { id: 'still-pending' },
    size: 512,
    current: () => true,
  });
  assert.deepEqual(
    await outboxPage(oldTab),
    [],
    'Cleanup is limited to one page.',
  );
  assert.deepEqual(await outboxPage(oldTab), []);
  assert.equal(
    (await outboxPage<{ id: string }>(oldTab))[0]?.value.id,
    'still-pending',
  );
  assert.equal(await localGet(oldTab, 'usage'), 640);
  await removeOutbox(oldTab, 'outbox:still-pending');
  assert.equal(await localGet(oldTab, 'usage'), 0);
});
