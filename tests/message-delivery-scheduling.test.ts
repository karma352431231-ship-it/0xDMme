import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type { LiveEvent } from '../src/client/message-live/index.ts';
import { MessageLiveUpdates } from '../src/client/messages/live-updates.ts';
import type { HistoryKind } from '../src/client/messages/preparation.ts';
import { MessageSynchronization } from '../src/client/messages/synchronization.ts';
import { TextSendQueue } from '../src/client/messages/text-send.ts';

/* Delivery redesign baseline (phase 1). These regressions assemble the real
 * live routing, synchronization scheduler and text queue the way
 * `messages/index.ts` wires them, with domain readers replaced by counters.
 * They state the target receive contract and currently fail, so they are
 * marked `todo` until the phase that fixes each finding removes the marker.
 * They measure scheduling only, not SDK, network or two-device latency. */

/** Scheduler budget from hint to account receipt start, inside the 1 s
 * warm submit-to-display target. Server batching is outside this layer. */
const promptReceiptMs = 250;

type Operation =
  | 'selected-read'
  | 'account-receive'
  | 'group-receive'
  | 'group-directory'
  | 'transmit';

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

async function assembled(t: TestContext, selected: HistoryKind | null) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const log: { operation: Operation; at: number }[] = [];
  const failures: unknown[] = [];
  let origin = 0;
  const record = (operation: Operation) =>
    log.push({ operation, at: Date.now() - origin });
  const state = {
    generation: 0,
    connected: true,
    session: true,
    online: true,
    visible: true,
    suspended: false,
    liveConnecting: false,
    startupPending: false,
  };
  let queue: TextSendQueue | null = null;
  const sync: MessageSynchronization = new MessageSynchronization({
    state: () => ({ ...state, textPending: queue?.pending ?? false }),
    status() {},
    notice: (text) => failures.push(text),
    complete() {},
    renderPending: () => Promise.resolve(),
    pause() {},
    preloadDirect: () => {
      record('account-receive');
      return Promise.resolve(false);
    },
    preloadGroups: () => {
      record('group-receive');
      return Promise.resolve(false);
    },
    unread: () => Promise.resolve(),
    groupProjection: () => {
      record('group-directory');
      return Promise.resolve();
    },
    presence: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    // Mirrors `refreshChangedSelected`: a selected group refreshes the group
    // directory; a selected private chat runs its own probe/synchronize.
    changes: () => {
      if (selected === 'groups') {
        record('group-directory');
        return Promise.resolve();
      }
      if (selected === 'direct') {
        record('selected-read');
        sync.prepareHistory('direct');
      }
      return Promise.resolve();
    },
    changeMaintenance: [
      () => Promise.resolve(),
      () => {
        if (selected !== 'groups') record('group-directory');
        return Promise.resolve();
      },
      () => Promise.resolve(),
    ],
    periodic: () => Promise.resolve(),
    periodicWork: () => Promise.resolve(false),
    pending: () => Promise.resolve([]),
    sendPending: () => Promise.resolve(),
  });
  const text = new TextSendQueue({
    save: () => Promise.resolve(),
    available: () => sync.foregroundReady,
    transmit: async () => {
      const ok = await sync.run(() => {
        record('transmit');
        return Promise.resolve();
      });
      return { ok, more: false };
    },
    changed: () => sync.resume(),
    failed: (error) => failures.push(error),
  });
  queue = text;
  const live = new MessageLiveUpdates({
    selected: () => selected,
    visible: () => state.visible,
    invalidate() {},
    hint() {},
    request: (update, work, scope) => sync.request(update, work, scope),
    inbox: (scope) => sync.requestInbox(scope),
    projection: (work, scope) => sync.requestProjection(work, scope),
    counters: (scope) => sync.requestCounters(scope),
    previews() {},
    external() {},
  });
  t.after(() => {
    text.reset();
    sync.close();
  });
  let now = 0;
  const f = {
    sync,
    text,
    failures,
    /** Times recorded afterwards are relative to the latest event. */
    emit: (event: LiveEvent) => {
      origin = Date.now();
      live.event(event);
    },
    count: (operation: Operation) =>
      log.filter((entry) => entry.operation === operation).length,
    first: (operation: Operation) =>
      log.find((entry) => entry.operation === operation)?.at ?? null,
    /** Advance mocked time in small steps so posted continuations settle. */
    async advance(ms: number, each?: (at: number) => void) {
      for (let step = 0; step < ms; step += 10) {
        t.mock.timers.tick(10);
        now += 10;
        each?.(now);
        await turn();
        await turn();
      }
    },
  };
  // Start from a warm, idle session: the connected live stream resumes the
  // scheduler, and the initial history preparation of both kinds completes
  // before the event under test arrives.
  sync.resume();
  await f.advance(5000);
  assert.deepEqual(
    log.map((entry) => entry.operation).filter((op) => op.endsWith('receive')),
    ['account-receive', 'group-receive'],
    'warm-up prepared both histories',
  );
  log.length = 0;
  return f;
}

await test(
  'F1: a private append with the chat open is applied once by the account receiver',
  { todo: 'phase 2: single private content consumer' },
  async (t) => {
    const f = await assembled(t, 'direct');
    f.emit('private-messages');
    await f.advance(3000);
    assert.equal(f.count('selected-read'), 0, 'no selected re-synchronization');
    assert.equal(f.count('account-receive'), 1, 'one account receipt turn');
    assert.deepEqual(f.failures, []);
  },
);

for (const selected of [null, 'direct', 'groups'] as const) {
  await test(
    `F2: a private append starts account receipt promptly (selected: ${selected ?? 'none'})`,
    { todo: 'phase 2: prompt live receipt without the 1 s preparation delay' },
    async (t) => {
      const f = await assembled(t, selected);
      f.emit('private-messages');
      await f.advance(2000);
      const started = f.first('account-receive');
      assert.notEqual(started, null, 'account receipt started');
      assert.ok(
        started !== null && started <= promptReceiptMs,
        `account receipt started at ${started} ms, budget ${promptReceiptMs} ms`,
      );
    },
  );
}

for (const sending of [false, true]) {
  await test(
    `F2: continuous typing${sending ? ' and sending' : ''} does not starve incoming receipt`,
    {
      todo: 'phase 2: the text quiet period defers decoration, never delivery',
    },
    async (t) => {
      const f = await assembled(t, 'direct');
      let drafts = 0;
      // Producers stay active for the whole window: the composer refreshes the
      // quiet timer every 300 ms, and new hints arrive every 500 ms.
      await f.advance(5000, (at) => {
        if (at % 300 === 0) f.text.deferBackground();
        if (at % 500 === 0) f.emit('private-messages');
        if (sending && at % 700 === 0)
          f.text.enqueue({ id: `d${drafts++}`, peer: 'peer', text: 'hi' });
      });
      assert.ok(f.count('account-receive') > 0, 'incoming receipt advanced');
      if (sending) assert.ok(f.count('transmit') > 0, 'sending advanced');
      assert.deepEqual(f.failures, []);
    },
  );
}

const groupCases: {
  name: string;
  selected: HistoryKind | null;
  event: LiveEvent;
  content: boolean;
}[] = [
  {
    name: 'open group, new message',
    selected: 'groups',
    event: 'group-messages',
    content: true,
  },
  {
    name: 'open group, receipt update',
    selected: 'groups',
    event: 'group-receipts',
    content: false,
  },
  {
    name: 'private chat open, group message',
    selected: 'direct',
    event: 'group-messages',
    content: true,
  },
  {
    name: 'no chat open, group message',
    selected: null,
    event: 'group-messages',
    content: true,
  },
];
for (const groupCase of groupCases) {
  await test(
    `F3: group content does not refresh the group directory (${groupCase.name})`,
    {
      todo: 'phase 3: separate group content receipt from directory/profile work',
    },
    async (t) => {
      const f = await assembled(t, groupCase.selected);
      f.emit(groupCase.event);
      await f.advance(5000);
      assert.equal(f.count('group-directory'), 0, 'no group directory refresh');
      if (groupCase.content)
        assert.equal(f.count('group-receive'), 1, 'one group content receipt');
      assert.deepEqual(f.failures, []);
    },
  );
}
