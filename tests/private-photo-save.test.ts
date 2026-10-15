import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  emptyProfile,
  PrivatePhotoDraft,
  openProfile,
} from '../src/client/account-profile/index.ts';
import { savePrivatePhoto } from '../src/client/account/private-photo-save.ts';
import type { AccountSession } from '../src/shared/account/index.ts';

async function fixture() {
  const session = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'synthetic',
    profileRevision: 3,
  } as AccountSession;
  const profile = emptyProfile(),
    draft = new PrivatePhotoDraft();
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const file = new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
    'synthetic.png',
    { type: 'image/png' },
  );
  return { session, profile, draft, key, file };
}
await test('automatic photo save encrypts the photo with only committed privacy and returns the accepted revision', async () => {
  const f = await fixture();
  let writes = 0;
  const revision = await savePrivatePhoto({
    ...f,
    stage: () => f.draft.choose(f.file),
    current: () => true,
    save: async (session, envelope) => {
      writes++;
      const opened = await openProfile({
        envelope,
        key: f.key,
        accountId: session.accountId,
      });
      assert.ok(opened.photo);
      assert.equal(opened.preferences.online, false);
    },
  });
  assert.equal(revision, 4);
  assert.equal(writes, 1);
  assert.ok(f.profile.photo);
  assert.equal(f.draft.dirty(), false);
});
await test('a failed photo save retains the saved image and clears the unreachable draft', async () => {
  const f = await fixture();
  await f.draft.choose(f.file);
  f.draft.commit(f.profile);
  const saved = f.profile.photo;
  await assert.rejects(
    savePrivatePhoto({
      ...f,
      stage: () => f.draft.choose(f.file),
      current: () => true,
      save: () => Promise.reject(new Error('synthetic failure')),
    }),
    /salvar a foto/u,
  );
  assert.equal(f.profile.photo, saved);
  assert.equal(f.draft.dirty(), false);
  assert.equal(saved?.bytes[0], 137);
});
for (const when of ['before-write', 'after-write'] as const)
  await test(`session replacement cancels photo publication and clears staged bytes: ${when}`, async () => {
    const f = await fixture();
    let current = true,
      writes = 0;
    const revision = await savePrivatePhoto({
      ...f,
      stage: async () => {
        await f.draft.choose(f.file);
        if (when === 'before-write') current = false;
      },
      current: () => current,
      save: () => {
        writes++;
        current = false;
        return Promise.resolve();
      },
    });
    assert.equal(revision, null);
    assert.equal(writes, when === 'before-write' ? 0 : 1);
    assert.equal(f.profile.photo, null);
    assert.equal(f.draft.dirty(), false);
  });
await test('removing a private photo saves immediately and clears its old bytes after confirmation', async () => {
  const f = await fixture();
  await f.draft.choose(f.file);
  f.draft.commit(f.profile);
  const old = f.profile.photo!.bytes;
  await savePrivatePhoto({
    ...f,
    stage: () => {
      f.draft.remove();
      return Promise.resolve();
    },
    current: () => true,
    save: async (session, envelope) => {
      assert.equal(
        (
          await openProfile({
            envelope,
            key: f.key,
            accountId: session.accountId,
          })
        ).photo,
        null,
      );
    },
  });
  assert.equal(f.profile.photo, null);
  assert.ok(old.every((byte) => byte === 0));
  assert.equal(f.draft.dirty(), false);
});
