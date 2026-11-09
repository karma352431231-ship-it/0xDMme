import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { MessageOutbox } from '../src/client/messages/outbox.ts';
import { recordDatabase } from './fixtures/record-database.ts';
import { deferred } from './fixtures/deferred.ts';
import {
  enqueueOutbox,
  enqueueOutboxBatch,
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
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import type { LocalCipher } from '../src/client/message-storage/index.ts';

function installStorage(t: TestContext): void {
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
}

await test('encrypted outbox commits FIFO order atomically, survives reopening, retries without replacing packets and removes its quota/index together', async (t) => {
  installStorage(t);
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
    /Recording|storage/u,
  );
  await assert.rejects(
    enqueueOutbox({
      scope,
      id: 'over-budget',
      value: {},
      size: vaultQuota,
      current: () => true,
    }),
    /Recording|storage/u,
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

await test('private text admission seals locally without online authority and cannot save after session replacement', async (t) => {
  installStorage(t);
  const session = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'synthetic',
  } as AccountSession;
  const secret = newSecret();
  const keyStarted = deferred<void>();
  const releaseKey = deferred<void>();
  let holdKey = false;
  let generation = 0;
  const local: VaultAuthority = {
    session: { ...session, csrf: '' },
    offline: true,
    directory: 'a'.repeat(64),
    epoch: 1,
    events: [],
    key: async () => {
      if (holdKey) {
        keyStarted.resolve();
        await releaseKey.promise;
      }
      return aesKey(secret);
    },
    sign: () => Promise.reject(new Error('Admission must not sign.')),
  };
  const access: VaultAccess = {
    withVault: () => Promise.reject(new Error('Online authority unavailable.')),
    withLocalVault: (locator, work) => {
      assert.deepEqual(locator, {
        accountId: session.accountId,
        deviceId: session.deviceId,
      });
      return work(local);
    },
  };
  const outbox = new MessageOutbox({
    access,
    authority: {
      session: () => session,
      current: () => generation,
      guard: (expected) => {
        if (expected !== generation) throw new Error('Session changed.');
      },
      pinsLoaded: () => false,
      loadPins: () =>
        Promise.reject(new Error('No pin reads during admission.')),
      savePins: () =>
        Promise.reject(new Error('No pin writes during admission.')),
      history: () =>
        Promise.reject(new Error('No peer reads during admission.')),
      encryption: () => Promise.reject(new Error('No SDK during admission.')),
    },
    published: () => assert.fail('Admission cannot publish.'),
  });
  const draft = {
    id: crypto.randomUUID(),
    peer: crypto.randomUUID(),
    text: 'Local synthetic draft',
  };
  await outbox.queueText(draft);
  const [saved] = await outboxPage<{ draft: LocalCipher[]; peer: string }>(
    session.accountId,
  );
  assert.equal(saved?.value.peer, draft.peer);
  assert.equal(await openLocal(local, saved.value.draft[0]!), draft.text);
  assert.ok(!JSON.stringify(saved).includes(draft.text));

  holdKey = true;
  const discarded = { ...draft, id: crypto.randomUUID() };
  const pending = outbox.queueText(discarded);
  await keyStarted.promise;
  generation++;
  releaseKey.resolve();
  await assert.rejects(pending, /Session changed/u);
  assert.equal(
    await localGet(session.accountId, `outbox:${discarded.id}`),
    null,
  );
});

await test('a view-once text/file pair is admitted atomically, preserves FIFO on retry and cannot consume only half the quota', async (t) => {
  installStorage(t);
  const scope = crypto.randomUUID();
  const entries = ['text', 'file'].map((id) => ({
    id,
    value: { id },
    size: 512,
  }));
  await localPut(scope, 'pressure', null, vaultQuota - 800);
  await assert.rejects(
    enqueueOutboxBatch({ scope, entries, current: () => true }),
  );
  assert.deepEqual(await outboxPage(scope), []);
  await localDelete(scope, 'pressure');
  await enqueueOutboxBatch({ scope, entries, current: () => true });
  const used = await localGet(scope, 'usage');
  await enqueueOutboxBatch({ scope, entries, current: () => true });
  assert.equal(await localGet(scope, 'usage'), used);
  assert.deepEqual(
    (await outboxPage<{ id: string }>(scope)).map((x) => x.value.id),
    ['text', 'file'],
  );
  await assert.rejects(
    enqueueOutboxBatch({
      scope,
      entries: entries.map((x) => ({ ...x, id: x.id + 'cancelled' })),
      current: () => false,
    }),
  );
  assert.equal((await outboxPage(scope)).length, 2);
});
