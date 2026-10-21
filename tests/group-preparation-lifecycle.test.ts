import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupPreparationFixture } from './fixtures/group-preparation.ts';
import { deferred } from './fixtures/deferred.ts';

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
await test('A/B/C navigation during continuous private arrival preserves the actual group preparation and never overlaps SDKs', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = groupPreparationFixture();
  for (let n = 0; n < 144; n++) f.add();
  const notices: string[] = [],
    incoming: number[] = [],
    received: number[] = [],
    selections: string[] = [];
  let next = 0,
    groupDone = false;
  const sync = new f.Synchronization({
    state: () => ({
      generation: 0,
      connected: true,
      session: true,
      online: true,
      visible: true,
      suspended: false,
      liveConnecting: false,
    }),
    status() {},
    notice: (text) => notices.push(text),
    complete() {},
    renderPending: async () => {},
    pause: () => f.controller.pauseSynchronization(),
    preloadDirect: () => {
      received.push(...incoming.splice(0, 16));
      return Promise.resolve(incoming.length > 0);
    },
    preloadGroups: async (signal) => {
      const more = await f.controller.synchronizeAll(signal);
      groupDone = !more;
      return more;
    },
    unread: async () => {},
    groupProjection: async () => {},
    presence: async () => {},
    refresh: async () => {},
    changes: async () => {},
    changeMaintenance: [async () => {}, async () => {}, async () => {}],
    periodic: async () => {},
    periodicWork: () => Promise.resolve(false),
    pending: () => Promise.resolve([]),
    sendPending: async () => {},
  });
  t.after(() => {
    sync.close();
    f.controller.setSession(null);
  });
  const visits = new f.Visits<string>({
    connected: () => true,
    available: () => sync.presentationReady,
    backgroundReady: () => false,
    reusable: () => true,
    select: (peer) => {
      f.controller.deselect();
      selections.push(peer);
    },
    restore: () => true,
    background: async () => {},
    check: async () => {},
    failed: () => assert.fail('Unexpected projection failure'),
  });
  f.data.request = (operation) => {
    if (
      operation !== 'group-message-index' &&
      operation !== 'group-message-confirm'
    )
      return Promise.resolve();
    if (operation === 'group-message-index')
      assert.equal(
        f.data.openings,
        0,
        'Metadata-only index pages must not initialize the SDK',
      );
    incoming.push(++next);
    sync.requestInbox('direct');
    for (const peer of ['A', 'B', 'C']) assert.equal(visits.open(peer), true);
    return Promise.resolve();
  };
  sync.resume();
  for (let step = 0; step < 100 && !groupDone; step++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  assert.equal(
    groupDone,
    true,
    'Preparation completes while arrivals are still enabled',
  );
  for (let step = 0; step < 4; step++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  assert.equal(selections.at(-1), 'C');
  assert.equal(f.data.maximum, 1);
  assert.deepEqual(f.data.pages, [0, 16, 32, 48, 64, 80, 96, 112, 128, 144]);
  assert.equal(new Set(received).size, next);
  assert.equal(received.length, next);
  assert.deepEqual(notices, []);
  assert.ok(f.data.signals.every((signal) => !signal.aborted));
});
for (const invalidation of ['logout', 'revoke', 'removal'] as const) {
  await test(`${invalidation} during group confirmation never completes or publishes stale preparation`, async () => {
    const f = groupPreparationFixture(),
      gate = deferred<void>(),
      entered = deferred<void>();
    f.data.request = async (operation) => {
      if (operation === 'group-message-confirm') {
        entered.resolve();
        await gate.promise;
      }
    };
    const request = f.controller.synchronizeAll(new AbortController().signal);
    const rejected = assert.rejects(request);
    await entered.promise;
    if (invalidation === 'logout') f.controller.setSession(null);
    else if (invalidation === 'revoke') f.controller.revokeAuthority();
    else f.controller.removed();
    gate.resolve();
    await rejected;
    assert.equal(f.controller.views.length, 0);
    assert.equal(f.controller.selected, null);
    assert.equal(f.data.active, 0);
  });
}
