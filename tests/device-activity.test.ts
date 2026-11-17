import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signedInDevices } from '../src/shared/account-activity/index.ts';
import type { SignedInDevice } from '../src/shared/account-activity/index.ts';
import { createDeviceActivity } from '../src/client/device-activity/index.ts';

const account = '11111111-1111-4111-8111-111111111111';
const own = '22222222-2222-4222-8222-222222222222';
const laptop = '33333333-3333-4333-8333-333333333333';
const stranger = '44444444-4444-4444-8444-444444444444';
function device(deviceId: string, current = false): SignedInDevice {
  return {
    deviceId,
    lastSeen: '2026-11-17T00:00:00.000Z',
    walletConfirmed: true,
    current,
  };
}
function turn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
/** A browser whose server list and clock the test controls. */
function browser(
  t: { after: (cleanup: () => void) => void },
  storage: Map<string, string> | null = new Map(),
) {
  const state = { served: [device(own, true)], now: 1_000_000, reads: 0 };
  const scope = globalThis as {
    fetch: unknown;
    localStorage?: unknown;
  };
  const previous = { fetch: scope.fetch, storage: scope.localStorage };
  const realNow = Date.now;
  Date.now = () => state.now;
  scope.fetch = () => {
    state.reads++;
    return Promise.resolve(Response.json({ devices: state.served }));
  };
  scope.localStorage = storage
    ? {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      }
    : {
        getItem() {
          throw new Error('Storage unavailable.');
        },
        setItem() {
          throw new Error('Storage unavailable.');
        },
      };
  t.after(() => {
    Date.now = realNow;
    scope.fetch = previous.fetch;
    scope.localStorage = previous.storage;
  });
  return state;
}

await test('the first read on a browser records the devices without reporting them', async (t) => {
  const state = browser(t);
  state.served = [device(own, true), device(laptop)];
  const activity = createDeviceActivity(() => undefined);
  activity.refresh(account);
  await turn();
  assert.deepEqual(activity.unseen(), []);
  assert.equal(activity.of(laptop)?.deviceId, laptop);
  assert.deepEqual(
    activity.others(new Set([own])).map((entry) => entry.deviceId),
    [laptop],
  );
});

await test('a device that signs in later is reported until acknowledged, across reloads', async (t) => {
  const storage = new Map<string, string>();
  const state = browser(t, storage);
  let renders = 0;
  const first = createDeviceActivity(() => renders++);
  first.refresh(account);
  await turn();

  state.served = [device(own, true), device(stranger)];
  // A reload creates a new page object over the same browser storage.
  const reloaded = createDeviceActivity(() => renders++);
  reloaded.refresh(account);
  await turn();
  assert.deepEqual(
    reloaded.unseen().map((entry) => entry.deviceId),
    [stranger],
  );
  reloaded.acknowledge();
  assert.deepEqual(reloaded.unseen(), []);

  const again = createDeviceActivity(() => renders++);
  again.refresh(account);
  await turn();
  assert.deepEqual(again.unseen(), []);
  assert.ok(renders >= 4);
});

await test('reads are spaced by thirty seconds and another account starts empty', async (t) => {
  const state = browser(t);
  const activity = createDeviceActivity(() => undefined);
  activity.refresh(account);
  await turn();
  activity.refresh(account);
  await turn();
  assert.equal(state.reads, 1);
  state.now += 30_000;
  activity.refresh(account);
  await turn();
  assert.equal(state.reads, 2);
  activity.refresh(null);
  assert.equal(activity.of(own), undefined);
  assert.equal(state.reads, 2);
});

await test('without browser storage nothing is reported and nothing throws', async (t) => {
  const state = browser(t, null);
  state.served = [device(own, true), device(stranger)];
  const activity = createDeviceActivity(() => undefined);
  activity.refresh(account);
  await turn();
  assert.deepEqual(activity.unseen(), []);
  activity.acknowledge();
  assert.equal(activity.of(stranger)?.deviceId, stranger);
});

await test('a malformed, oversized or duplicated server list is rejected', () => {
  const valid = device(own, true);
  assert.deepEqual(signedInDevices({ devices: [valid] }), [valid]);
  for (const devices of [
    [{ ...valid, extra: true }],
    [{ ...valid, deviceId: 'not-a-uuid' }],
    [{ ...valid, lastSeen: 'yesterday' }],
    [{ ...valid, current: 'yes' }],
    [valid, valid],
    Array.from({ length: 9 }, (_, index) =>
      device(`${index}0000000-0000-4000-8000-000000000000`),
    ),
  ])
    assert.throws(() => signedInDevices({ devices }));
  assert.throws(() => signedInDevices([valid]));
});
