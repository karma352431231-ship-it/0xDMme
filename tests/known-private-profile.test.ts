import assert from 'node:assert/strict';
import { test } from 'node:test';
import { knownPeerProfile } from '../src/client/messages/known-profile.ts';
import { sealLocal } from '../src/client/message-storage/index.ts';
import { PeerPhotos } from '../src/client/messages/peer-photos.ts';
import type { ProfileCard } from '../src/client/message-profile/index.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
import { deferred } from './fixtures/deferred.ts';
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
    await assert.rejects(
      knownPeerProfile(authority, peer),
      /differ|not match/u,
    );
  }
});

await test('retained private photo hosts reuse the image and remove it after deletion or a failed current read', async (t) => {
  const records = new Map<string, unknown>();
  class PhotoNode extends ChatNode {
    src = '';
    isConnected = true;
  }
  const originals = ['document', 'indexedDB'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => new PhotoNode(tag) },
  });
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: profileDatabase(records),
  });
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  t.mock.method(URL, 'createObjectURL', () => 'blob:private-fixture');
  t.mock.method(URL, 'revokeObjectURL', () => {});
  const photo = {
    name: 'Fixture',
    revision: 1,
    photo: { bytes: new Uint8Array(4), type: 'image/png' },
  } as ProfileCard;
  let version = 0;
  let fail = false;
  let value: ProfileCard | null = photo;
  let loads = 0;
  const photos = new PeerPhotos({
    scope: () => 'account',
    load: () => {
      loads++;
      return fail
        ? Promise.reject(new Error('Unreadable current card'))
        : Promise.resolve(value);
    },
  });
  const host = new PhotoNode();
  host.textContent = 'FI';
  const show = async () => {
    records.set(
      JSON.stringify(['account', 'profile-current:peer:false']),
      String(version),
    );
    photos.show(
      host as unknown as HTMLElement,
      'peer',
      new AbortController().signal,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  await show();
  const image = host.querySelector('img');
  assert.ok(image);
  await show();
  assert.equal(host.querySelector('img'), image);
  assert.equal(loads, 1);
  version++;
  value = null;
  await show();
  assert.equal(host.querySelector('img'), null);
  assert.equal(host.textContent, 'FI');
  value = photo;
  version++;
  await show();
  assert.ok(host.querySelector('img'));
  fail = true;
  version++;
  await show();
  assert.equal(host.querySelector('img'), null);
  assert.equal(host.textContent, 'FI');
  photos.clear();
});

await test('a late old private photo cannot overwrite the current deletion or a different account', async (t) => {
  const records = new Map<string, unknown>();
  class PhotoNode extends ChatNode {
    src = '';
    isConnected = true;
  }
  const originals = ['document', 'indexedDB'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => new PhotoNode(tag) },
  });
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: profileDatabase(records),
  });
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  t.mock.method(URL, 'createObjectURL', () => 'blob:late-fixture');
  t.mock.method(URL, 'revokeObjectURL', () => {});
  const pending = deferred<ProfileCard | null>();
  let first = true;
  let scope = 'account';
  const photos = new PeerPhotos({
    scope: () => scope,
    load: () => {
      if (!first) return Promise.resolve(null);
      first = false;
      return pending.promise;
    },
  });
  const host = new PhotoNode();
  host.textContent = 'FI';
  const element = host as unknown as HTMLElement,
    signal = new AbortController().signal;
  records.set(JSON.stringify([scope, 'profile-current:peer:false']), 'old');
  photos.show(element, 'peer', signal);
  await new Promise<void>((resolve) => setImmediate(resolve));
  records.set(JSON.stringify([scope, 'profile-current:peer:false']), 'deleted');
  photos.show(element, 'peer', signal);
  await new Promise<void>((resolve) => setImmediate(resolve));
  pending.resolve({
    name: 'Old',
    revision: 1,
    photo: { bytes: new Uint8Array(4), type: 'image/png' },
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(host.querySelector('img'), null);
  scope = 'other-account';
  photos.show(element, 'peer', signal);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(host.querySelector('img'), null);
  photos.clear();
});
