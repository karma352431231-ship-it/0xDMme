import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageVisibility } from '../src/client/message-visibility/index.ts';
import { MessageReadTarget } from '../src/client/messages/read-target.ts';
import { ConfirmedConversations } from '../src/client/messages/confirmed-conversations.ts';
import { projectCachedConversation } from '../src/client/messages/cache-projection.ts';
import { probeConfirmed } from '../src/client/messages/confirmed-probe.ts';
import {
  decodeProgress,
  emptySyncProgress,
} from '../src/client/messages/sync-progress.ts';
import { syncSnapshot } from '../src/shared/message-sync/index.ts';
import type { MessageSyncSnapshot } from '../src/shared/message-sync/index.ts';
import type { MessageItem } from '../src/client/messages/history.ts';
import type { VaultAuthority } from '../src/client/vault-authority/index.ts';
const account = crypto.randomUUID(),
  device = crypto.randomUUID(),
  peer = crypto.randomUUID();
const from: MessageSyncSnapshot = {
  version: 2,
  account,
  device,
  revision: 1,
  anchor: 1,
  invalidation: 0,
  directory: 'a'.repeat(64),
  contacts: 0,
  source: 'journal',
};
const next = { ...from, revision: 2, anchor: 2 };
const row: MessageItem = {
  id: crypto.randomUUID(),
  kind: 'text',
  sender: peer,
  recipient: account,
  sequence: 1,
  hash: 'b'.repeat(64),
  deleted: false,
  deletion: null,
  queue_active: false,
  status: 'received',
  sender_revision: 1,
  recipient_revision: 1,
};
const view = {
  id: row.id,
  peer,
  hash: row.hash,
  text: 'Original',
  kind: 'text',
  own: false,
  sequence: 1,
  state: 'received',
};
const authority: VaultAuthority = {
  session: { accountId: account, deviceId: device, csrf: 'session' },
  directory: from.directory,
  epoch: 1,
  events: [],
  offline: false,
  key: () => Promise.reject(new Error('Unused')),
  sign: () => Promise.reject(new Error('Unused')),
};

await test('ordinary hints during every check cannot starve finite-cut publication; a closing event still wins', async () => {
  const frames: unknown[] = [];
  const visibility = new MessageVisibility<typeof view>((rows) =>
    frames.push(rows),
  );
  let token = visibility.begin();
  visibility.stage(token, [view]);
  await visibility.confirmCut(token, () => {
    for (let n = 0; n < 100; n++) visibility.hint();
    return Promise.resolve();
  });
  assert.deepEqual(frames.at(-1), [view]);
  token = visibility.refresh();
  visibility.stage(token, [view]);
  await assert.rejects(
    visibility.confirmCut(token, () => {
      visibility.close();
      return Promise.resolve();
    }),
    /superseded/,
  );
  assert.equal(frames.at(-1), null);
});

await test('finite-cut probe discovers later arrivals using one request and retains concurrent hints', async () => {
  const visibility = new MessageVisibility<typeof view>(() => {}),
    token = visibility.begin();
  let requests = 0;
  let advanced: unknown = null;
  const result = await probeConfirmed({
    visibility,
    token,
    candidate: { snapshot: JSON.stringify(from), views: [view] },
    advanced: (value) => {
      advanced = value;
    },
    api: (operation) => {
      requests++;
      assert.equal(operation, 'sync-probe');
      visibility.hint();
      return Promise.resolve({ snapshot: next, items: null });
    },
  });
  assert.equal(result, null);
  assert.deepEqual(advanced, next);
  assert.equal(requests, 1);
});

await test('unchanged v2 probe combines delivery and head confirmation in one request', async () => {
  const frames: unknown[] = [];
  const visibility = new MessageVisibility<typeof view>((rows) =>
    frames.push(rows),
  );
  let requests = 0;
  await probeConfirmed({
    visibility,
    token: visibility.begin(),
    candidate: { snapshot: JSON.stringify(from), views: [view] },
    api: (operation) => {
      requests++;
      assert.equal(operation, 'sync-probe');
      visibility.hint();
      return Promise.resolve({
        snapshot: from,
        items: [
          {
            id: view.id,
            hash: view.hash,
            queue_active: false,
            recipient_received: true,
          },
        ],
      });
    },
  });
  assert.equal(requests, 1);
  assert.equal((frames.at(-1) as unknown[]).length, 1);
});

await test('closed conversation receives edits and removals and reopens without resurrecting replayed actions', () => {
  const cache = new ConfirmedConversations<
    typeof view & { relation?: NonNullable<MessageItem['relation']> }
  >();
  cache.connection(true);
  cache.remember(peer, {
    snapshot: JSON.stringify(from),
    views: [view],
    oldest: 1,
  });
  const edit = {
    ...row,
    id: crypto.randomUUID(),
    sequence: 2,
    relation: {
      id: row.id,
      hash: row.hash,
      author: row.sender,
      type: 'edit' as const,
    },
  };
  const edited = {
    ...view,
    id: edit.id,
    sequence: 2,
    text: 'Edited',
    relation: edit.relation,
  };
  cache.updateVerified({
    from,
    snapshot: next,
    hints: cache.hintVersion,
    complete: true,
    blocked: new Set(),
    project: (_peer, rows) => projectCachedConversation(rows, [edit], [edited]),
  });
  assert.deepEqual(
    cache.reusable(peer)!.views.map((row) => row.text),
    ['Original', 'Edited'],
  );
  const deleted = { ...next, revision: 3, invalidation: 3 };
  const tombstones = [
    { ...row, deleted: true },
    { ...edit, deleted: true },
  ];
  cache.updateVerified({
    from: next,
    snapshot: deleted,
    hints: cache.hintVersion,
    complete: true,
    blocked: new Set(),
    project: (_peer, rows) => projectCachedConversation(rows, tombstones, []),
  });
  assert.deepEqual(cache.reusable(peer)!.views, []);
  assert.deepEqual(projectCachedConversation([], tombstones, [edited]), []);
  cache.connection(false);
  assert.equal(cache.reusable(peer), null);
  assert.ok(
    cache.read(peer),
    'reconnect retains only a candidate requiring a fresh check',
  );
});

await test('a hint arriving during cache application cannot be swallowed by its older confirmation', () => {
  const cache = new ConfirmedConversations<typeof view>();
  cache.connection(true);
  cache.remember(peer, {
    snapshot: JSON.stringify(from),
    views: [view],
    oldest: 1,
  });
  const hints = cache.hintVersion;
  cache.hint();
  cache.updateVerified({
    from,
    snapshot: next,
    hints,
    complete: true,
    blocked: new Set(),
    project: (_peer, rows) => rows,
  });
  assert.equal(cache.reusable(peer), null);
});

await test('unfinished target survives append hints; security changes select a new target', () => {
  const target = new MessageReadTarget();
  assert.equal(target.take(from), from);
  assert.equal(target.take(next), from);
  const removed = { ...next, invalidation: 2 };
  assert.equal(target.take(removed), removed);
});

await test('sealed progress rejects device grafts and malformed obligations; a different session starts fresh', () => {
  const state = emptySyncProgress(authority);
  state.discovered = from;
  assert.deepEqual(decodeProgress(state, authority), state);
  assert.throws(
    () =>
      decodeProgress(
        { ...state, discovered: { ...from, device: crypto.randomUUID() } },
        authority,
      ),
    /another device/,
  );
  assert.deepEqual(
    decodeProgress({ ...state, session: 'old' }, authority),
    emptySyncProgress(authority),
  );
  const pending = {
    peer,
    after: 2,
    through: 1,
    required: 1,
    reason: 'consent',
    retryAt: 0,
  };
  assert.throws(
    () => decodeProgress({ ...state, pending: [pending] }, authority),
    /range/,
  );
  assert.throws(() => syncSnapshot({ ...from, invalidation: 2 }), /boundary/);
});

await test('a repaired closed conversation advances its older coverage and publishes its preview from the same commit', () => {
  const cache = new ConfirmedConversations<typeof view>();
  cache.connection(true);
  cache.remember(peer, {
    snapshot: JSON.stringify(from),
    views: [view],
    oldest: 1,
  });
  const publications: unknown[] = [];
  cache.updateVerified({
    from: next,
    snapshot: { ...next, revision: 3, anchor: 3 },
    hints: cache.hintVersion,
    recovered: new Set([peer]),
    complete: true,
    blocked: new Set(),
    project: (_peer, rows) => rows,
    publish: (peer, rows) => publications.push({ peer, rows }),
  });
  assert.equal(
    syncSnapshot(JSON.parse(cache.reusable(peer)!.snapshot) as unknown)
      .revision,
    3,
  );
  assert.equal(publications.length, 1);
});

await test('an append-only journal cut covers a window the open chat read between its endpoints; a removal fence or a window ahead never replays rows', () => {
  const cache = new ConfirmedConversations<typeof view>();
  cache.connection(true);
  const at = (revision: number, invalidation = 0): MessageSyncSnapshot => ({
    ...from,
    revision,
    anchor: revision,
    invalidation,
  });
  const arrived = { ...view, id: crypto.randomUUID(), sequence: 4 };
  const cut = (snapshot: MessageSyncSnapshot) => {
    const published: string[] = [];
    const covered = cache.updateVerified({
      from: at(1),
      snapshot,
      hints: cache.hintVersion,
      complete: true,
      blocked: new Set(),
      publish: (peer) => published.push(peer),
      project: (_peer, rows) => [...rows, arrived],
    });
    return { covered: [...covered], published };
  };
  const remember = (revision: number, invalidation = 0) =>
    cache.remember(peer, {
      snapshot: JSON.stringify(at(revision, invalidation)),
      views: [view],
      oldest: 1,
    });

  remember(3);
  assert.deepEqual(cut(at(5)), { covered: [peer], published: [peer] });
  assert.equal(cache.reusable(peer)!.snapshot, JSON.stringify(at(5)));
  assert.deepEqual(
    cache.reusable(peer)!.views.map((row) => row.id),
    [view.id, arrived.id],
  );

  // A removal between the window and the cut advanced the fence.
  remember(3);
  assert.deepEqual(cut(at(5, 4)), { covered: [], published: [] });
  assert.equal(cache.reusable(peer), null);

  // A window older than the cut's start misses the changes before it.
  remember(0);
  assert.deepEqual(cut(at(5)), { covered: [], published: [] });
  assert.equal(cache.reusable(peer), null);

  // A window ahead of the cut keeps its verified rows untouched.
  remember(6);
  assert.deepEqual(cut(at(5)), { covered: [], published: [] });
  assert.deepEqual(
    cache.reusable(peer)!.views.map((row) => row.id),
    [view.id],
  );
  assert.equal(cache.reusable(peer)!.snapshot, JSON.stringify(at(6)));
});
