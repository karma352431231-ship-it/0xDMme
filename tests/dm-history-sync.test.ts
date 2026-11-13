import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DmHistorySynchronization,
  type DmHistorySnapshot,
} from '../src/client/social-dm/history-sync.ts';
import {
  expectedInterruption,
  WorkInterruption,
} from '../src/client/synchronization-work/index.ts';
import { deferred } from './fixtures/deferred.ts';

function fixture() {
  const snapshot: DmHistorySnapshot = {
    anchor: 12,
    removals: 0,
    directory: 'a'.repeat(64),
    profile: crypto.randomUUID(),
  };
  let cursor: unknown = null;
  const pages: number[] = [],
    saved: unknown[] = [];
  const sync = new DmHistorySynchronization();
  const options = {
    snapshot: () => Promise.resolve({ ...snapshot }),
    cursor: () => Promise.resolve(cursor),
    save: (next: unknown) => {
      cursor = next;
      saved.push(next);
      return Promise.resolve();
    },
    page: (_snapshot: unknown, after: number) => {
      pages.push(after);
      return Promise.resolve({
        next: after < 12 ? 12 : null,
        unavailable: [] as string[],
      });
    },
    guard: () => {},
  };
  return {
    snapshot,
    sync,
    options,
    pages,
    saved,
    cursor: (value: unknown) => {
      cursor = value;
    },
  };
}
await test('DM synchronizes once and opens other conversations by checking snapshots without rewriting an unchanged cursor', async () => {
  const f = fixture();
  await f.sync.run(f.options);
  await f.sync.run(f.options);
  assert.deepEqual(f.pages, [0]);
  assert.equal(f.saved.length, 1);
  f.snapshot.anchor = 14;
  f.options.page = (_snapshot, after) => {
    f.pages.push(after);
    return Promise.resolve({ next: 14, unavailable: [] });
  };
  await f.sync.run(f.options);
  assert.deepEqual(f.pages, [0, 12]);
});
await test('old version rereads edits; removal or authority change invalidates the cursor and gaps cannot advance', async () => {
  const f = fixture();
  f.cursor({ version: 2, after: 12, removals: 0 });
  await f.sync.run(f.options);
  f.snapshot.removals++;
  await f.sync.run(f.options);
  f.snapshot.directory = 'b'.repeat(64);
  await f.sync.run(f.options);
  assert.deepEqual(f.pages, [0, 0, 0]);
  const g = fixture();
  g.options.page = () =>
    Promise.resolve({ next: 12, unavailable: ['unavailable'] });
  await assert.rejects(g.sync.run(g.options), /DM unavailable/u);
  assert.equal(g.saved.length, 0);
});
await test('changed snapshot during reading and cancellation publish no cursor; pagination without progress fails', async () => {
  const f = fixture(),
    pending = deferred<{ next: number; unavailable: string[] }>();
  f.options.page = () => pending.promise;
  const read = f.sync.run(f.options);
  await new Promise<void>((resolve) => setImmediate(resolve));
  f.snapshot.removals++;
  pending.resolve({ next: 12, unavailable: [] });
  await assert.rejects(read, /changed/u);
  assert.equal(f.saved.length, 0);
  const g = fixture();
  g.options.page = () => Promise.resolve({ next: 0, unavailable: [] });
  await assert.rejects(g.sync.run(g.options), /pagination/u);
  g.options.guard = () => {
    throw new Error('Session changed');
  };
  await assert.rejects(g.sync.run(g.options), /[Ss]ession/u);
  assert.equal(g.saved.length, 0);
});

await test('public DM commits finite batches during continuous arrivals without repeating pages or losing edits', async () => {
  const f = fixture();
  f.snapshot.anchor = 48;
  const confirmed: number[] = [],
    anchors: number[] = [];
  f.options.page = (target, after) => {
    f.pages.push(after);
    anchors.push((target as typeof f.snapshot).anchor);
    f.snapshot.anchor += 16;
    const next = Math.min(after + 16, (target as typeof f.snapshot).anchor);
    for (let n = after + 1; n <= next; n++) confirmed.push(n);
    return Promise.resolve({ next, unavailable: [] });
  };
  for (let turn = 0; turn < 3; turn++) {
    if (turn < 2)
      await assert.rejects(f.sync.run(f.options), expectedInterruption);
    else assert.equal((await f.sync.run(f.options)).anchor, 48);
  }
  assert.deepEqual(f.pages, [0, 16, 32]);
  assert.deepEqual(anchors, [48, 48, 48]);
  assert.equal(new Set(confirmed).size, 48);
  assert.equal(f.saved.length, 3);
  await assert.rejects(f.sync.run(f.options), expectedInterruption);
  assert.equal(f.pages.at(-1), 48);
});
await test('concurrent account and foreground wakeups share one page and session reset cannot reuse it', async () => {
  const f = fixture(),
    held = deferred<{ next: number; unavailable: string[] }>();
  f.options.page = () => {
    f.pages.push(0);
    return held.promise;
  };
  const first = f.sync.run(f.options),
    second = f.sync.run(f.options);
  assert.equal(first, second);
  await new Promise<void>((resolve) => setImmediate(resolve));
  f.sync.reset();
  held.resolve({ next: 12, unavailable: [] });
  await assert.rejects(first, /Session changed/u);
  assert.equal(f.saved.length, 0);
});
await test('a canceled final check retains the confirmed prefix and a restarted owner resumes its durable cursor', async () => {
  const f = fixture();
  f.snapshot.anchor = 32;
  f.options.page = (_target, after) => {
    f.pages.push(after);
    return Promise.resolve({ next: after + 16, unavailable: [] });
  };
  await assert.rejects(f.sync.run(f.options), expectedInterruption);
  const resumed = new DmHistorySynchronization();
  assert.equal((await resumed.run(f.options)).anchor, 32);
  assert.deepEqual(f.pages, [0, 16]);
});

await test('expected interruption during final public confirmation publishes no cursor and does not reread the page', async () => {
  const f = fixture();
  let checks = 0;
  f.options.snapshot = () => {
    checks++;
    return checks === 2
      ? Promise.reject(new WorkInterruption('navigation'))
      : Promise.resolve({ ...f.snapshot });
  };
  await assert.rejects(f.sync.run(f.options), expectedInterruption);
  assert.equal(f.saved.length, 0);
  await f.sync.run(f.options);
  assert.deepEqual(f.pages, [0]);
  assert.equal(f.saved.length, 1);
});

await test('a version 3 client that skipped author deletions is replayed before publishing version 4', async () => {
  const f = fixture();
  f.cursor({ ...f.snapshot, version: 3, after: f.snapshot.anchor });
  await f.sync.run(f.options);
  assert.deepEqual(f.pages, [0]);
  assert.deepEqual(f.saved[0], {
    ...f.snapshot,
    version: 4,
    after: f.snapshot.anchor,
  });
});

await test('a final page can provide confirmation from the same authority turn without another snapshot request', async () => {
  const f = fixture();
  let snapshots = 0;
  f.options.snapshot = () => {
    snapshots++;
    return Promise.resolve({ ...f.snapshot });
  };
  f.options.page = () =>
    Promise.resolve({
      next: null,
      unavailable: [],
      confirmation: { ...f.snapshot },
    });
  await f.sync.run(f.options);
  assert.equal(snapshots, 1);
  assert.equal(f.saved.length, 1);
});
await test('inline final confirmation still rejects changed removals before exposing progress', async () => {
  const f = fixture();
  f.options.page = () =>
    Promise.resolve({
      next: null,
      unavailable: [],
      confirmation: { ...f.snapshot, removals: 1 },
    });
  await assert.rejects(f.sync.run(f.options), /DM history changed/u);
  assert.equal(f.saved.length, 0);
});

await test('local window preparation cannot reuse a confirmation obtained before a removal changed', async () => {
  const f = fixture();
  const originalPage = f.options.page;
  let checks = 0;
  const options = {
    ...f.options,
    snapshot: () => {
      checks++;
      return Promise.resolve({ ...f.snapshot });
    },
    page: async (snapshot: typeof f.snapshot, after: number) => ({
      ...(await originalPage(snapshot, after)),
      confirmation: { ...snapshot },
    }),
    prepare: () => {
      f.snapshot.removals++;
      return Promise.resolve('prepared' as const);
    },
  };
  await assert.rejects(f.sync.run(options), /DM history changed/);
  assert.equal(checks, 2, 'prepared content requires a new final snapshot');
  assert.equal(f.saved.length, 0);
});
