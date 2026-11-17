import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cleanDeviceName,
  describeDevice,
  deviceLabels,
  mergeDeviceLabels,
} from '../src/client/device-labels/index.ts';
import type { DeviceLabel } from '../src/client/device-labels/index.ts';

const agents = {
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipadDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  pixel:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP3A.241005.015; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36',
  reduced:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  tablet:
    'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  firefoxLinux:
    'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
};

await test('devices are recognized from what the browser exposes', () => {
  const describe = (
    userAgent: string,
    extra: Partial<Parameters<typeof describeDevice>[0]> = {},
  ) =>
    describeDevice({ userAgent, maxTouchPoints: 0, native: false, ...extra });
  assert.deepEqual(describe(agents.mac), {
    kind: 'mac',
    model: null,
    client: 'chrome',
  });
  assert.deepEqual(describe(agents.iphone, { native: true }), {
    kind: 'iphone',
    model: null,
    client: 'app',
  });
  assert.equal(
    describe(agents.ipadDesktop, { maxTouchPoints: 5 }).kind,
    'ipad',
    'iPadOS asks for desktop sites and reports a Mac with touch',
  );
  assert.deepEqual(describe(agents.pixel, { native: true }), {
    kind: 'android-phone',
    model: 'Pixel 9',
    client: 'app',
  });
  assert.equal(describe(agents.reduced).model, null, 'Reduced agents hide it');
  assert.equal(
    describe(agents.reduced, { modelHint: 'Galaxy S24' }).model,
    'Galaxy S24',
    "Chromium's model hint fills a reduced agent",
  );
  assert.equal(describe(agents.tablet).kind, 'android-tablet');
  assert.deepEqual(describe(agents.windowsEdge), {
    kind: 'windows',
    model: null,
    client: 'edge',
  });
  assert.deepEqual(describe(agents.firefoxLinux), {
    kind: 'linux',
    model: null,
    client: 'firefox',
  });
  assert.equal(
    describe(agents.reduced, { modelHint: '<script>' }).model,
    null,
    'A model outside the allowed characters is dropped',
  );
});

const label = (overrides: Partial<DeviceLabel> = {}): DeviceLabel => ({
  kind: 'iphone',
  model: null,
  client: 'app',
  name: null,
  at: 1,
  ...overrides,
});

await test('stored device names are validated and the newest entry wins', () => {
  const parsed = deviceLabels({
    version: 1,
    devices: { 'a-1': label({ name: 'Work phone', at: 5 }) },
  });
  assert.equal(parsed.get('a-1')?.name, 'Work phone');
  for (const invalid of [
    { version: 2, devices: {} },
    { version: 1, devices: { 'a-1': { ...label(), kind: 'toaster' } } },
    { version: 1, devices: { 'a-1': { ...label(), extra: true } } },
    { version: 1, devices: { 'a/1': label() } },
    { version: 1, devices: { 'a-1': label({ name: ' padded ' }) } },
  ])
    assert.throws(() => deviceLabels(invalid));
  const merged = mergeDeviceLabels([
    new Map([
      ['a-1', label({ name: 'Old', at: 1 })],
      ['b-2', label({ kind: 'mac', at: 3 })],
    ]),
    new Map([['a-1', label({ name: 'New', at: 2 })]]),
  ]);
  assert.equal(merged.get('a-1')?.name, 'New');
  assert.equal(merged.get('b-2')?.kind, 'mac');
});

await test('device names are trimmed, bounded and may be cleared', () => {
  assert.equal(cleanDeviceName('  My   phone '), 'My phone');
  assert.equal(cleanDeviceName('   '), null);
  assert.throws(() => cleanDeviceName('x'.repeat(41)));
});
