import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coordinatorFixture } from './fixtures/message-coordinator.ts';
import { decodeDailyText, encodeDailyText } from '../src/shared/daily/index.ts';
import type { Peer } from '../src/shared/contacts/index.ts';
import { messageStates } from '../src/client/message-state/index.ts';
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
async function finishStartupMaintenance(
  t: import('node:test').TestContext,
): Promise<void> {
  for (let step = 0; step < 9; step++) {
    t.mock.timers.tick(1000);
    await turn();
  }
}
async function advanceMaintenanceUntil(
  t: import('node:test').TestContext,
  ready: () => boolean,
): Promise<void> {
  for (let step = 0; step < 12 && !ready(); step++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  assert.ok(
    ready(),
    'The requested maintenance owner must continue within bounded turns',
  );
}
const peer = (accountId: string): Peer => ({
  accountId,
  ecosystem: 'evm',
  address: '0x' + '1'.repeat(40),
  name: 'Synthetic',
});

await test('a categorized private update verifies the visible chat before counters without unrelated maintenance', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  await f.messages.openContact(peer('categorized-private'));
  await finishStartupMaintenance(t);
  f.calls.length = 0;
  f.state.probeChanged = true;
  f.emit('private-messages');
  t.mock.timers.tick(150);
  await turn();
  assert.ok(f.calls.includes('synchronize'));
  assert.ok(!f.calls.includes('states'));
  await advanceMaintenanceUntil(t, () => f.calls.includes('states'));
  assert.ok(f.calls.indexOf('synchronize') < f.calls.indexOf('states'));
  await finishStartupMaintenance(t);
  for (const unrelated of ['contacts', 'groups', 'heartbeat'])
    assert.ok(!f.calls.includes(unrelated), unrelated);
  f.calls.length = 0;
  f.emit('handle-messages');
  f.emit('activity');
  f.emit('status');
  await finishStartupMaintenance(t);
  assert.deepEqual(f.calls, []);
});

await test('the selected chat preview publishes before remaining startup maintenance and clears on authorization loss', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdGroups = true;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  f.state.probeChanged = true;
  f.state.historyRows = [
    {
      id: 'new-message',
      kind: 'text',
      text: 'New verified preview',
      peer: 'preview-peer',
      own: false,
      hash: 'a'.repeat(64),
      state: messageStates.received,
      sequence: 2,
    },
  ];
  const opening = f.messages.openContact(peer('preview-peer'));
  await turn();
  f.groupLoad.resolve();
  await opening;
  assert.equal(f.previews().get('preview-peer')?.text, 'New verified preview');
  assert.ok(
    !f.calls.includes('heartbeat'),
    'Preview publication does not wait for startup presence',
  );
  f.emit('authorization');
  assert.equal(f.previews().size, 0);
});

await test('opening an uncached conversation does not restart completed account inboxes; live activity still does', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  f.state.probeChanged = true;
  const before = f.calls.filter((call) => call === 'preload').length;
  f.statusFrames.length = 0;
  await f.messages.openContact(peer('uncached'));
  assert.ok(
    !f.statusFrames.includes('Syncing…'),
    'Initial loading belongs to the history gate, not the global operation strip',
  );
  for (let tick = 0; tick < 3; tick++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  assert.equal(f.calls.filter((call) => call === 'preload').length, before);
  f.emit('changed');
  for (let tick = 0; tick < 8; tick++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  assert.ok(f.calls.filter((call) => call === 'preload').length > before);
});

await test('switching retained conversations projects immediately and coalesces checks outside foreground sync', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  f.state.restorablePeers.add('first');
  f.state.restorablePeers.add('second');
  f.calls.length = 0;
  for (const selected of ['first', 'second', 'first'])
    await f.messages.openContact(peer(selected));
  assert.deepEqual(
    f.calls.filter((call) => call.startsWith('restore:')),
    ['restore:first', 'restore:second', 'restore:first'],
  );
  assert.ok(!f.calls.includes('probe'));
  assert.ok(!f.calls.includes('synchronize'));
  assert.equal(
    f.input.disabled,
    false,
    'Retained navigation does not block the composer for a history request',
  );
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(f.calls.filter((call) => call === 'probe').length, 1);
  assert.equal(f.calls.filter((call) => call === 'read').length, 1);
  f.lose();
  assert.equal(f.state.restorablePeers.size, 0);
});

await test('a retained opening displays while unrelated contact maintenance still owns the engine', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  f.calls.length = 0;
  f.state.holdContacts = true;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  await advanceMaintenanceUntil(t, () => f.calls.includes('contacts'));
  f.state.restorablePeers.add('queued-retained');
  f.calls.length = 0;
  f.statusFrames.length = 0;
  const opening = f.messages.openContact(peer('queued-retained'));
  await turn();
  assert.ok(f.calls.includes('restore:queued-retained'));
  assert.ok(
    !f.statusFrames.includes('Syncing…'),
    'Waiting for an owner must not label a retained opening as history sync',
  );
  f.contactLoad.resolve();
  await opening;
  assert.ok(f.calls.includes('restore:queued-retained'));
  assert.ok(!f.calls.includes('probe'));
  assert.ok(!f.calls.includes('synchronize'));
  assert.ok(
    !f.statusFrames.includes('Syncing…'),
    'Reusing the retained window must not flash history synchronization',
  );
});

await test('selected history refreshes before counters and deferred contact maintenance', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  await f.messages.openContact(peer('live-count'));
  f.calls.length = 0;
  f.state.holdContacts = true;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.ok(f.calls.includes('probe'));
  assert.ok(!f.calls.includes('states'));
  await advanceMaintenanceUntil(t, () => f.calls.includes('states'));
  assert.ok(f.calls.indexOf('probe') < f.calls.indexOf('states'));
  assert.ok(
    !f.calls.includes('heartbeat'),
    'Presence must not delay the unread update',
  );
  f.contactLoad.resolve();
});

await test('mobile directory and app tabs retain previews; authority loss and permanent departure clear them', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  await f.messages.openContact(peer('preview-peer'));
  await turn();
  assert.equal(
    f.previews().get('preview-peer')?.text,
    'Latest received message',
  );
  f.state.chatVisible = false;
  f.messages.viewChanged();
  assert.equal(
    f.previews().get('preview-peer')?.text,
    'Latest received message',
  );
  f.emit('authorization');
  assert.equal(f.previews().size, 0);
  f.state.chatVisible = true;
  await f.messages.openContact(peer('preview-peer'));
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  f.messages.leave();
  assert.equal(
    f.previews().get('preview-peer')?.text,
    'Latest received message',
  );
  f.calls.length = 0;
  f.messages.resume();
  await turn();
  assert.ok(
    !f.calls.includes('contacts'),
    'Tab return must not reset the loaded contact directory',
  );
  f.pageHide(false);
  assert.equal(f.previews().size, 0);
});

for (const mode of ['edit', 'reply'] as const)
  await test(`canceling a private ${mode} clears only an edit draft and preserves the original`, async (t) => {
    const f = coordinatorFixture(t);
    f.state.probeChanged = true;
    await f.messages.openContact(peer('cancel-edit'));
    const original = {
      id: 'original',
      peer: 'cancel-edit',
      own: true,
      kind: 'text' as const,
      text: encodeDailyText({
        text: 'Original message',
        reply: null,
        forwarded: false,
      }),
      state: 'received',
      hash: 'synthetic-hash',
    };
    f.choose(mode, original);
    assert.equal(f.compositionBar.hidden, false);
    f.input.value = 'Unsaved change';
    f.cancelComposition();
    assert.equal(f.input.value, mode === 'edit' ? '' : 'Unsaved change');
    assert.equal(f.compositionBar.hidden, true);
    assert.equal(decodeDailyText(original.text).text, 'Original message');
    if (mode === 'edit') {
      f.submit();
      await turn();
      assert.deepEqual(f.drafts, []);
    }
  });

await test('opening a verified conversation does not await speculative SDK initialization', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdInitialization = true;
  f.state.probeChanged = true;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  const opening = f.messages.openContact(peer('foreground'));
  await turn();
  try {
    assert.ok(f.calls.includes('synchronize'));
    assert.ok(f.calls.includes('read'));
    assert.ok(!f.calls.includes('initialize'));
  } finally {
    f.initialization.resolve();
    await opening;
  }
});

await test('consecutive Enter submissions remain enabled while a previous transmission is held', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('captured'));
  f.state.holdSend = true;
  for (const text of ['AAAAA', 'AAAAABBB', 'DADASEQWE']) {
    f.input.value = text;
    f.submit();
    await turn();
    assert.equal(
      f.send.disabled,
      false,
      'A saved text must not block the next Enter behind network IO.',
    );
    assert.equal(f.input.value, '');
  }
  assert.deepEqual(
    f.drafts.map((item) => decodeDailyText(item.text).text),
    ['AAAAA', 'AAAAABBB', 'DADASEQWE'],
  );
  assert.ok(!f.calls.includes('heartbeat'));
  f.state.holdSend = false;
  f.sending.resolve();
  await turn();
});

await test('typing after Enter is never cleared by the preceding delayed local save', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('captured'));
  f.state.holdSave = true;
  f.input.value = 'First';
  f.submit();
  f.input.value = 'Next draft';
  f.saving.resolve();
  await turn();
  assert.equal(f.input.value, 'Next draft');
});

await test('an automatic history recheck admits text while holding the network, but removal still disables sending immediately', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('captured'));
  f.state.holdHistory = true;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.calls.filter((call) => call === 'synchronize').length, 2);
  assert.equal(f.send.disabled, false);
  f.input.value = 'During automatic recheck';
  f.submit();
  await turn();
  assert.equal(
    decodeDailyText(f.drafts[0]!.text).text,
    'During automatic recheck',
  );
  assert.equal(f.input.value, '');
  f.emit('removed');
  assert.equal(
    f.send.disabled,
    true,
    'Immediate invalidation must retain its send gate.',
  );
  f.history.resolve();
  await turn();
});

await test('a row clicked after publication opens before unrelated startup work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdContacts = true;
  f.messages.ready();
  f.preferences();
  await turn();
  assert.ok(
    !f.calls.includes('heartbeat'),
    'Profile initialization must not precede the directory',
  );
  t.mock.timers.tick(150);
  await turn();
  assert.ok(f.calls.includes('contacts'));
  f.clickPeer(peer('chosen'));
  await turn();
  assert.ok(
    !f.calls.includes('select:chosen'),
    'Never change the SDK selection during directory loading',
  );
  f.contactLoad.resolve();
  await turn();
  assert.ok(f.calls.includes('select:chosen'));
  assert.ok(f.calls.includes('open-panel'));
  assert.ok(f.calls.includes('probe'));
  assert.ok(f.calls.includes('read'));
  assert.ok(!f.calls.includes('groups'));
  assert.ok(!f.calls.includes('heartbeat'));
});

await test('rapid startup taps keep only the latest recipient', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdContacts = true;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  f.clickPeer(peer('first'));
  f.clickPeer(peer('last'));
  f.contactLoad.resolve();
  await turn();
  assert.ok(!f.calls.includes('select:first'));
  assert.ok(f.calls.includes('select:last'));
});

await test('the chosen conversation permits drafting while verification runs and sending before global warmups', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdContacts = true;
  f.state.holdHistory = true;
  f.state.probeChanged = true;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  f.clickPeer(peer('chosen'));
  f.contactLoad.resolve();
  await turn();
  assert.ok(f.calls.includes('open-panel'));
  assert.equal(f.input.disabled, false);
  assert.equal(
    f.send.disabled,
    true,
    'Unverified history must not permit sending',
  );
  f.input.value = 'Synthetic edited draft';
  f.history.resolve();
  await turn();
  assert.equal(f.input.value, 'Synthetic edited draft');
  assert.equal(f.send.disabled, false);
  assert.ok(!f.calls.includes('groups'));
  f.submit();
  await turn();
  assert.ok(f.calls.includes('compose:chosen'));
  assert.ok(!f.calls.includes('heartbeat'));
});

for (const outcome of ['logout', 'failure', 'navigation'] as const)
  await test(`a queued startup tap cannot open a conversation after ${outcome}`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = coordinatorFixture(t);
    f.state.holdContacts = true;
    f.messages.ready();
    t.mock.timers.tick(150);
    await turn();
    f.clickPeer(peer('stale'));
    if (outcome !== 'failure') {
      if (outcome === 'logout') f.messages.setSession(null);
      else f.messages.leave();
      f.contactLoad.resolve();
    } else f.contactLoad.reject(new Error('Synthetic directory failure'));
    await turn();
    assert.ok(!f.calls.includes('select:stale'));
    assert.ok(!f.calls.includes('groups'));
  });

await test('a user opening waits for one current maintenance step, not every startup task', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdGroups = true;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  assert.ok(f.calls.includes('groups'));
  const opening = f.messages.openContact(peer('chosen'));
  await turn();
  assert.ok(!f.calls.includes('select:chosen'));
  f.groupLoad.resolve();
  await opening;
  assert.ok(f.calls.includes('select:chosen'));
  assert.ok(!f.calls.includes('heartbeat'));
});

await test('a coalesced full refresh retains the visible live request priority after startup', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  await f.messages.openContact(peer('recipient'));
  f.directoryWork.length = 0;
  f.lose();
  f.messages.ready();
  f.emit('ready');
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.ok(f.directoryWork.length > 0);
  assert.ok(
    f.directoryWork.every((work) => work.priority === 'interactive'),
    'An upgraded live request must not become ordinary maintenance during directory loading',
  );
});

await test('removal closes the current conversation before secondary live consumers can enqueue work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const order: string[] = [];
  const f = coordinatorFixture(t, {
    liveEvent: () => {
      order.push(
        f.calls.includes('removed') ? 'closed-first' : 'secondary-first',
      );
    },
  });
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  await f.messages.openContact(peer('recipient'));
  f.emit('removed');
  assert.deepEqual(order, ['closed-first']);
});

await test('returning from page cache resumes startup maintenance and preference handling', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  f.pageHide(true);
  t.mock.timers.tick(10000);
  await turn();
  assert.ok(!f.calls.includes('groups'));
  f.pageShow();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  const before = f.calls.length;
  f.preferences();
  await turn();
  assert.ok(f.calls.slice(before).includes('heartbeat'));
});

await test('leaving cancels an opening already waiting for the current maintenance step', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdGroups = true;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  f.clickPeer(peer('cancelled'));
  f.messages.leave();
  f.groupLoad.resolve();
  await turn();
  assert.ok(!f.calls.includes('select:cancelled'));
  assert.ok(!f.calls.includes('open-panel'));
});

await test('screen prepares messages without a click; ready and tab return cannot reinitialize the session', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.calls.filter((op) => op === 'initialize').length, 0);
  await finishStartupMaintenance(t);
  assert.equal(f.calls.filter((op) => op === 'initialize').length, 1);
  assert.equal(f.calls.filter((op) => op === 'preload').length, 1);
  for (let index = 0; index < 3; index++) {
    f.visibility('hidden');
    f.visibility('visible');
    f.emit('ready');
    t.mock.timers.tick(150);
    await turn();
  }
  assert.equal(f.calls.filter((op) => op === 'initialize').length, 1);
});

for (const selected of [false, true])
  await test(`a live hint preserves the active page; removal closes immediately: selected=${selected}`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = coordinatorFixture(t);
    if (selected) await f.messages.openContact(peer('selected-live'));
    f.state.holdPage = true;
    f.messages.ready();
    t.mock.timers.tick(150);
    await turn();
    await finishStartupMaintenance(t);
    const signal = f.state.signals[0];
    assert.ok(signal);
    const before = f.calls.length;
    f.emit('changed');
    t.mock.timers.tick(150);
    await turn();
    assert.equal(signal.aborted, false);
    assert.equal(f.calls.slice(before).includes('abort-direct'), false);
    f.emit('removed');
    assert.equal(signal.aborted, true);
    assert.ok(f.calls.includes('removed'));
    f.page.resolve(false);
    await turn();
  });

await test('opening another conversation marks it read without repeating maintenance for all conversations', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  const before = f.calls.length;
  await f.messages.openContact({
    accountId: 'peer',
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Sintético',
  });
  const calls = f.calls.slice(before);
  assert.ok(calls.includes('probe'));
  assert.ok(calls.includes('read'));
  assert.ok(!calls.includes('heartbeat'));
  assert.ok(!calls.includes('states'));
  assert.ok(!calls.includes('pins'));
});

await test('window without reuse checks identities before loading history', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  f.state.probeChanged = true;
  const before = f.calls.length;
  await f.messages.openContact({
    accountId: 'peer',
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Sintético',
  });
  const calls = f.calls.slice(before);
  assert.ok(calls.indexOf('probe') < calls.indexOf('pins'));
  assert.ok(calls.indexOf('pins') < calls.indexOf('synchronize'));
});

await test('returning to a tab with a current stream preserves the view and page being prepared', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdPage = true;
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  const signal = f.state.signals[0];
  assert.ok(signal);
  const before = f.calls.length;
  f.visibility('hidden');
  f.visibility('visible');
  t.mock.timers.tick(150);
  await turn();
  const calls = f.calls.slice(before);
  assert.equal(signal.aborted, false);
  assert.ok(!calls.includes('pause'));
  assert.ok(!calls.includes('live-stop'));
  assert.ok(!calls.includes('contacts'));
  f.page.resolve(false);
  await turn();
});

await test('effective suspension cancels preparation and closes the view; resume reconnects and checks', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdPage = true;
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  const signal = f.state.signals[0];
  assert.ok(signal);
  const before = f.calls.length;
  f.freeze();
  assert.equal(signal.aborted, true);
  assert.ok(f.calls.slice(before).includes('pause'));
  f.page.resolve(false);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  const frozen = f.calls.length;
  f.resume();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  await advanceMaintenanceUntil(t, () =>
    f.calls.slice(frozen).includes('contacts'),
  );
  assert.ok(f.calls.slice(frozen).includes('live-start'));
});

await test('return with a stale stream closes before reconnecting even without a freeze event', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  f.visibility('hidden');
  f.state.liveCurrent = false;
  const before = f.calls.length;
  f.visibility('visible');
  const calls = f.calls.slice(before);
  assert.ok(calls.includes('pause'));
  assert.ok(calls.includes('live-stop'));
  assert.ok(calls.indexOf('pause') < calls.indexOf('live-start'));
});

await test('a hidden hint waits without marking read and performs its current check after visibility', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  await f.messages.openContact({
    accountId: 'peer',
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Sintético',
  });
  f.visibility('hidden');
  const before = f.calls.length;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  const calls = f.calls.slice(before);
  assert.ok(!calls.includes('probe'));
  assert.ok(!calls.includes('read'));
  f.visibility('visible');
  t.mock.timers.tick(150);
  await turn();
  assert.ok(f.calls.slice(before).includes('probe'));
});

await test('connection loss and hidden-page deletion close the conversation immediately', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  f.visibility('hidden');
  const before = f.calls.length;
  f.lose();
  assert.ok(f.calls.slice(before).includes('pause'));
  f.emit('removed');
  assert.ok(f.calls.slice(before).includes('removed'));
  assert.ok(f.calls.slice(before).includes('suspend-groups'));
});

await test('a healthy idle group does not schedule a sync just because it is visible', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  f.state.groupVisible = true;
  const before = f.calls.length;
  for (let index = 0; index < 3; index++) await f.tick();
  assert.ok(!f.calls.slice(before).includes('group-retry'));
  f.state.groupPending = true;
  await f.tick();
  assert.ok(f.calls.slice(before).includes('group-retry'));
});

await test('verified history and startup resume do not await an automatic profile publication', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.withProfile = true;
  f.state.holdProfile = true;
  f.state.probeChanged = true;
  t.after(() => f.profile.resolve());
  let opened = false;
  const opening = f.messages.openContact(peer('chosen')).then(() => {
    opened = true;
  });
  await turn();
  assert.ok(
    f.calls.includes('synchronize'),
    'Profile transmission must not precede verified history.',
  );
  assert.ok(f.calls.includes('read'));
  assert.equal(opened, true);
  await opening;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  assert.equal(
    f.calls.filter((call) => call === 'synchronize').length,
    2,
    'Startup resumes the verified selection before profile transmission.',
  );
  await finishStartupMaintenance(t);
  assert.deepEqual(
    f.calls.filter((call) => call.startsWith('profile:')),
    ['profile:chosen'],
    'The selected approved contact is included even outside the loaded directory page.',
  );
  assert.ok(f.calls.indexOf('read') < f.calls.indexOf('profile:chosen'));
  f.profile.resolve();
  await turn();
});

await test('automatic profile publication waits for visibility and resumes without a live hint', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  await f.messages.openContact(peer('profile-peer'));
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  f.visibility('hidden');
  f.state.withProfile = true;
  f.preferences();
  await turn();
  assert.deepEqual(
    f.calls.filter((call) => call.startsWith('profile:')),
    [],
  );
  f.visibility('visible');
  t.mock.timers.tick(150);
  await turn();
  await f.tick();
  await turn();
  assert.deepEqual(
    f.calls.filter((call) => call.startsWith('profile:')),
    ['profile:profile-peer'],
  );
});

await test('visible return finishes a pending history check before starting profile distribution', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  t.after(() => f.history.resolve());
  f.state.probeChanged = true;
  await f.messages.openContact(peer('profile-peer'));
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  f.visibility('hidden');
  f.state.withProfile = true;
  f.state.holdHistory = true;
  f.emit('changed');
  f.visibility('visible');
  await turn();
  assert.deepEqual(
    f.calls.filter((call) => call.startsWith('profile:')),
    [],
  );
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(
    f.calls.filter((call) => call.startsWith('profile:')),
    [],
  );
  f.history.resolve();
  await turn();
  await f.tick();
  await turn();
  assert.deepEqual(
    f.calls.filter((call) => call.startsWith('profile:')),
    ['profile:profile-peer'],
  );
});

await test('profile preferences still distribute from a visible page after leaving the conversation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  await f.messages.openContact(peer('profile-peer'));
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  f.messages.leave();
  f.state.withProfile = true;
  f.preferences();
  await turn();
  await f.tick();
  await turn();
  assert.deepEqual(
    f.calls.filter((call) => call.startsWith('profile:')),
    ['profile:profile-peer'],
  );
});

await test('automatic selected-history refresh keeps maintenance priority while explicit opening stays interactive', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('chosen'));
  assert.deepEqual(f.priorities, [
    { operation: 'probe', priority: 'interactive' },
    { operation: 'pins', priority: 'interactive' },
    { operation: 'synchronize', priority: 'interactive' },
  ]);
  f.priorities.length = 0;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(
    f.priorities.filter((entry) => entry.operation !== 'pins'),
    [
      { operation: 'probe', priority: undefined },
      { operation: 'synchronize', priority: undefined },
    ],
  );
});

await test('a live change checks the visible conversation and defers hidden history while removals still invalidate immediately', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('chosen'));
  f.priorities.length = 0;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(
    f.priorities.filter((entry) => entry.operation !== 'pins'),
    [
      { operation: 'probe', priority: 'interactive' },
      { operation: 'synchronize', priority: 'interactive' },
    ],
  );
  f.priorities.length = 0;
  f.state.visibilityState = 'hidden';
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.priorities.length, 0);
  f.emit('removed');
  assert.ok(f.calls.includes('removed'));
  assert.equal(f.send.disabled, true);
  f.visibility('visible');
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(
    f.priorities.filter((entry) => entry.operation !== 'pins'),
    [
      { operation: 'probe', priority: 'interactive' },
      { operation: 'synchronize', priority: 'interactive' },
    ],
  );
});

await test('a text saved during a live recheck transmits before unrelated maintenance, which resumes afterward', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('foreground'));
  f.state.holdHistory = true;
  f.state.holdGroups = true;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  f.input.value = 'Send before unrelated updates';
  f.submit();
  await turn();
  const before = f.calls.length;
  f.state.holdHistory = false;
  f.history.resolve();
  await turn();
  assert.ok(
    f.calls.slice(before).includes('send-pending'),
    'A saved user message must not wait for another maintenance owner.',
  );
  assert.ok(!f.calls.slice(before).includes('groups'));
  assert.equal(
    f.priorities.findLast((entry) => entry.operation === 'send')?.priority,
    'interactive',
  );
  t.mock.timers.tick(1000);
  await turn();
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  await advanceMaintenanceUntil(t, () =>
    f.calls.slice(before).includes('groups'),
  );
  f.state.holdGroups = false;
  f.groupLoad.resolve();
  await turn();
});

await test('a newer visible live hint yields after current contacts before unrelated groups, without aborting current work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('receiving'));
  f.state.holdContacts = true;
  f.state.holdGroups = true;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  await advanceMaintenanceUntil(t, () => f.calls.includes('contacts'));
  const before = f.calls.length;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.ok(
    !f.calls.slice(before).includes('probe'),
    'The current contact owner finishes first',
  );
  f.state.holdContacts = false;
  f.contactLoad.resolve();
  await turn();
  t.mock.timers.tick(150);
  await turn();
  assert.ok(
    f.calls.slice(before).includes('probe'),
    'A fresh visible hint must not wait for unrelated groups',
  );
  assert.equal(
    f.priorities.findLast((entry) => entry.operation === 'probe')?.priority,
    'interactive',
  );
  f.state.holdGroups = false;
  f.groupLoad.resolve();
  await turn();
});

await test('first visible directory startup preserves its priority through contact loading while later refreshes stay maintenance', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.directoryWork[0]?.priority, 'interactive');
  await f.messages.openContact(peer('selected-after-startup'));
  f.directoryWork.length = 0;
  f.emit('authorization');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.directoryWork.length, 1);
  assert.equal(f.directoryWork[0]?.priority, undefined);
});

await test('returning to visibility resumes pending startup maintenance without requiring a new live hint', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  f.visibility('hidden');
  t.mock.timers.tick(1000);
  await turn();
  assert.ok(!f.calls.includes('groups'));
  f.visibility('visible');
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  assert.ok(f.calls.includes('initialize'));
});

await test('a reply after a verified live check is not trapped behind contacts or groups', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('quick-reply'));
  f.state.holdContacts = true;
  const before = f.calls.length;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.ok(f.calls.slice(before).includes('synchronize'));
  assert.ok(!f.calls.slice(before).includes('contacts'));
  f.input.value = 'Reply to the verified message';
  f.submit();
  await turn();
  assert.ok(f.calls.slice(before).includes('send-pending'));
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  for (let step = 0; step < 2; step++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  await advanceMaintenanceUntil(t, () =>
    f.calls.slice(before).includes('contacts'),
  );
  f.state.holdContacts = false;
  f.contactLoad.resolve();
  await turn();
});

await test('a selected group is checked before deferred directory maintenance', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.groupSelected = true;
  f.state.groupVisible = true;
  const before = f.calls.length;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(
    f.calls.slice(before).filter((call) => call === 'groups').length,
    1,
  );
  assert.ok(!f.calls.slice(before).includes('contacts'));
  for (let step = 0; step < 3; step++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  assert.ok(f.calls.slice(before).includes('contacts'));
  assert.equal(
    f.calls.slice(before).filter((call) => call === 'groups').length,
    1,
  );
});

await test('sending and continuous private updates never announce sync after history opens; actual failures keep retry visible', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('quiet-chat'));
  await finishStartupMaintenance(t);
  f.statusFrames.length = 0;
  f.state.holdSend = true;
  f.input.value = 'An ordinary outgoing message';
  f.submit();
  await turn();
  assert.ok(f.calls.includes('send-pending'));
  assert.equal(f.feedback.dataset['state'], 'ok');
  assert.deepEqual(new Set(f.statusFrames), new Set(['']));
  f.sending.resolve();
  await turn();
  for (const event of [
    'private-messages',
    'private-receipts',
    'removed',
  ] as const) {
    f.emit(event);
    await finishStartupMaintenance(t);
    assert.equal(f.feedback.dataset['state'], 'ok');
    assert.ok(!f.statusFrames.includes('Syncing…'));
  }
  f.state.historyFailure = new Error('Could not prepare conversation history.');
  f.emit('private-messages');
  await finishStartupMaintenance(t);
  assert.equal(f.feedback.dataset['state'], 'notice');
  assert.equal(
    f.statusFrames.at(-1),
    'Could not prepare conversation history.',
  );
  assert.equal(f.refreshButton.textContent, 'Try again');
  f.state.historyFailure = null;
  f.retry();
  await turn();
  await finishStartupMaintenance(t);
  assert.equal(f.feedback.dataset['state'], 'ok');
  assert.equal(f.statusFrames.at(-1), '');
});
