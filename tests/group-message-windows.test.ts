import { WorkInterruption } from '../src/client/synchronization-work/index.ts';
import { AccountError } from '../src/shared/account/index.ts';
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
    // A v2 server also returns the cut's anchor and removal fence.
    finite: null as { invalidation: number } | null,
    views: [] as GroupView[],
    changed: [] as GroupView[],
    calls: [] as { op: string; ids: unknown; revision?: unknown }[],
    decoded: [] as string[],
    fail: false,
    failure: null as string | null,
    /** null: no delta operation (older server); false: delta without packets. */
    delta: true as boolean | null,
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
      ...(data.finite
        ? { anchor: data.views.length, invalidation: data.finite.invalidation }
        : {}),
    }),
    'group-message-index': (d) => {
      const anchor = d['anchor'] === undefined ? Infinity : Number(d['anchor']);
      const rows = data.views
        .filter(
          (view) =>
            view.sequence > Number(d['after']) && view.sequence <= anchor,
        )
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
    // The server builds these from one cut; the fixture from the same data.
    'group-message-delta': (d) => {
      if (data.delta === null)
        throw new AccountError(404, 'Message operation unavailable.');
      const snapshot = handlers['group-message-snapshot']!(d) as {
        revision: number;
      };
      const ids = data.changed.map((view) => view.id);
      return {
        snapshot,
        changes: {
          reset: false,
          from: d['from'],
          revision: snapshot.revision,
          items: data.changed.map(metadata),
          next: null,
        },
        objects:
          ids.length && data.delta
            ? { ids, page: { items: data.changed } }
            : null,
      };
    },
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
      data.calls.push({ op, ids: d['ids'], revision: d['revision'] });
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
  assert.deepEqual(
    data.calls.slice(start).map((call) => call.op),
    ['group-message-delta', 'group-message-confirm'],
    'One request carries the snapshot, the change and its packet',
  );
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
    ['group-message-delta', 'group-message-confirm'],
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
  data.failure = 'group-message-delta';
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
    ['group-message-delta', 'group-message-confirm'],
  );
});

async function completeRead(
  windows: GroupMessageWindows,
  c: Parameters<GroupMessageWindows['read']>[0],
) {
  for (let turn = 0; turn < 64; turn++) {
    try {
      return await windows.read(c, null);
    } catch (error) {
      if (!(error instanceof IncompleteGroupIndex)) throw error;
    }
  }
  throw new Error('Bounded fixture did not complete');
}
await test('cancel during group-message-confirm preserves confirmed state and completed index, without publishing the unconfirmed window', async () => {
  const { c, data, add } = await fixture(),
    windows = new GroupMessageWindows();
  add('Confirmed');
  const original = await completeRead(windows, c);
  windows.finishPreparation(c.group.state.groupId);
  const added = add('Unconfirmed');
  data.changed = [added];
  data.revision++;
  const api = c.api;
  let interrupted = true;
  c.api = async (op, input) => {
    if (op === 'group-message-confirm' && interrupted)
      throw new WorkInterruption('replacement');
    return api(op, input);
  };
  await assert.rejects(windows.read(c, null), WorkInterruption);
  assert.equal(original.views.length, 1);
  assert.equal(windows.prepared(c.group.state.groupId), true);
  const indexPages = data.calls.filter(
    (call) => call.op === 'group-message-changes',
  ).length;
  interrupted = false;
  const restored = await completeRead(windows, c);
  assert.equal(restored.views.length, 2);
  assert.equal(
    data.calls.filter((call) => call.op === 'group-message-changes').length,
    indexPages,
  );
});
await test('one-page group turns preserve every cursor and canceling final confirmation never completes preparation', async () => {
  const { c, data, add } = await fixture(),
    windows = new GroupMessageWindows();
  for (let n = 0; n < 144; n++) add('Synthetic');
  const bounded = { ...c, indexPages: 1 };
  for (let turn = 0; turn < 9; turn++) {
    const before = data.calls.filter(
      (call) => call.op === 'group-message-index',
    ).length;
    await assert.rejects(windows.read(bounded, null), IncompleteGroupIndex);
    assert.equal(
      data.calls.filter((call) => call.op === 'group-message-index').length,
      before + 1,
    );
    assert.equal(data.decoded.length, 0);
  }
  let cancelled = false;
  const guarded = {
    ...bounded,
    guard: () => {
      if (cancelled) throw new WorkInterruption('navigation');
    },
    api: async (op: string, input: Record<string, unknown>) => {
      const result = await c.api(op, input);
      if (op === 'group-message-confirm') cancelled = true;
      return result;
    },
  };
  await assert.rejects(windows.read(guarded, null), WorkInterruption);
  assert.equal(windows.prepared(c.group.state.groupId), false);
  const pages = data.calls.filter(
    (call) => call.op === 'group-message-index',
  ).length;
  const result = await completeRead(windows, bounded);
  assert.equal(result.views.length, 16);
  assert.equal(
    data.calls.filter((call) => call.op === 'group-message-index').length,
    pages,
  );
});
for (const status of [403, 409]) {
  await test(`a ${status} denial after a canceled confirmation discards the candidate and its index`, async () => {
    const { c, data, add } = await fixture(),
      windows = new GroupMessageWindows();
    add('Synthetic');
    await completeRead(windows, c);
    const api = c.api;
    c.api = (op, input) =>
      op === 'group-message-confirm'
        ? Promise.reject(new AccountError(status, 'Denied'))
        : api(op, input);
    await assert.rejects(windows.read(c, null), AccountError);
    c.api = api;
    const before = data.calls.length;
    await completeRead(windows, c);
    assert.ok(
      data.calls
        .slice(before)
        .some((call) => call.op === 'group-message-index'),
    );
  });
}

await test('an unfinished finite cut survives later appends; a removal fence restarts it', async () => {
  const appendCase = async (removal: boolean) => {
    const { c, data, add } = await fixture(),
      windows = new GroupMessageWindows();
    data.finite = { invalidation: 0 };
    for (let index = 0; index < 144; index++) add('Sintética');
    await assert.rejects(windows.read(c, null), IncompleteGroupIndex);
    add('Later append');
    data.revision++;
    if (removal) data.finite = { invalidation: data.revision };
    // A restarted cut may need further bounded reads of its own.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await windows.read(c, null);
        break;
      } catch (error: unknown) {
        if (!(error instanceof IncompleteGroupIndex)) throw error;
      }
    }
    const index = data.calls.filter(
      (call) => call.op === 'group-message-index',
    );
    return {
      index: index.length,
      revisions: new Set(index.map((call) => call.revision)),
      confirmed: data.calls.findLast(
        (call) => call.op === 'group-message-confirm',
      )?.revision,
    };
  };
  const kept = await appendCase(false);
  assert.equal(kept.index, 10, 'partial progress continues');
  assert.deepEqual(kept.revisions, new Set([1]), 'the same cut to the end');
  assert.equal(kept.confirmed, 1);
  const restarted = await appendCase(true);
  assert.deepEqual(restarted.revisions, new Set([1, 2]));
  assert.equal(restarted.confirmed, 2, 'the fresh cut after a removal');
});

await test('a delta without packets and a server without deltas both fall back to the separate requests', async () => {
  const { c, data, add } = await fixture(),
    windows = new GroupMessageWindows();
  add('First');
  await windows.read(c, null);
  const read = async (delta: boolean | null) => {
    data.delta = delta;
    data.changed = [add('Later')];
    data.revision++;
    const start = data.calls.length,
      result = await windows.read(c, null);
    assert.equal(result.views.at(-1)?.id, data.changed[0]!.id);
    return data.calls.slice(start).map((call) => call.op);
  };
  assert.deepEqual(await read(false), [
    'group-message-delta',
    'group-message-objects',
    'group-message-confirm',
  ]);
  assert.deepEqual(await read(null), [
    'group-message-delta',
    'group-message-snapshot',
    'group-message-changes',
    'group-message-objects',
    'group-message-confirm',
  ]);
  assert.deepEqual(
    await read(true),
    [
      'group-message-snapshot',
      'group-message-changes',
      'group-message-objects',
      'group-message-confirm',
    ],
    'An older server is asked once per session',
  );
});
await test('scrolling up adds one older verified page before confirmation and later reads keep that depth', async () => {
  const { c, data, add } = await fixture(),
    windows = new GroupMessageWindows();
  for (let index = 1; index <= 20; index++) add(`Message ${index}`);
  const latest = await windows.read(c, null);
  assert.equal(latest.views.length, 16);
  assert.equal(
    windows.olderAvailable(c.group.state.groupId, latest.views),
    true,
  );
  const start = data.calls.length;
  const deeper = await windows.read(c, null, true);
  assert.deepEqual(
    deeper.views.map((view) => view.sequence),
    Array.from({ length: 20 }, (_, index) => index + 1),
  );
  const ops = data.calls.slice(start).map((call) => call.op);
  assert.ok(
    ops.indexOf('group-message-recent') < ops.indexOf('group-message-confirm'),
    'The older page is read inside the confirmed snapshot',
  );
  const added = add('Message 21');
  data.changed = [added];
  data.revision++;
  const next = await windows.read(c, null);
  assert.equal(next.views.length, 21);
  assert.equal(next.views[0]?.sequence, 1);
  await windows.read(c, null, true);
  assert.equal(
    windows.olderAvailable(c.group.state.groupId, next.views),
    false,
  );
  windows.clear();
  assert.equal(
    windows.olderAvailable(c.group.state.groupId, latest.views),
    true,
  );
});
