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
