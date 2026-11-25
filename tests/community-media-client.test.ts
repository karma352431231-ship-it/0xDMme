import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  uploadCommunityMedia,
  fitMediaSelection,
  validateMediaSelection,
} from '../src/client/community-media/index.ts';
import { communityMediaPartBytes } from '../src/shared/community-media/index.ts';
import type { CommunityMediaState } from '../src/shared/community-media/index.ts';
import { bytesHash } from '../src/shared/vault/index.ts';
await test('public client enforces quantity and mixing before upload and resumes received parts', async () => {
  const bytes = new Uint8Array(communityMediaPartBytes + 10).fill(5),
    file = new File([bytes], 'sintetico.gif', { type: 'image/gif' });
  const source = {
    id: crypto.randomUUID(),
    kind: 'gif' as const,
    bytes: bytes.length,
    hash: await bytesHash(bytes),
  };
  const current: CommunityMediaState = {
    source,
    received: 1,
    status: 'uploading',
    result: null,
    error: null,
  };
  const parts: number[] = [],
    access = {
      community: crypto.randomUUID(),
      valid: () => true,
      signal: new AbortController().signal,
      request: (
        operation: string,
        payload: Record<string, unknown>,
      ): Promise<unknown> => {
        if (operation === 'media-pending') return Promise.resolve([current]);
        if (operation === 'media-part') {
          parts.push(Number(payload['index']));
          current.received = 2;
        }
        if (operation === 'media-finish') {
          current.status = 'ready';
          current.result = {
            kind: 'gif',
            type: 'image/gif',
            bytes: 100,
            width: 32,
            height: 32,
            seconds: 1,
            fps: 20,
            thumbnailBytes: 50,
            normalized: true,
          };
        }
        return Promise.resolve(current);
      },
    };
  assert.deepEqual(await uploadCommunityMedia(access, [file], () => {}), [
    source.id,
  ]);
  assert.deepEqual(parts, [1]);
  assert.throws(() =>
    validateMediaSelection([
      file,
      new File([bytes], 'foto.png', { type: 'image/png' }),
    ]),
  );
  assert.throws(() =>
    validateMediaSelection(Array.from({ length: 4 }, () => file)),
  );
  validateMediaSelection(Array.from({ length: 3 }, () => file));
});
await test('context change during preparation interrupts the next upload', async () => {
  let valid = true;
  const access = {
    community: crypto.randomUUID(),
    valid: () => valid,
    signal: new AbortController().signal,
    request: () => {
      valid = false;
      return Promise.resolve([]);
    },
  };
  await assert.rejects(
    uploadCommunityMedia(
      access,
      [new File([new Uint8Array(10)], 'synthetic.gif', { type: 'image/gif' })],
      () => {},
    ),
    /Session or community changed/u,
  );
});

await test('a pick that mixes kinds keeps the photos and says what was left out', () => {
  const photo = (name: string) =>
      new File([new Uint8Array(4)], name, { type: 'image/png' }),
    video = new File([new Uint8Array(4)], 'clip.mov', {
      type: 'video/quicktime',
    }),
    gif = new File([new Uint8Array(4)], 'loop.gif', { type: 'image/gif' });
  const six = Array.from({ length: 6 }, (_, i) => photo(`p${i}.png`));
  // The owner's case: six screenshots and one screen recording.
  const mixed = fitMediaSelection([], [...six.slice(0, 5), video, six[5]!]);
  assert.deepEqual(mixed.files, six);
  assert.equal(mixed.left, 'mixed');
  assert.deepEqual(fitMediaSelection([], six), { files: six, left: null });
  // An existing draft keeps its kind; more than ten photos stop at ten.
  assert.deepEqual(fitMediaSelection([video], [photo('x.png')]), {
    files: [video],
    left: 'mixed',
  });
  const twelve = Array.from({ length: 12 }, (_, i) => photo(`q${i}.png`));
  const capped = fitMediaSelection([], twelve);
  assert.equal(capped.files.length, 10);
  assert.equal(capped.left, 'limit');
  // Without photos the first kind leads.
  assert.deepEqual(fitMediaSelection([], [gif, video]), {
    files: [gif],
    left: 'mixed',
  });
});
