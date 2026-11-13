import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { recordDatabase } from './fixtures/record-database.ts';
import { readReopen, writeReopen } from '../src/client/reopen-cache/index.ts';
import {
  readMediaPreview,
  saveMediaPreview,
} from '../src/client/media-preview/index.ts';
import { forgetAttachment } from '../src/client/attachments/index.ts';
import { localGet, localPut } from '../src/client/message-storage/index.ts';
import type { VaultAuthority } from '../src/client/vault-authority/index.ts';

async function fixture(t: TestContext) {
  const store = recordDatabase();
  for (const [name, value] of Object.entries({
    indexedDB: store.factory,
    IDBKeyRange: store.range,
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const authority: VaultAuthority = {
    session: {
      accountId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      csrf: 'synthetic',
    },
    directory: 'a'.repeat(64),
    epoch: 1,
    events: [],
    offline: false,
    key: () => Promise.resolve(key),
    sign: () => Promise.resolve('synthetic'),
  };
  const location = {
    scope: authority.session.accountId,
    name: 'reopen:direct:synthetic',
    binding: 'peer',
  };
  return { authority, location };
}
await test('recent windows survive a new reader as ciphertext and fail closed across authority, peer, corruption and eviction', async (t) => {
  const { authority, location } = await fixture(t);
  const value = {
    views: [{ text: 'SYNTHETIC SECRET' }],
    snapshot: 'synthetic',
  };
  assert.equal(await writeReopen(authority, location, value), true);
  assert.deepEqual(await readReopen({ ...authority }, { ...location }), value);
  const raw = await localGet<{ cipher: { bytes: Uint8Array } }>(
    location.scope,
    location.name,
  );
  assert.ok(raw);
  await writeReopen(authority, location, value);
  assert.deepEqual(
    await localGet(location.scope, location.name),
    raw,
    'An unchanged projection keeps the existing encrypted record',
  );
  assert.equal(
    Buffer.from(raw.cipher.bytes).includes(Buffer.from('SYNTHETIC SECRET')),
    false,
  );
  assert.equal(
    await readReopen(authority, { ...location, binding: 'different-peer' }),
    null,
  );
  assert.equal(
    await readReopen({ ...authority, directory: 'b'.repeat(64) }, location),
    null,
  );
  assert.equal(
    await readReopen(
      {
        ...authority,
        session: { ...authority.session, deviceId: crypto.randomUUID() },
      },
      location,
    ),
    null,
  );
  raw.cipher.bytes[12] = (raw.cipher.bytes[12] ?? 0) ^ 1;
  await localPut(location.scope, location.name, raw, 512);
  assert.equal(await readReopen(authority, location), null);
  for (let index = 0; index < 17; index++)
    await writeReopen(
      authority,
      { ...location, name: `reopen:direct:${index}` },
      index,
    );
  assert.equal(await readReopen(authority, location), null);
});
await test('derived previews remain encrypted, bind to their source and survive original-cache eviction but obey message deletion', async (t) => {
  const { authority, location } = await fixture(t);
  const file = {
    ref: {
      id: crypto.randomUUID(),
      hash: 'b'.repeat(64),
      bytes: 32,
      parts: [{ hash: 'b'.repeat(64), bytes: 32 }],
    },
    encryption: '{}',
  };
  const input = { scope: location.scope, message: crypto.randomUUID(), file };
  const bytes = Uint8Array.of(255, 216, 255, 99, 88, 255, 217);
  await saveMediaPreview(authority, input, bytes);
  assert.deepEqual(await readMediaPreview({ ...authority }, input), bytes);
  assert.equal(
    await readMediaPreview(authority, {
      ...input,
      file: { ...file, encryption: 'changed' },
    }),
    null,
  );
  for (let index = 0; index < 18; index++)
    await saveMediaPreview(
      authority,
      { ...input, message: crypto.randomUUID() },
      bytes,
    );
  assert.deepEqual(await readMediaPreview(authority, input), bytes);
  await forgetAttachment(input.scope, input.message);
  assert.equal(await readMediaPreview(authority, input), null);
});
