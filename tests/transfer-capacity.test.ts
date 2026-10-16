import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { Database } from '../src/server/database/index.ts';
import type { ContactAuthority } from '../src/server/database/index.ts';
import { ObjectStore } from '../src/server/object-store/index.ts';
import { AttachmentService } from '../src/server/attachments/index.ts';
import { GroupMediaService } from '../src/server/groups/index.ts';
import { StatusService } from '../src/server/status/index.ts';
import {
  CommunityMediaService,
  CommunityMediaNormalizer,
} from '../src/server/community-media/index.ts';
import type {
  CommunityMediaState,
  CommunityMediaSource,
  CommunityMediaResult,
} from '../src/shared/community-media/index.ts';
import { deferred } from './fixtures/deferred.ts';

const id = '11111111-1111-4111-8111-111111111111';
const authority: ContactAuthority = {
  session: {
    accountId: id,
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Synthetic',
    deviceId: id,
    deviceState: 'pending',
    historyAuthorized: false,
    csrf: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    profileRevision: 0,
  },
  directory: 'b'.repeat(64),
};
type Kind = 'private' | 'group' | 'status' | 'community';

function operation(input: {
  kind: Kind;
  t: TestContext;
  work: () => Promise<never>;
}): () => Promise<unknown> {
  const { kind, t, work } = input;
  // Real services and disconnected stores; only the responsible persistence boundary is held.
  const database = new Database('postgresql://127.0.0.1/hash_talk_test');
  t.after(() => database.close());
  const objects = new ObjectStore(
    '/private/tmp/0xdmme-unused-transfer-fixture',
  );
  if (kind === 'private') {
    t.mock.method(database.attachments, 'cancel', work);
    const service = new AttachmentService(
      database.attachments,
      database.messages,
      objects,
    );
    return () =>
      service.operate(authority, 'attachment-cancel', { message: id });
  }
  if (kind === 'group') {
    t.mock.method(database.groupMedia, 'usage', work);
    const service = new GroupMediaService(
      database.groupMedia,
      database.groupRetention,
      objects,
    );
    return () =>
      service.operate(authority, 'group-media-usage', {
        groupId: id,
        head: authority.directory,
      });
  }
  if (kind === 'status') {
    t.mock.method(database.statuses, 'ready', work);
    const service = new StatusService(
      database.statuses,
      database.statusMedia,
      objects,
    );
    t.after(() => service.close());
    return () => service.operate(authority, 'status-ready', { id });
  }
  t.mock.method(database.communityMedia, 'status', work);
  const service = new CommunityMediaService({
    store: database.communityMedia,
    directory: '/private/tmp/0xdmme-unused-transfer-fixture',
    environment: {},
  });

  t.after(() => service.close());
  return () => service.operate('media-status', authority, { id, media: id });
}

for (const kind of ['private', 'group', 'status', 'community'] as const)
  await test(`${kind}: transfer admission follows memory and releases it after failure`, async (t) => {
    let available = 0,
      started = 0;
    t.mock.method(process, 'availableMemory', () => available);
    const gate = deferred<void>(),
      entered = deferred<void>();
    const failure = new Error('Synthetic persistence failure.');
    const run = operation({
      kind,
      t,
      work: async () => {
        if (++started === 16) entered.resolve();
        await gate.promise;
        throw failure;
      },
    });
    await assert.rejects(run(), { status: 429 });
    assert.equal(started, 0);
    available = 64 * 1_048_576;
    const pending = Array.from({ length: 16 }, () =>
      assert.rejects(run(), failure),
    );
    try {
      for (const job of pending)
        void job.catch((error: unknown) => entered.reject(error));
      await entered.promise;
      assert.equal(started, 16);
    } finally {
      gate.resolve();
      await Promise.all(pending);
    }
    available = 2_097_152;
    await assert.rejects(run(), failure);
    assert.equal(started, 17);
  });

await test('independent media preparations start together and shutdown releases their leases', async (t) => {
  t.mock.method(process, 'availableMemory', () => 64 * 1_048_576);
  const database = new Database('postgresql://127.0.0.1/hash_talk_test');
  t.after(() => database.close());
  const state = (media: string): CommunityMediaState => ({
    source: { id: media, kind: 'photo', bytes: 1, hash: 'a'.repeat(64) },
    received: 1,
    status: 'uploading',
    result: null,
    error: null,
  });
  t.mock.method(
    database.communityMedia,
    'status',
    (_a: ContactAuthority, _community: string, media: string) =>
      Promise.resolve(state(media)),
  );
  t.mock.method(
    database.communityMedia,
    'begin',
    (
      _a: ContactAuthority,
      input: Parameters<typeof database.communityMedia.begin>[1],
    ) =>
      Promise.resolve({
        state: state(input.id),
        writer: crypto.randomUUID(),
      }),
  );
  t.mock.method(database.communityMedia, 'processing', () => Promise.resolve());
  const released: string[] = [],
    started: string[] = [];
  t.mock.method(database.communityMedia, 'release', (media: string) => {
    released.push(media);
    return Promise.resolve();
  });
  t.mock.method(
    CommunityMediaNormalizer.prototype,
    'prepare',
    (source: CommunityMediaSource, stop: AbortSignal) =>
      new Promise<CommunityMediaResult>((_resolve, reject) => {
        started.push(source.id);
        stop.addEventListener(
          'abort',
          () => reject(new Error('Synthetic preparation cancellation.')),
          {
            once: true,
          },
        );
      }),
  );
  const service = new CommunityMediaService({
    store: database.communityMedia,
    directory: '/private/tmp/0xdmme-unused-transfer-fixture',
    environment: {},
  });
  t.after(() => service.close());
  const ids = Array.from({ length: 3 }, () => crypto.randomUUID());
  try {
    const results = await Promise.all(
      ids.map((media) =>
        service.operate('media-finish', authority, { id, media }),
      ),
    );
    assert.ok(
      results.every(
        (result) =>
          typeof result === 'object' &&
          result !== null &&
          'status' in result &&
          result.status === 'processing',
      ),
    );
    assert.deepEqual(started.sort(), ids.slice().sort());
  } finally {
    await service.close();
  }
  assert.deepEqual(released.sort(), ids.slice().sort());
  await assert.rejects(
    service.operate('media-finish', authority, { id, media: ids[0] }),
    { status: 503 },
  );
});
