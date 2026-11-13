import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import { GroupPreviews } from '../src/client/groups/previews.ts';
import { IncompleteGroupIndex } from '../src/client/groups/message-index.ts';
import type { GroupSummary } from '../src/client/groups/directory-refresh.ts';
import type { GroupView } from '../src/client/groups/reader.ts';
import { deferred } from './fixtures/deferred.ts';

function group(): GroupSummary {
  const owner = crypto.randomUUID();
  return {
    head: 'a'.repeat(64),
    title: 'Synthetic group',
    state: {
      version: 1,
      groupId: crypto.randomUUID(),
      revision: 1,
      epoch: 1,
      previous: null,
      kind: 'create',
      actor: owner,
      deviceId: crypto.randomUUID(),
      directory: 'b'.repeat(64),
      authorityRevision: 1,
      target: null,
      members: [{ accountId: owner, role: 'owner', joined: 1 }],
      owner,
      consent: null,
      signature: 'synthetic',
    },
  };
}
function view(group: GroupSummary, text: string, own = false): GroupView {
  return {
    id: crypto.randomUUID(),
    groupId: group.state.groupId,
    sequence: 1,
    epoch: 1,
    hash: 'c'.repeat(64),
    sender: group.state.owner,
    own,
    kind: 'text',
    text,
    unavailableMedia: [],
  };
}
function fixture() {
  const calls: string[] = [],
    errors: unknown[] = [];
  let selected: string | null = null;
  const options = {
    read: (
      summary: GroupSummary,
      _guard: () => void,
    ): Promise<readonly GroupView[]> => {
      _guard();
      calls.push(summary.state.groupId);
      return Promise.resolve([view(summary, summary.title)]);
    },
    selected: () => selected,
    changed() {},
    failed: (error: unknown) => errors.push(error),
  };
  return {
    previews: new GroupPreviews(options),
    options,
    calls,
    errors,
    select: (id: string | null) => {
      selected = id;
    },
  };
}

await test('an incomplete group rotates behind the other visible groups and publishes only after verification', async () => {
  const f = fixture(),
    slow = group(),
    quick = group();
  const read = f.options.read;
  let attempts = 0;
  f.options.read = (summary, guard) => {
    if (summary === slow && ++attempts === 1)
      return Promise.reject(new IncompleteGroupIndex());
    return read(summary, guard);
  };
  f.previews.queue([slow, quick]);
  assert.equal(await f.previews.step(), true);
  assert.equal(f.previews.get(slow.state.groupId), undefined);
  assert.equal(await f.previews.step(), true);
  assert.equal(f.previews.get(quick.state.groupId)?.text, quick.title);
  assert.equal(await f.previews.step(), false);
  assert.equal(f.previews.get(slow.state.groupId)?.text, slow.title);
  assert.deepEqual(f.errors, []);
});

for (const own of [false, true])
  await test(`latest ${own ? 'outgoing' : 'incoming'} projection keeps edited text, delivery and read metadata`, async () => {
    const f = fixture(),
      summary = group(),
      latest = {
        ...view(summary, 'Edited text', own),
        edited: true,
        delivery: 'received' as const,
      };
    f.options.read = () => Promise.resolve([latest]);
    f.previews.queue([summary]);
    await f.previews.step();
    assert.deepEqual(f.previews.get(summary.state.groupId), {
      id: latest.id,
      sequence: 1,
      text: 'Edited text',
      own,
      read: false,
      delivery: 'received',
    });
  });

await test('empty verified windows remove deleted latest messages; failed reads clear stale projections and continue other groups', async () => {
  const f = fixture(),
    first = group(),
    second = group();
  f.previews.publish(first.state.groupId, [view(first, 'Old')]);
  f.options.read = () => Promise.resolve([]);
  f.previews.queue([first]);
  await f.previews.step();
  assert.equal(f.previews.get(first.state.groupId), undefined);
  f.previews.publish(first.state.groupId, [view(first, 'Old')]);
  f.options.read = (summary) =>
    summary === first
      ? Promise.reject(new Error('Synthetic confirmation failure'))
      : Promise.resolve([view(second, 'Verified')]);
  f.previews.queue([first, second]);
  assert.equal(await f.previews.step(), true);
  assert.equal(f.previews.get(first.state.groupId), undefined);
  assert.equal(await f.previews.step(), false);
  assert.equal(f.previews.get(second.state.groupId)?.text, 'Verified');
  assert.equal(f.errors.length, 1);
});

await test('selected/background publications supersede an in-flight list read and duplicate callers share one preparation', async () => {
  const f = fixture(),
    summary = group(),
    held = deferred<readonly GroupView[]>();
  let reads = 0;
  f.options.read = () => {
    reads++;
    return held.promise;
  };
  f.previews.queue([summary]);
  const first = f.previews.step(),
    duplicate = f.previews.step();
  assert.equal(first, duplicate);
  f.previews.publish(summary.state.groupId, [
    view(summary, 'Newer verified selection'),
  ]);
  held.resolve([view(summary, 'Stale list')]);
  await first;
  assert.equal(reads, 1);
  assert.equal(
    f.previews.get(summary.state.groupId)?.text,
    'Newer verified selection',
  );
  assert.deepEqual(f.errors, []);
});

await test('logout cancels pending and in-flight publications; authorization failure clears all projections', async () => {
  const f = fixture(),
    summary = group(),
    held = deferred<readonly GroupView[]>();
  f.options.read = () => held.promise;
  f.previews.queue([summary]);
  const running = f.previews.step();
  f.previews.clear();
  held.resolve([view(summary, 'Stale')]);
  await running;
  assert.equal(f.previews.get(summary.state.groupId), undefined);
  f.previews.publish(summary.state.groupId, [view(summary, 'Old')]);
  f.options.read = () => Promise.reject(new AccountError(403, 'Denied'));
  f.previews.queue([group()]);
  await f.previews.step();
  assert.equal(f.previews.get(summary.state.groupId), undefined);
});

await test('visible pages are bounded and selected/local-only groups use their existing owners', async () => {
  const f = fixture(),
    selected = group(),
    local = { ...group(), localOnly: true };
  f.select(selected.state.groupId);
  f.previews.queue([local, selected, ...Array.from({ length: 20 }, group)]);
  while (await f.previews.step()) {
    /* Each iteration admits one bounded turn. */
  }
  assert.equal(f.calls.length, 15);
  assert.ok(!f.calls.includes(selected.state.groupId));
  assert.ok(!f.calls.includes(local.state.groupId));
});
