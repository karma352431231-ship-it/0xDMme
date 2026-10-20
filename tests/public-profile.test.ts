import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { AccountError, encode } from '../src/shared/account/index.ts';
import {
  claimableHandle,
  publicHandle,
  publicProfile,
} from '../src/shared/public-profile/index.ts';
import { pendingPublicAvatar } from '../src/shared/public-avatar/index.ts';

await test('handle normalizes case while rejecting accents, Unicode homoglyphs and system names', () => {
  assert.equal(claimableHandle(' @Joao_123 '), 'joao_123');
  assert.equal(claimableHandle('123'), '123');
  assert.equal(publicHandle('joao'), 'joao');
  for (const value of [
    'jo',
    'x'.repeat(31),
    'joão',
    'jоao',
    'ｊｏａｏ',
    'jo ao',
    'jo-ao',
    '@@joao',
    '___',
    'joao\u200b',
  ])
    assert.throws(() => claimableHandle(value), AccountError);
  for (const value of ['Admin', 'suporte', '0xDMme', 'a_d_m_i_n', '0xdmme_app'])
    assert.throws(() => claimableHandle(value), /reserved/);
});
await test('public contract rejects private fields or unprotected avatars', () => {
  const profile = { id: crypto.randomUUID(), handle: 'joao', avatar: null };
  assert.deepEqual(publicProfile(profile), profile);
  for (const key of [
    'address',
    'accountId',
    'name',
    'csrf',
    'deviceId',
    'pendingAvatar',
  ])
    assert.throws(
      () => publicProfile({ ...profile, [key]: 'privado' }),
      AccountError,
    );
  assert.throws(
    () => publicProfile({ ...profile, avatar: '/objeto-sem-moderacao' }),
    AccountError,
  );
});
await test('prepared avatar is bounded, static and metadata-free and grants no publication', async () => {
  const bytes = new Uint8Array(
    await readFile(new URL('../src/client/app/icon-192.png', import.meta.url)),
  );
  assert.equal(pendingPublicAvatar(null), null);
  assert.deepEqual(
    pendingPublicAvatar({ type: 'image/png', bytes: encode(bytes) })?.bytes,
    bytes,
  );
  for (const type of ['image/svg+xml', 'image/gif', 'text/html', 'image/jpeg'])
    assert.throws(
      () => pendingPublicAvatar({ type, bytes: encode(bytes) }),
      AccountError,
    );
  assert.throws(
    () =>
      pendingPublicAvatar({
        type: 'image/png',
        bytes: encode(new Uint8Array(3_000_001)),
      }),
    AccountError,
  );
  assert.throws(
    () =>
      pendingPublicAvatar({
        type: 'image/png',
        bytes: encode(bytes),
        approved: true,
      }),
    AccountError,
  );
  const dimensions = bytes.slice();
  new DataView(dimensions.buffer).setUint32(16, 3000);
  assert.throws(
    () => pendingPublicAvatar({ type: 'image/png', bytes: encode(dimensions) }),
    AccountError,
  );
  const metadata = new Uint8Array(bytes.length + 13);
  metadata.set(bytes);
  metadata.set([0, 0, 0, 1, 116, 69, 88, 116, 65, 0, 0, 0, 0], bytes.length);
  assert.throws(
    () => pendingPublicAvatar({ type: 'image/png', bytes: encode(metadata) }),
    AccountError,
  );
});
