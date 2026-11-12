import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dmCoordinatorFixture } from './fixtures/dm-coordinator.ts';
import type { SocialDms } from '../src/client/social-dm/index.ts';
import type { AttachmentSelection } from '../src/client/attachments/index.ts';
import type { SocialRelation } from '../src/shared/social-dm/index.ts';
import { deferred } from './fixtures/deferred.ts';
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

await test('DM initializes once per session and the latest navigation waits for the previous one', async (t) => {
  const f = dmCoordinatorFixture(t);
  f.ui.mount(f.host, 'first');
  await turn();
  f.hold();
  f.ui.mount(f.host, 'held');
  await turn();
  f.ui.mount(f.host, 'stale');
  f.ui.mount(f.host, 'latest');
  f.release('held');
  await turn();
  await turn();
  assert.equal(f.calls.filter((call) => call === 'initialize').length, 1);
  assert.equal(f.views.at(-1)?.title.textContent, 'latest');
  assert.equal(f.calls.includes('read:stale'), false);
  assert.equal(f.calls.includes('read:held'), false);
  assert.equal(f.calls.includes('read:latest'), true);
});
await test('notifications during an operation coalesce; removal closes immediately and an old result cannot reopen', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t);
  f.ui.mount(f.host, 'first');
  await turn();
  f.hold();
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  f.emit('changed');
  f.emit('removed');
  assert.equal(f.views.at(-1)?.history.hidden, true);
  f.release('first');
  await turn();
  assert.equal(f.views.at(-1)?.history.hidden, true);
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.views.at(-1)?.history.hidden, false);
  assert.equal(f.calls.filter((call) => call === 'read:first').length, 2);
});

await test('a cold stream notification does not cancel the signed mobile DM list', async (t) => {
  const f = dmCoordinatorFixture(t);
  f.holdList();
  f.ui.mount(f.host, null);
  await turn();
  assert.equal(f.calls.filter((call) => call === 'list').length, 1);
  f.changeLive(false, true);
  f.releaseList();
  await turn();
  assert.match(f.host.textContent ?? '', /No handle conversations yet/u);
  assert.doesNotMatch(f.host.textContent ?? '', /DM session changed/u);
});

await test('stream loss cancels stale list IO without publishing a session error and rechecks after the handshake', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t);
  f.holdList();
  f.ui.mount(f.host, null);
  await turn();
  f.changeLive(true);
  f.changeLive(false, true);
  f.releaseList();
  await turn();
  assert.doesNotMatch(f.host.textContent ?? '', /DM session changed/u);
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.calls.filter((call) => call === 'list').length, 1);
  f.changeLive(true);
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  assert.match(f.host.textContent ?? '', /No handle conversations yet/u);
  assert.equal(f.calls.filter((call) => call === 'list').length, 2);
});

await test('a genuine signed DM list failure remains visible', async (t) => {
  const f = dmCoordinatorFixture(t);
  f.holdList();
  f.ui.mount(f.host, null);
  await turn();
  f.releaseList(Response.json({ error: 'DM unavailable.' }, { status: 503 }));
  await turn();
  assert.match(f.host.textContent ?? '', /DM unavailable.*HTTP 503/u);
});

await test('suspension cancels an in-flight signed list and page return rechecks it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t);
  f.holdList();
  f.ui.mount(f.host, null);
  await turn();
  f.window.dispatchEvent(new Event('pagehide'));
  f.releaseList();
  await turn();
  assert.doesNotMatch(f.host.textContent ?? '', /DM session changed/u);
  f.window.dispatchEvent(new Event('pageshow'));
  t.mock.timers.tick(150);
  await turn();
  assert.match(f.host.textContent ?? '', /No handle conversations yet/u);
});

await test('logout discards the old signed list without reopening a DM view', async (t) => {
  const f = dmCoordinatorFixture(t);
  f.holdList();
  f.ui.mount(f.host, null);
  await turn();
  f.ui.setSession(null);
  f.releaseList();
  await turn();
  assert.equal(f.host.textContent, '');
  assert.equal(f.calls.filter((call) => call === 'list').length, 1);
});

await test('visible handle conversation opening and live reception retain foreground authority priority', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t);
  f.ui.mount(f.host, 'recipient');
  await turn();
  assert.deepEqual(f.priorities, [
    { operation: 'initialize', priority: 'interactive' },
    { operation: 'state', priority: 'interactive' },
    { operation: 'read', priority: 'interactive' },
  ]);
  f.priorities.length = 0;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(f.priorities, [
    { operation: 'state', priority: 'interactive' },
    { operation: 'read', priority: 'interactive' },
  ]);
});

await test('hidden handle hints coalesce until visible and removal still closes immediately', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t);
  f.ui.mount(f.host, 'recipient');
  await turn();
  const before = f.calls.filter((call) => call === 'read:recipient').length;
  f.visibility('hidden');
  for (let count = 0; count < 4; count++) f.emit('changed');
  f.emit('removed');
  assert.equal(f.views.at(-1)?.history.hidden, true);
  t.mock.timers.tick(30000);
  await turn();
  assert.equal(
    f.calls.filter((call) => call === 'read:recipient').length,
    before,
  );
  f.visibility('visible');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(
    f.calls.filter((call) => call === 'read:recipient').length,
    before + 1,
  );
  assert.equal(f.views.at(-1)?.history.hidden, false);
  const settled = f.calls.length;
  f.visibility('hidden');
  f.visibility('visible');
  f.emit('call');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(
    f.calls.length,
    settled,
    'Healthy visibility and call-only hints must not create idle history polling',
  );
});

await test('public A/B/C navigation preserves account preparation and restores verified A while B IO is held', async (t) => {
  const f = dmCoordinatorFixture(t);
  f.ui.mount(f.host, 'A');
  await turn();
  f.hold();
  f.ui.mount(f.host, 'B');
  await turn();
  f.ui.mount(f.host, 'C');
  f.ui.mount(f.host, 'A');
  assert.equal(f.views.at(-1)?.title.textContent, 'A');
  assert.equal(f.views.at(-1)?.history.hidden, false);
  assert.equal(f.cancellations, 0);
  f.release('B');
  await turn();
  await turn();
  assert.equal(f.views.at(-1)?.title.textContent, 'A');
  assert.equal(f.calls.includes('read:C'), false);
  assert.equal(f.calls.includes('read:B'), false);
});
await test('public continuation preserves the shown page; a real abort remains a visible failure', async (t) => {
  const f = dmCoordinatorFixture(t);
  f.ui.mount(f.host, 'A');
  await turn();
  f.failRead(f.continuation());
  f.ui.mount(f.host, 'A');
  await turn();
  assert.equal(f.views.at(-1)?.history.hidden, false);
  assert.equal(f.cancellations, 0);
  f.failRead(new DOMException('Actual transport abort', 'AbortError'));
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  await turn();
  assert.equal(f.views.at(-1)?.history.hidden, true);
  assert.match(
    f.views.at(-1)?.gate.textContent ?? '',
    /operation could not be completed/u,
  );
});
for (const event of [
  'removed',
  'authorization',
  'revoked',
  'ended',
  'invalidated',
] as const)
  await test(`public memory navigation discards all projections immediately on ${event}`, async (t) => {
    const f = dmCoordinatorFixture(t);
    f.ui.mount(f.host, 'A');
    await turn();
    f.emit(event);
    f.hold();
    f.ui.mount(f.host, 'A');
    await turn();
    assert.match(f.host.textContent ?? '', /Opening conversation/u);
    f.release('A');
    await turn();
  });

await test('a delayed public media-draft result cannot change the composer after navigating back to a confirmed chat', async (t) => {
  const f = dmCoordinatorFixture(t);
  f.ui.mount(f.host, 'A');
  await turn();
  f.holdMedia('B');
  f.ui.mount(f.host, 'B');
  await turn();
  assert.ok(f.calls.includes('media:B'));
  f.ui.mount(f.host, 'A');
  f.composerStates.length = 0;
  f.releaseMedia();
  await turn();
  await turn();
  assert.equal(f.views.at(-1)?.title.textContent, 'A');
  assert.ok(f.composerStates.every((state) => !state.pending));
});

await test('continuous public DM updates keep an already loaded thread quiet and visible', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!;
  for (let round = 0; round < 6; round++) {
    f.emit(round % 2 ? 'handle-receipts' : 'handle-messages');
    t.mock.timers.tick(150);
    await turn();
    assert.equal(
      f.views.at(-1),
      current,
      'Refresh must retain the current frame',
    );
    assert.equal(current.history.hidden, false);
    assert.doesNotMatch(current.gate.textContent, /[Ss]ync|Opening|Loading/u);
  }
  assert.ok(f.calls.filter((operation) => operation === 'read:A').length > 1);
});

function message(
  id = 'message',
  sequence = 1,
): Awaited<ReturnType<SocialDms['cached']>>['items'][number] {
  return {
    type: 'dm-message',
    id,
    hash: 'synthetic',
    self: 'self',
    peer: { id: 'A', handle: 'synthetic', avatar: null },
    sequence,
    own: true,
    kind: 'text',
    media: null,
    text: 'Original text',
    displayText: 'Original text',
    sender: 'self',
    sentAt: 1,
    edited: false,
    reactions: [],
    ownReaction: '',
  };
}

function accountRelation(): SocialRelation {
  return {
    peer: { id: crypto.randomUUID(), handle: 'synthetic', avatar: null },
    requester: crypto.randomUUID(),
    state: 'approved',
    revision: 1,
    blocked: false,
    blockRevision: 0,
    canSend: true,
  };
}

for (const waitFor of ['media', 'settings'] as const)
  await test(`visible verified handle rows paint while ${waitFor} work is held`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = dmCoordinatorFixture(t);
    f.ui.mount(f.host, 'A');
    await turn();
    const current = f.views.at(-1)!;
    const settings = deferred<void>();
    if (waitFor === 'media') f.holdMedia('A');
    else f.data.settingsWait = settings.promise;
    const baseline = {
      calls: f.calls.length,
      settings: f.data.settingsLoads.length,
    };

    for (const n of [1, 2]) {
      f.data.items = [
        ...f.data.items,
        { ...message(`incoming-${n}`, n), own: false },
      ];
      f.emit('handle-messages');
      t.mock.timers.tick(150);
      await turn();
      assert.equal(f.views.at(-1), current);
      assert.equal(current.history.hidden, false);
      assert.deepEqual(
        current.history
          .querySelectorAll('[data-message]')
          .map((row) => row.dataset['message']),
        Array.from({ length: n }, (_, index) => `incoming-${index + 1}`),
      );
    }
    assert.equal(
      f.calls.slice(baseline.calls).filter((call) => call === 'read:A').length,
      2,
    );
    if (waitFor === 'media') {
      assert.equal(
        f.calls.slice(baseline.calls).filter((call) => call === 'media:A')
          .length,
        1,
      );
      f.releaseMedia();
    } else {
      assert.equal(f.data.settingsLoads.length, baseline.settings + 1);
      f.data.settingsWait = null;
      settings.resolve();
    }
    await turn();
  });

await test('both public wakeup listeners share one selected receipt and the account only projects', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t);
  f.ui.mount(f.host, 'A');
  await turn();
  f.data.accountItems = [accountRelation()];
  f.ui.ready();
  await turn();
  assert.equal(f.data.accountReceives, 0);
  const before = f.calls.filter((call) => call === 'read:A').length;
  f.data.items = [{ ...message('received'), own: false }];
  f.ui.event('handle-messages');
  f.emit('handle-messages');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.calls.filter((call) => call === 'read:A').length, before + 1);
  assert.equal(f.data.accountReceives, 0);
  assert.equal(f.data.unreadProjections, 1);
});

await test('leaving a handle chat before its queued refresh hands receipt to the account inbox', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t);
  f.ui.mount(f.host, 'A');
  await turn();
  f.data.accountItems = [accountRelation()];
  f.ui.ready();
  const before = f.calls.filter((call) => call === 'read:A').length;
  f.ui.event('handle-messages');
  f.emit('handle-messages');
  f.ui.leave();
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.calls.filter((call) => call === 'read:A').length, before);
  assert.equal(f.data.accountReceives, 1);
  assert.equal(f.data.unreadProjections, 1);
});

await test('DM refresh retains unchanged rows and disposes changed or departed content', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t);
  f.data.items = [message()];
  f.ui.mount(f.host, 'A');
  await turn();
  const original = f.data.bubbles[0]!;
  f.emit('handle-receipts');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.data.bubbles.length, 1);
  assert.equal(original.stopped, false);
  f.data.items = [
    {
      ...message(),
      text: 'Edited text',
      displayText: 'Edited text',
      edited: true,
    },
  ];
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(original.stopped, true);
  assert.equal(f.data.bubbles.length, 2);
  assert.equal(
    f.views
      .at(-1)!
      .history.children.filter((row) => row.dataset['message'])
      .map((row) => row.textContent)
      .join(''),
    'Edited text',
  );
  f.ui.leave();
  assert.ok(
    f.data.bubbles.every((bubble) => bubble.stopped && bubble.signal.aborted),
  );
  assert.ok(f.data.menus.every((menu) => menu.stopped));
});

await test('local DM history is read-only and never fetches the live conversation', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  f.data.items = [message()];
  f.ui.mount(f.host, 'A', true);
  await turn();
  const current = f.views.at(-1)!;
  assert.equal(current.form.hidden, true);
  assert.ok(f.calls.includes('cached:A'));
  assert.ok(
    !f.calls.some(
      (call) =>
        call === 'initialize' ||
        call.startsWith('state:') ||
        call.startsWith('read:'),
    ),
  );
  assert.equal(f.data.menus[0]!.react, undefined);
  assert.equal(f.data.menus[0]!.edit, undefined);
  current.text.value = 'Must not send';
  current.form.dispatchEvent(new Event('submit'));
  await turn();
  assert.equal(f.data.sends.length, 0);
});

await test('failed queued DM text stays retryable with the same ID and does not block the composer', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!;
  f.data.sendFailure = new Error('Transport unavailable');
  current.text.value = 'Retry this text';
  current.form.dispatchEvent(new Event('submit'));
  assert.equal(current.text.value, '');
  await turn();
  const failed = current.history.querySelector('.message-send-failed');
  assert.ok(failed);
  f.data.sendFailure = null;
  failed.click();
  await turn();
  assert.equal(f.data.sends.length, 2);
  assert.equal(f.data.sends[0]!.id, f.data.sends[1]!.id);
  assert.equal(current.history.querySelector('.message-send-failed'), null);
  current.text.value = 'A second message';
  current.form.dispatchEvent(new Event('submit'));
  await turn();
  assert.notEqual(f.data.sends[1]!.id, f.data.sends[2]!.id);
});

await test('public texts clear immediately, retain FIFO IDs and need no foreground readback after acceptance', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!;
  let release: () => void = () => {};
  f.data.sendWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls = f.calls.length;
  for (const text of ['One', 'Two', 'Three']) {
    current.text.value = text;
    current.form.dispatchEvent(new Event('submit'));
    assert.equal(current.text.value, '');
  }
  await turn();
  assert.deepEqual(
    f.data.savedTexts.map((draft) => draft.text),
    ['One', 'Two', 'Three'],
  );
  assert.equal(
    current.history.querySelectorAll('[data-outgoing-text]').length,
    3,
  );
  f.hold();
  release();
  await turn();
  assert.deepEqual(
    f.data.sends.map((draft) => draft.text),
    ['One', 'Two', 'Three'],
  );
  assert.equal(new Set(f.data.sends.map((draft) => draft.id)).size, 3);
  assert.deepEqual(f.calls.slice(calls), []);
  assert.equal(current.history.querySelector('.message-send-failed'), null);
  f.release('A');
});

await test('public queued text keeps its captured peer when navigation changes before acceptance', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!;
  let release: () => void = () => {};
  f.data.sendWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  current.text.value = 'For A';
  current.form.dispatchEvent(new Event('submit'));
  await turn();
  f.ui.mount(f.host, 'B');
  await turn();
  release();
  await turn();
  assert.equal(f.data.sends[0]?.peer, 'A');
  assert.equal(
    f.views.at(-1)!.history.querySelector('[data-outgoing-text]'),
    null,
  );
});

await test('account readiness drains recovered public texts across peers without opening a conversation', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  const drafts = Array.from({ length: 18 }, (_, n) => ({
    id: crypto.randomUUID(),
    peer: n % 2 ? 'A' : 'B',
    text: `Recovered ${n}`,
  }));
  f.data.textDrafts.push(...drafts);
  f.ui.ready();
  await turn();
  assert.deepEqual(f.data.sends, drafts);
  assert.deepEqual(f.data.textDrafts, []);
  assert.equal(f.views.length, 0);
  f.ui.ready();
  await turn();
  assert.equal(f.data.sends.length, 18);
});

await test('late public text acceptance after logout cannot repopulate the view', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!;
  let release: () => void = () => {};
  f.data.sendWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  current.text.value = 'Old session';
  current.form.dispatchEvent(new Event('submit'));
  await turn();
  f.ui.setSession(null);
  release();
  await turn();
  assert.equal(f.host.textContent, '');
});

await test('suspending a queued public text resumes its original ID on return without a false session failure', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  let release: () => void = () => {};
  f.data.sendWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = f.views.at(-1)!;
  current.text.value = 'Continue on return';
  current.form.dispatchEvent(new Event('submit'));
  await turn();
  f.visibility('hidden');
  f.window.dispatchEvent(new Event('pagehide'));
  release();
  await turn();
  assert.equal(f.data.sends.length, 1);
  assert.equal(f.data.textDrafts.length, 1);
  assert.doesNotMatch(f.host.textContent ?? '', /Session changed/u);
  f.data.sendWait = null;
  f.visibility('visible');
  await turn();
  assert.equal(f.data.sends.length, 2);
  assert.equal(f.data.sends[0]!.id, f.data.sends[1]!.id);
  assert.equal(f.data.textDrafts.length, 0);
  assert.doesNotMatch(f.host.textContent ?? '', /Session changed/u);
});

await test('view suspension during local admission renews the save turn without losing the typed original', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  let release: () => void = () => {};
  f.data.saveWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = f.views.at(-1)!;
  current.text.value = 'Save across suspension';
  current.form.dispatchEvent(new Event('submit'));
  const id = current.history.querySelector('[data-outgoing-text]')!.dataset[
    'message'
  ];
  f.visibility('hidden');
  f.window.dispatchEvent(new Event('pagehide'));
  release();
  await turn();
  assert.equal(f.data.savedTexts.length, 1);
  assert.equal(f.data.savedTexts[0]!.id, id);
  assert.equal(f.data.savedTexts[0]!.text, 'Save across suspension');
  assert.equal(f.data.sends.length, 0);
  assert.doesNotMatch(f.host.textContent ?? '', /Session changed/u);
  f.visibility('visible');
  await turn();
  assert.equal(f.data.sends[0]?.id, id);
});

await test('a queued denial for a departed peer revalidates the current chat without retrying the failed send', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  let release: () => void = () => {};
  f.data.sendWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = f.views.at(-1)!;
  first.text.value = 'For A';
  first.form.dispatchEvent(new Event('submit'));
  await turn();
  f.ui.mount(f.host, 'B');
  await turn();
  f.data.sendFailure = f.denial();
  release();
  await turn();
  assert.equal(f.views.at(-1)!.history.hidden, true);
  t.mock.timers.tick(1000);
  await turn();
  const current = f.views.at(-1)!;
  assert.equal(current.title.textContent, 'B');
  assert.equal(current.history.hidden, false);
  assert.equal(f.calls.filter((call) => call === 'read:B').length, 2);
  assert.equal(f.data.sends.length, 1);
  assert.equal(f.data.textDrafts[0]?.id, f.data.sends[0]?.id);
  t.mock.timers.tick(30000);
  await turn();
  assert.equal(f.data.sends.length, 1);
});

await test('public receipt hints update only checks while content hints still read the conversation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!;
  current.text.value = 'Keep typing';
  const calls = f.calls.length;
  f.emit('handle-receipts');
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(f.calls.slice(calls), []);
  assert.equal(f.data.checks, 1);
  assert.equal(current.text.value, 'Keep typing');
  f.emit('handle-receipts');
  f.emit('handle-messages');
  t.mock.timers.tick(150);
  await turn();
  assert.ok(f.calls.slice(calls).includes('read:A'));
});

await test('handle messages render during a recording and while its preview and caption are open', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!;
  const record = current.form.querySelector('[data-voice-record]')!,
    stop = current.form.querySelector('[data-voice-stop]')!;
  record.click();
  assert.equal(stop.hidden, false);
  f.data.items = [{ ...message('while-recording', 1), own: false }];
  f.emit('handle-messages');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(stop.hidden, false, 'the live refresh did not cancel recording');
  assert.ok(
    current.history.children.some(
      (row) => row.dataset['message'] === 'while-recording',
    ),
  );
  stop.click();
  current.text.value = 'Keep this caption';
  current.text.dispatchEvent(new Event('input'));
  const preview = current.form.querySelector('[data-attachment-preview]')!;
  const player = preview.firstChild;
  assert.ok(player);
  f.data.items = [
    ...f.data.items,
    { ...message('while-reviewing', 2), own: false },
  ];
  f.emit('handle-messages');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.views.at(-1), current);
  assert.equal(current.text.value, 'Keep this caption');
  assert.equal(preview.firstChild, player);
  assert.ok(
    current.history.children.some(
      (row) => row.dataset['message'] === 'while-reviewing',
    ),
  );
  assert.equal(f.calls.includes('stage-media'), false);
});

await test('a handle receive leaves the microphone and voice submit usable, and submits the audio once after the read', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!;
  const read = deferred<void>();
  f.data.readWait = read.promise;
  f.data.items = [{ ...message('incoming'), own: false }];
  const before = f.calls.length;
  f.emit('handle-messages');
  t.mock.timers.tick(150);
  await turn();
  assert.ok(f.calls.slice(before).includes('read:A'));
  const record = current.form.querySelector('[data-voice-record]')!,
    stop = current.form.querySelector('[data-voice-stop]')!,
    send = current.form.querySelector('[data-compose-send]')!,
    preview = current.form.querySelector('[data-attachment-preview]')!;
  assert.equal(record.disabled, false);
  record.click();
  assert.equal(stop.hidden, false);
  stop.click();
  assert.equal(send.hidden, false);
  assert.equal(send.disabled, false);
  const player = preview.firstChild;
  assert.ok(player);
  current.form.dispatchEvent(new Event('submit'));
  current.form.dispatchEvent(new Event('submit'));
  await turn();
  assert.equal(send.disabled, true);
  assert.equal(preview.firstChild, player);
  assert.equal(f.calls.includes('stage-media'), false);
  read.resolve();
  await turn();
  assert.ok(
    current.history.children.some(
      (row) => row.dataset['message'] === 'incoming',
    ),
  );
  assert.equal(f.data.mediaKind, 'voice');
  assert.equal(f.calls.filter((call) => call === 'stage-media').length, 1);
  assert.equal(f.calls.filter((call) => call === 'send-media').length, 1);
});

await test('departing a DM wipes selected image bytes and releases its preview', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const selection: AttachmentSelection = {
    name: 'synthetic.png',
    type: 'image/png',
    image: true,
    bytes: new Uint8Array([1, 2, 3]),
    thumbnail: new Uint8Array([4, 5]),
  };
  f.chooseImage(selection);
  await turn();
  assert.equal(f.ui.canActivate(), false);
  f.ui.leave();
  assert.deepEqual([...selection.bytes], [0, 0, 0]);
  assert.deepEqual([...selection.thumbnail!], [0, 0]);
  assert.ok(f.data.revokedUrls.includes('blob:synthetic'));
});

await test('DM fallback polling stops on departure and cannot restart from lifecycle events', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = dmCoordinatorFixture(t);
  f.disconnect();
  f.ui.mount(f.host, 'A');
  await turn();
  const before = f.calls.length;
  t.mock.timers.tick(30000);
  t.mock.timers.tick(150);
  await turn();
  assert.ok(f.calls.length > before);
  f.ui.leave();
  const after = f.calls.length;
  f.window.dispatchEvent(new Event('online'));
  f.window.dispatchEvent(new Event('pageshow'));
  t.mock.timers.tick(60000);
  await turn();
  assert.equal(f.calls.length, after);
  assert.ok(f.data.streamStops > 0);
});

await test('a failed DM media send resumes the existing staged draft without staging it twice', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const selection: AttachmentSelection = {
    name: 'synthetic.png',
    type: 'image/png',
    image: true,
    bytes: new Uint8Array([1, 2]),
    thumbnail: null,
  };
  f.chooseImage(selection);
  await turn();
  f.data.sendFailure = new Error('Synthetic media transport failure');
  f.views.at(-1)!.form.dispatchEvent(new Event('submit'));
  await turn();
  assert.equal(f.data.mediaPending, true);
  assert.deepEqual([...selection.bytes], [0, 0]);
  f.data.sendFailure = null;
  f.ui.mount(f.host, 'A');
  await turn();
  f.views.at(-1)!.form.dispatchEvent(new Event('submit'));
  await turn();
  assert.equal(f.calls.filter((call) => call === 'stage-media').length, 1);
  assert.equal(f.calls.filter((call) => call === 'send-media').length, 2);
  assert.equal(f.data.mediaPending, false);
});

await test('a blocked DM remains unavailable for composition after a live recheck', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!;
  const stop = current.form.querySelector('[data-voice-stop]')!;
  current.form.querySelector('[data-voice-record]')!.click();
  assert.equal(stop.hidden, false);
  f.data.blocked = true;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(current.form.hidden, true);
  assert.equal(stop.hidden, true);
  current.text.value = 'Must not be sent';
  current.form.dispatchEvent(new Event('submit'));
  await turn();
  assert.equal(f.data.sends.length, 0);
});

await test('scrolling up reads one older page from this device, keeps what is shown and live refresh keeps that depth', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t);
  const shown = () =>
    f.views.at(-1)!.history.children.filter((row) => row.dataset['message'])
      .length;
  f.data.items = Array.from({ length: 16 }, (_, i) =>
    message(`latest-${i}`, i + 5),
  );
  f.data.olderItems = Array.from({ length: 4 }, (_, i) =>
    message(`older-${i}`, i + 1),
  );
  f.ui.mount(f.host, 'A');
  await turn();
  assert.equal(shown(), 16);
  assert.equal(f.data.older?.available(), true);
  assert.equal(await f.data.older.load(), true);
  assert.equal(shown(), 20);
  assert.deepEqual(f.data.cachedBefores, [5]);
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  // The refresh reads the latest page again and reaches the same floor.
  assert.equal(shown(), 20);
  assert.deepEqual(f.data.cachedBefores, [5, 5]);
  assert.equal(await f.data.older.load(), false);
  assert.equal(f.data.older.available(), false);
  assert.deepEqual(f.data.readAfters, [null, null, null, null]);
});

await test('leaving a DM preserves its independently mounted directory until that directory becomes obsolete', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = dmCoordinatorFixture(t);
  f.ui.mount(f.host, 'A');
  await turn();
  let valid = true;
  await f.ui.directory(
    f.document.createElement('aside') as unknown as HTMLElement,
    () => valid,
  );
  const stops = f.data.streamStops;
  f.ui.leave();
  assert.equal(f.data.streamStops, stops);
  const before = f.calls.filter((call) => call === 'list').length;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.ok(f.calls.filter((call) => call === 'list').length > before);
  valid = false;
  t.mock.timers.tick(30000);
  await turn();
  assert.ok(f.data.streamStops > stops);
});

for (const own of [false, true])
  await test(`local-only ${own ? 'sent' : 'received'} handle originals retain reply while background work cannot grant mutation`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = dmCoordinatorFixture(t, true);
    f.data.items = [
      { ...message(), own, sender: own ? 'self' : 'peer', localOnly: true },
    ];
    f.ui.mount(f.host, 'first');
    await turn();
    await turn();
    const menu = f.data.menus.at(-1)!;
    assert.equal(typeof menu.reply, 'function');
    assert.equal(menu.react, undefined);
    assert.equal(menu.edit, undefined);
    f.hold();
    f.emit('changed');
    t.mock.timers.tick(150);
    await turn();
    // The local reply context is independent of an asynchronous history refresh.
    menu.reply!();
    assert.match(f.views.at(-1)!.form.textContent, /Replying to/u);
    f.release('first');
    await turn();
  });

await test('accepted image shows one check and clears only its draft before a held history refresh finishes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!;
  const selection: AttachmentSelection = {
    name: 'synthetic.png',
    type: 'image/png',
    image: true,
    bytes: new Uint8Array([1, 2]),
    thumbnail: null,
  };
  f.chooseImage(selection);
  await turn();
  current.text.value = 'Caption';
  current.text.dispatchEvent(new Event('input'));
  const read = deferred<void>();
  f.data.readWait = read.promise;
  current.form.dispatchEvent(new Event('submit'));
  await turn();
  assert.ok(
    current.history.querySelector('.message-checks'),
    'authoritative acceptance renders without readback',
  );
  assert.equal(current.text.value, '');
  assert.equal(
    current.history.querySelectorAll('[data-outgoing-media]').length,
    1,
  );
  t.mock.timers.tick(150);
  await turn();
  assert.ok(
    current.history.querySelector('.message-checks'),
    'unresolved refresh cannot hide the accepted check',
  );
  read.resolve();
  await turn();
});

await test('late media completion preserves text typed after submission', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!;
  const selection: AttachmentSelection = {
    name: 'synthetic.png',
    type: 'image/png',
    image: true,
    bytes: new Uint8Array([1, 2]),
    thumbnail: null,
  };
  f.chooseImage(selection);
  await turn();
  const sent = deferred<void>();
  f.data.sendWait = sent.promise;
  current.text.value = 'Original caption';
  current.form.dispatchEvent(new Event('submit'));
  await Promise.resolve();
  current.text.value = 'New draft';
  current.text.dispatchEvent(new Event('input'));
  sent.resolve();
  await turn();
  assert.equal(current.text.value, 'New draft');
});

await test('media acknowledgement after navigation cannot clear another conversation draft or draw into it', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  f.chooseImage({
    name: 'synthetic.png',
    type: 'image/png',
    image: true,
    bytes: new Uint8Array([1, 2]),
    thumbnail: null,
  });
  await turn();
  const sent = deferred<void>();
  f.data.sendWait = sent.promise;
  f.views.at(-1)!.form.dispatchEvent(new Event('submit'));
  await turn();
  f.ui.mount(f.host, 'B');
  const current = f.views.at(-1)!;
  current.text.value = 'B draft';
  current.text.dispatchEvent(new Event('input'));
  sent.resolve();
  await turn();
  await turn();
  assert.equal(current.text.value, 'B draft');
  assert.equal(
    current.history.querySelectorAll('[data-outgoing-media]').length,
    0,
  );
});

await test('caption typing preserves a preparing image while a newer image replaces only the older selection', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!,
    held = deferred<void>();
  const selected: AttachmentSelection = {
    name: 'synthetic.png',
    type: 'image/png',
    image: true,
    bytes: new Uint8Array([1, 2]),
    thumbnail: null,
  };
  f.data.preparationWait = held.promise;
  f.chooseImage(selected);
  current.text.value = 'Caption entered during processing';
  current.text.dispatchEvent(new Event('input'));
  held.resolve();
  await turn();
  assert.deepEqual([...selected.bytes], [1, 2]);
  const older = deferred<void>(),
    stale = { ...selected, bytes: new Uint8Array([3, 4]) };
  f.data.preparationWait = older.promise;
  f.chooseImage(stale);
  f.data.preparationWait = null;
  const newer = { ...selected, bytes: new Uint8Array([5, 6]) };
  f.chooseImage(newer);
  await turn();
  older.resolve();
  await turn();
  assert.deepEqual([...stale.bytes], [0, 0]);
  assert.deepEqual([...newer.bytes], [5, 6]);
  assert.equal(current.text.value, 'Caption entered during processing');
});
