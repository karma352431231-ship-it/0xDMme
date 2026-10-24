import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dmCoordinatorFixture } from './fixtures/dm-coordinator.ts';
import type { SocialDms } from '../src/client/social-dm/index.ts';
import type { AttachmentSelection } from '../src/client/attachments/index.ts';
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
): Awaited<ReturnType<SocialDms['cached']>>['items'][number] {
  return {
    type: 'dm-message',
    id,
    hash: 'synthetic',
    self: 'self',
    peer: { id: 'A', handle: 'synthetic', avatar: null },
    sequence: 1,
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
  assert.equal(f.views.at(-1)!.history.textContent, 'Edited text');
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

await test('failed DM text sends preserve the draft and retry ID until acceptance', async (t) => {
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!;
  f.data.sendFailure = new Error('Transport unavailable');
  current.text.value = 'Retry this text';
  current.form.dispatchEvent(new Event('submit'));
  await turn();
  assert.equal(current.text.value, 'Retry this text');
  f.data.sendFailure = null;
  f.ui.mount(f.host, 'A');
  await turn();
  const next = f.views.at(-1)!;
  assert.equal(next.text.value, 'Retry this text');
  next.form.dispatchEvent(new Event('submit'));
  await turn();
  assert.equal(f.data.sends.length, 2);
  assert.equal(f.data.sends[0]!.id, f.data.sends[1]!.id);
  assert.equal(next.text.value, '');
  next.text.value = 'A second message';
  next.form.dispatchEvent(new Event('submit'));
  await turn();
  assert.notEqual(f.data.sends[1]!.id, f.data.sends[2]!.id);
});

await test('DM live hints wait for recording and preserve the typed draft and frame', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t, true);
  f.ui.mount(f.host, 'A');
  await turn();
  const current = f.views.at(-1)!;
  current.text.value = 'Keep this draft';
  await f.startRecording();
  const before = f.calls.length;
  f.emit('changed');
  t.mock.timers.tick(30000);
  await turn();
  assert.equal(f.calls.length, before);
  f.cancelRecording();
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.views.at(-1), current);
  assert.equal(current.text.value, 'Keep this draft');
  assert.ok(f.calls.length > before);
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
  f.data.blocked = true;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  const current = f.views.at(-1)!;
  assert.equal(current.form.hidden, true);
  current.text.value = 'Must not be sent';
  current.form.dispatchEvent(new Event('submit'));
  await turn();
  assert.equal(f.data.sends.length, 0);
});

await test('older DM pages advance only explicitly and live refresh rereads the displayed page', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = dmCoordinatorFixture(t);
  f.data.next = 20;
  f.ui.mount(f.host, 'A');
  await turn();
  f.views.at(-1)!.older.click();
  await turn();
  f.data.next = 8;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(f.data.readAfters, [null, 20, 20]);
  f.views.at(-1)!.older.click();
  await turn();
  assert.deepEqual(f.data.readAfters, [null, 20, 20, 8]);
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
