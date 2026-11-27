import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ChosenUploads,
  fitMediaSelection,
  validateMediaSelection,
} from '../src/client/community-media/index.ts';
import { communityMediaPartBytes } from '../src/shared/community-media/index.ts';
import type { CommunityMediaState } from '../src/shared/community-media/index.ts';
import { bytesHash } from '../src/shared/vault/index.ts';
import { upload } from '../src/client/community-media/upload.ts';
import { ApiResponseError } from '../src/client/api-response/index.ts';

const uploadAll = (
  access: ConstructorParameters<typeof ChosenUploads>[0],
  files: File[],
) => new ChosenUploads(access, { progress() {}, failed() {} }).ids(files);
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
  assert.deepEqual(await uploadAll(access, [file]), [source.id]);
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
    uploadAll(access, [
      new File([new Uint8Array(10)], 'synthetic.gif', { type: 'image/gif' }),
    ]),
    /Session or community changed/u,
  );
});

const videoAttemptCases = [
  {
    name: 'a fast video upload groups consecutive parts',
    initialMs: 100,
    parts: [0, 9],
    batches: [
      [1, 4],
      [5, 4],
    ],
    reservations: 1,
    policyChecks: 1,
  },
  {
    name: 'a slow video upload keeps single-part requests',
    initialMs: 2200,
    parts: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    batches: [],
    reservations: 1,
    policyChecks: 0,
  },
  {
    name: 'a previous release keeps single-part video uploads available',
    initialMs: 100,
    parts: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    batches: [],
    reservations: 1,
    policyChecks: 1,
    legacyServer: true,
  },
  {
    name: 'a lost batch response continues from its durable prefix',
    initialMs: 100,
    parts: [0, 3, 4, 5, 6, 7, 8, 9],
    batches: [[1, 4]],
    reservations: 2,
    policyChecks: 1,
    interrupt: true,
  },
] as const;

for (const scenario of videoAttemptCases) {
  await test(scenario.name, async (t) => {
    const bytes = new Uint8Array(9 * communityMediaPartBytes + 23);
    const source = {
      id: crypto.randomUUID(),
      kind: 'video' as const,
      bytes: bytes.length,
      hash: await bytesHash(bytes),
    };
    const state: CommunityMediaState = {
      source,
      received: 0,
      status: 'uploading',
      error: null,
      result: null,
    };
    const parts: number[] = [];
    const batches: number[][] = [];
    const progress: Array<number | null> = [];
    let reservations = 0;
    let policyChecks = 0;
    let time = 0;
    t.mock.method(performance, 'now', () => time);
    const activity = {
      'media-reserve': () => {
        reservations++;
        return state;
      },
      'media-parts-policy': () => {
        policyChecks++;
        if ('legacyServer' in scenario)
          throw new ApiResponseError({
            operation: 'communities/media-parts-policy',
            status: 404,
            failure: 'http',
            message: 'Media operation unavailable.',
          });
        return { parts: 4 };
      },
      'media-part': (payload: Record<string, unknown>) => {
        const index = Number(payload['index']);
        assert.equal(index, state.received);
        parts.push(index);
        if (index === 0) time += scenario.initialMs;
        state.received++;
        return state;
      },
      'media-parts': (payload: Record<string, unknown>) => {
        assert.equal(payload['index'], state.received);
        assert.ok(Array.isArray(payload['parts']));
        batches.push([state.received, payload['parts'].length]);
        if ('interrupt' in scenario) {
          state.received += 2;
          throw new ApiResponseError({
            operation: 'communities/media-parts',
            status: 0,
            failure: 'network',
          });
        }
        state.received += payload['parts'].length;
        return state;
      },
      'media-finish': () => {
        assert.equal(state.received, 10);
        return {
          ...state,
          status: 'ready',
          result: {
            kind: 'video',
            type: 'video/mp4',
            bytes: 100,
            width: 32,
            height: 32,
            seconds: 1,
            fps: 30,
            thumbnailBytes: 50,
            normalized: true,
          },
        };
      },
    } satisfies Record<string, (payload: Record<string, unknown>) => unknown>;
    const access = {
      community: crypto.randomUUID(),
      valid: () => true,
      signal: new AbortController().signal,
      request: (operation: string, payload: Record<string, unknown>) => {
        assert.ok(Object.hasOwn(activity, operation), operation);
        return Promise.resolve().then(() =>
          activity[operation as keyof typeof activity](payload),
        );
      },
    };
    assert.equal(
      await upload(access, source, new Blob([bytes]), (n) => progress.push(n)),
      source.id,
    );
    assert.deepEqual(parts, scenario.parts);
    assert.deepEqual(batches, scenario.batches);
    assert.equal(reservations, scenario.reservations);
    assert.equal(policyChecks, scenario.policyChecks);
    assert.equal(progress[0], 0);
    assert.equal(progress.at(-1), 0.9);
  });
}

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
