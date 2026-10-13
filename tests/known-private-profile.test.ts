import assert from 'node:assert/strict';
import { test } from 'node:test';
import { knownPeerProfile } from '../src/client/messages/known-profile.ts';
import { sealLocal } from '../src/client/message-storage/index.ts';
import type { VaultAuthority } from '../src/client/vault-authority/index.ts';

/** Read-only IDB contract; encrypted card opening uses the real implementation. */
function profileDatabase(records: Map<string, unknown>): IDBFactory {
  return {
    open() {
      const opening = {
        onsuccess: () => {},
        result: {
          close() {},
          transaction() {
            const tx = {
              oncomplete: () => {},
              abort() {},
              objectStore: () => ({
                get(key: string[]) {
                  const request = {
                    result: { value: records.get(JSON.stringify(key)) },
                    onsuccess: () => {},
                  };
                  queueMicrotask(() => {
                    request.onsuccess();
                    tx.oncomplete();
                  });
                  return request;
                },
              }),
            };
            return tx;
          },
        },
      };
      queueMicrotask(() => opening.onsuccess());
      return opening;
    },
  } as unknown as IDBFactory;
}
await test('fotos privadas usam somente cartão recebido na conta atual; ausência e exclusão não expõem foto antiga', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  });
  const records = new Map<string, unknown>();
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: profileDatabase(records),
  });
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const account = crypto.randomUUID(),
    peer = crypto.randomUUID(),
    id = crypto.randomUUID();
  const authority: VaultAuthority = {
    session: {
      accountId: account,
      deviceId: crypto.randomUUID(),
      csrf: 'fixture',
    },
    offline: true,
    directory: '',
    epoch: 1,
    events: [],
    key: () => Promise.resolve(key),
    sign: () => Promise.resolve(''),
  };
  const store = (name: string, value: unknown) =>
    records.set(JSON.stringify([account, name]), value);
  assert.equal(await knownPeerProfile(authority, peer), null);
  const draft = [
    await sealLocal(
      authority,
      id,
      JSON.stringify({ name: 'Perfil privado', revision: 3, photo: null }),
    ),
  ];
  const row = { id, peer, own: false, sequence: 10, draft };
  store(`profile-current:${peer}:false`, id);
  store(`profile:${id}`, row);
  assert.equal(
    (await knownPeerProfile(authority, peer))?.name,
    'Perfil privado',
  );
  assert.equal(
    await knownPeerProfile(
      {
        ...authority,
        session: { ...authority.session, accountId: crypto.randomUUID() },
      },
      peer,
    ),
    null,
  );
  store(`profile-tombstone:${peer}:false`, 10);
  assert.equal(await knownPeerProfile(authority, peer), null);
  store(`profile-tombstone:${peer}:false`, 9);
  assert.equal((await knownPeerProfile(authority, peer))?.revision, 3);
  for (const divergent of [
    { ...row, peer: crypto.randomUUID() },
    { ...row, own: true },
    { ...row, id: crypto.randomUUID() },
  ]) {
    store(`profile:${id}`, divergent);
    await assert.rejects(knownPeerProfile(authority, peer), /divergente/u);
  }
});
