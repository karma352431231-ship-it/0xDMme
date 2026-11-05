import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from '../src/shared/account/index.ts';
import { startVault, storageSize } from '../src/client/vault-ui/index.ts';

await test('vault meter shows MB below 1 GB and GB from that point onward', () => {
  const cases: [number, string][] = [
    [0, '0 MB'],
    [2_340_000, '2.3 MB'],
    [312_400_000, '312 MB'],
    [1_000_000_000, '1 GB'],
    [1_250_000_000, '1.3 GB'],
  ];
  for (const [bytes, label] of cases) assert.equal(storageSize(bytes), label);
});

await test('vault meter queries usage by itself and reports a refused vault instead of checking forever', async (t) => {
  for (const [name, value] of Object.entries({
    window: new EventTarget(),
    navigator: { onLine: true },
    indexedDB: {
      open: () => {
        throw new Error('No storage in this test.');
      },
    },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  let queries = 0;
  const vault = startVault({
    withVault: () => {
      queries++;
      return Promise.reject(
        new Error('Authorize or recover this device to open the vault.'),
      );
    },
    withLocalVault: () => Promise.reject(new Error('Unused in this test.')),
  });
  vault.setSession({
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
  } as AccountSession);
  const label = { textContent: '' };
  const meter = {
    hidden: false,
    innerHTML: '',
    querySelector: (selector: string) =>
      selector === '[data-vault-meter-label]' ? label : null,
  } as unknown as HTMLElement;
  vault.mountMeter(meter);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(queries >= 1);
  assert.equal(label.textContent, 'Could not check storage.');
});
