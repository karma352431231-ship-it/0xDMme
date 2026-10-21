import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dmCoordinatorFixture } from './fixtures/dm-coordinator.ts';
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
