import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupMessageWindows } from '../src/client/groups/message-windows.ts';
import { IncompleteGroupIndex } from '../src/client/groups/message-index.ts';
import { projectGroupMessages } from '../src/client/groups/message-projection.ts';
import type {
  GroupReadContext,
  GroupView,
} from '../src/client/groups/reader.ts';
import type { GroupEvent } from '../src/shared/groups/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';

// The real cursor/projection and final-confirmation contract; transport and body
// decoding are synthetic. Megolm, signatures and persistence have separate tests.
async function fixture(owner?: Awaited<ReturnType<typeof groupParticipant>>) {
  const participant = owner ?? (await groupParticipant()),
    groupId = crypto.randomUUID(),
    head = 'b'.repeat(64);
  const state: GroupEvent = {
    version: 1,
    groupId,
    revision: 1,
    epoch: 1,
    previous: null,
    kind: 'create',
    actor: participant.accountId,
    deviceId: participant.deviceId,
    directory: participant.authority.directory,
    authorityRevision: 1,
    owner: participant.accountId,
    members: [{ accountId: participant.accountId, role: 'owner', joined: 1 }],
    target: null,
    consent: null,
    signature: 'A'.repeat(86) + '==',
  };
  const data = {
    revision: 1,
    views: [] as GroupView[],
    changed: [] as GroupView[],
    calls: [] as { op: string; ids: unknown }[],
    decoded: [] as string[],
    fail: false,
    failure: null as string | null,
  };
  const metadata = (view: GroupView) => ({
    ...view,
    deleted: false,
    deletion: null,
  });
  const handlers: Record<string, (d: Record<string, unknown>) => unknown> = {
    'group-message-snapshot': () => ({
      groupId,
      head,
      directory: participant.authority.directory,
      revision: data.revision,
    }),
    'group-message-index': (d) => {
      const rows = data.views
        .filter((view) => view.sequence > Number(d['after']))
        .slice(0, 16);
      return { items: rows.map(metadata), next: rows.at(-1)?.sequence ?? null };
    },
    'group-message-recent': (d) => ({
      items: data.views
        .filter(
          (view) =>
            !view.relation &&
            (d['before'] === null || view.sequence < Number(d['before'])),
        )
        .slice(-16),
      next: null,
    }),
    'group-message-relations': () => ({ ids: [] }),
    'group-message-changes': (d) => ({
      reset: false,
      from: d['from'],
      revision: d['revision'],
      items: data.changed.map(metadata),
      next: null,
    }),
    'group-message-objects': (d) => ({
      items: data.changed.filter((view) =>
        (d['ids'] as string[]).includes(view.id),
      ),
    }),
    'group-message-confirm': () => {
      if (data.fail) throw new Error('Confirmation rejected');
      return {};
    },
  };
  const c = {
    authority: participant.authority,
    group: { state, head },
    machine: {} as GroupReadContext['machine'],
    identities: {} as GroupReadContext['identities'],
    api: (op: string, d: Record<string, unknown>) => {
      data.calls.push({ op, ids: d['ids'] });
      if (op === data.failure)
        return Promise.reject(new Error('Check rejected'));
      return Promise.resolve(handlers[op]!(d));
    },
    read: (raw: unknown) => {
      const views = (raw as { items: GroupView[] }).items;
      data.decoded.push(...views.map((view) => view.id));
      return Promise.resolve({ views });
    },
  };
  const add = (text: string): GroupView => {
    const view = {
      id: crypto.randomUUID(),
      groupId,
      sequence: data.views.length + 1,
      epoch: 1,
      hash: 'a'.repeat(64),
      sender: participant.accountId,
      own: true,
      kind: 'text' as const,
      text,
      unavailableMedia: [],
    };
    data.views.push(view);
    return view;
  };
  return { c, data, add, participant };
}
await test('group edit reads only the changed object and preserves the other message; identical resume reads no history', async () => {
  const { c, data, add } = await fixture(),
    windows = new GroupMessageWindows(),
    root = add('Original'),
    intact = add('Intacta');
  await windows.read(c, null);
  const start = data.calls.length,
    reads = data.decoded.length;
  const edit = {
    ...root,
    id: crypto.randomUUID(),
    sequence: 3,
    text: 'Edited',
    relation: {
      id: root.id,
      hash: root.hash,
      author: root.sender,
      type: 'edit' as const,
    },
  };
  data.views.push(edit);
  data.changed = [edit];
  data.revision++;
  const result = await windows.read(c, null);
  assert.equal(result.views[0]!.text, 'Edited');
  assert.equal(result.views[1], intact);
  assert.deepEqual(data.decoded.slice(reads), [edit.id]);
  assert.ok(
    !data.calls
      .slice(start)
      .some(
        (call) =>
          call.op === 'group-message-recent' ||
          call.op === 'group-message-index',
      ),
  );
  const next = data.calls.length;
  await windows.read(c, null);
  assert.deepEqual(
    data.calls.slice(next).map((call) => call.op),
    ['group-message-snapshot', 'group-message-confirm'],
  );
});
await test('confirmation failure removes the candidate and requires checking before reopening', async () => {
  const { c, data, add } = await fixture(),
    windows = new GroupMessageWindows();
  add('Confirmada');
  await windows.read(c, null);
  data.fail = true;
  await assert.rejects(windows.read(c, null), /rejected|declined/);
  data.fail = false;
  const before = data.calls.length;
  await windows.read(c, null);
  assert.ok(
    data.calls.slice(before).some((call) => call.op === 'group-message-index'),
  );
});
await test('large index preserves progress without decrypting a partial window', async () => {
  const { c, data, add } = await fixture(),
    windows = new GroupMessageWindows();
  for (let index = 0; index < 144; index++) add('Sintética');
  await assert.rejects(windows.read(c, null), IncompleteGroupIndex);
  assert.equal(data.decoded.length, 0);
  const result = await windows.read(c, null);
  assert.equal(result.views.length, 16);
  assert.equal(
    data.calls.filter((call) => call.op === 'group-message-index').length,
    10,
  );
});
await test('group projection rejects another author or original and ignores older edit versions', async () => {
  const { add } = await fixture(),
    root = add('Original'),
    edit = {
      ...root,
      id: crypto.randomUUID(),
      sequence: 2,
      text: 'Nova',
      relation: {
        id: root.id,
        hash: root.hash,
        author: root.sender,
        type: 'edit' as const,
      },
    };
  const projected = projectGroupMessages([root], [edit]);
  assert.equal(projected[0]!.text, 'Nova');
  assert.equal(
    projectGroupMessages(projected, [
      { ...edit, text: 'Antiga', sequence: 1 },
    ])[0]!.text,
    'Nova',
  );
  assert.throws(
    () =>
      projectGroupMessages([root], [{ ...edit, sender: crypto.randomUUID() }]),
    /differ|not match/,
  );
  assert.throws(
    () =>
      projectGroupMessages(
        [root],
        [{ ...edit, relation: { ...edit.relation, hash: 'c'.repeat(64) } }],
      ),
    /differ|not match/,
  );
});

await test('snapshot failure discards the candidate; previous page gains no later messages', async () => {
  const { c, data, add } = await fixture(),
    windows = new GroupMessageWindows();
  for (let i = 0; i < 20; i++) add('Original');
  const initial = await windows.read(c, 10);
  assert.equal(initial.views.length, 9);
  const added = add('Nova');
  data.changed = [added];
  data.revision++;
  const old = await windows.read(c, 10);
  assert.equal(old.views.length, 9);
  assert.ok(old.views.every((view) => view.sequence < 10));
  data.failure = 'group-message-snapshot';
  await assert.rejects(windows.read(c, 10), /rejected|declined/);
  data.failure = null;
  const before = data.calls.length;
  await windows.read(c, 10);
  assert.ok(
    data.calls.slice(before).some((call) => call.op === 'group-message-index'),
  );
});
await test("edit in one group preserves another group's candidate without rereading messages", async () => {
  const a = await fixture(),
    b = await fixture(a.participant),
    windows = new GroupMessageWindows();
  const original = a.add('Original');
  b.add('Outra conversa');
  await windows.read(a.c, null);
  const previous = await windows.read(b.c, null);
  const edit = {
    ...original,
    id: crypto.randomUUID(),
    sequence: 2,
    text: 'Nova',
    relation: {
      id: original.id,
      hash: original.hash,
      author: original.sender,
      type: 'edit' as const,
    },
  };
  a.data.views.push(edit);
  a.data.changed = [edit];
  a.data.revision++;
  await windows.read(a.c, null);
  const before = b.data.calls.length,
    result = await windows.read(b.c, null);
  assert.equal(result.views[0], previous.views[0]);
  assert.deepEqual(
    b.data.calls.slice(before).map((call) => call.op),
    ['group-message-snapshot', 'group-message-confirm'],
  );
});
