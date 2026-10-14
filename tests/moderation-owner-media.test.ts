import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModerationMedia } from '../src/server/public-profile/moderation-media.ts';
import type {
  ContactAuthority,
  PublicModerationSubject,
} from '../src/server/database/index.ts';
import { publicModerationPolicy } from '../src/shared/public-moderation/index.ts';
const authority = {} as ContactAuthority;
function subject(): PublicModerationSubject {
  return {
    id: crypto.randomUUID(),
    owner: crypto.randomUUID(),
    target: crypto.randomUUID(),
    kind: 'community-banner',
    contentHash: 'a'.repeat(64),
    policy: publicModerationPolicy,
  };
}
const image = { type: 'image/png' as const, bytes: new Uint8Array([1, 2, 3]) };

await test('private image access preserves exact review binding and delegates all four image kinds to their byte owner', async () => {
  for (const kind of [
    'avatar',
    'profile-banner',
    'community-photo',
    'community-banner',
  ] as const) {
    const value = { ...subject(), kind };
    const read = (input: PublicModerationSubject) => {
      assert.equal(input, value);
      return Promise.resolve(image);
    };
    const denied = () => {
      assert.fail('wrong byte owner');
    };
    const profile = kind === 'avatar' || kind === 'profile-banner';
    const service = new ModerationMedia({
      profiles: {
        moderationOwnerSubject: (input, id) => {
          assert.equal(input, authority);
          assert.equal(id, value.id);
          return Promise.resolve(value);
        },
        moderationCandidate: profile ? read : denied,
      },
      communities: { moderationCandidate: profile ? denied : read },
    });
    assert.deepEqual(await service.read(authority, value.id), {
      type: 'image/png',
      bytes: 'AQID',
    });
  }
});

await test('owner access fails closed if authorization expires or the current image is replaced during the read', async () => {
  for (const failure of [
    'unauthorized',
    'expiry',
    'replacement',
    'hash',
  ] as const) {
    const value = subject();
    let authorized = 0,
      reads = 0;
    const service = new ModerationMedia({
      profiles: {
        moderationOwnerSubject: () => {
          authorized++;
          if (
            failure === 'unauthorized' ||
            (failure === 'expiry' && authorized > 1)
          )
            return Promise.resolve(null);
          return Promise.resolve(
            failure === 'hash' && authorized > 1
              ? { ...value, contentHash: 'b'.repeat(64) }
              : value,
          );
        },
        moderationCandidate: () => Promise.resolve(null),
      },
      communities: {
        moderationCandidate: () => {
          reads++;
          return Promise.resolve(
            failure === 'replacement' && reads > 1 ? null : image,
          );
        },
      },
    });
    await assert.rejects(service.read(authority, value.id), { status: 404 });
    if (failure === 'unauthorized') assert.equal(reads, 0);
  }
});
