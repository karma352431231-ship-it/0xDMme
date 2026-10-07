import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startDevices } from '../src/client/devices/index.ts';
import { DeviceController } from '../src/client/devices/controller.ts';
import { createIdentity } from '../src/client/device-keys/index.ts';
import { createWalletRecovery } from '../src/client/wallet-recovery/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import type { RecoveryFlow } from '../src/client/recovery-return/index.ts';
import { deviceDatabase } from './fixtures/device-database.ts';

await test('restauração não abre wallet; login abre somente sem chaves e pedido expirado deixa de bloquear atualização', async (t) => {
  const window = new EventTarget();
  const records = new Map<string, string>();
  const replacements = {
    window,
    document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    localStorage: { getItem: () => 'MetaMask' },
    sessionStorage: {
      getItem: (key: string) => records.get(key) ?? null,
      removeItem: (key: string) => {
        records.delete(key);
      },
    },
    BroadcastChannel: undefined,
    indexedDB: deviceDatabase(),
  };
  for (const [name, value] of Object.entries(replacements)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  t.after(() => window.dispatchEvent(new Event('pagehide')));
  const session: AccountSession = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: '',
    csrf: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    profileRevision: 0,
    deviceState: 'pending',
    historyAuthorized: false,
    walletConfirmed: true,
  };
  const identity = await createIdentity(session.deviceId, 'Teste');
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  let authorized = true;
  const controllers: DeviceController[] = [];
  let opened = 0;
  let requests = 0;
  const config = createWalletRecovery(session, 'https://0xdmme.app');
  const flow: RecoveryFlow = {
    mode: 'initialize',
    config,
    name: 'Teste',
    revoked: [],
    revision: 0,
    head: null,
    pending: {
      transfer: {
        version: 1,
        ticket: 'a'.repeat(64),
        config,
        receiver: identity.public.wrapping,
        wallet: 'MetaMask',
        count: 2,
      },
      commitment: 'b'.repeat(64),
      deadline: Date.now() + 300_000,
      link: '',
    },
  };
  t.mock.method(
    DeviceController.prototype,
    'privateKey',
    function (this: DeviceController, current: AccountSession) {
      this.setSession(current);
      controllers.push(this);
      this.identity = identity;
      this.ring = authorized
        ? { accountId: current.accountId, epoch: 1, keys: ['a'.repeat(64)] }
        : null;
      return Promise.resolve(authorized ? { key, epoch: 1 } : null);
    },
  );
  t.mock.method(
    DeviceController.prototype,
    'beginWalletRecovery',
    function (this: DeviceController) {
      requests++;
      this.walletPending = flow;
      return Promise.resolve(false);
    },
  );
  t.mock.method(DeviceController.prototype, 'openWalletRecovery', () => {
    opened++;
  });
  const devices = startDevices({ changed: () => Promise.resolve() });
  assert.equal(await devices.privateKey(session, 'login'), key);
  assert.equal(requests, 0);
  authorized = false;
  assert.equal(await devices.privateKey(session), null);
  assert.equal(opened, 0);
  assert.equal(devices.canActivate(), true);
  await devices.privateKey(session, 'login');
  assert.equal(requests, 1);
  assert.equal(opened, 1);
  assert.equal(devices.canActivate(), false);
  assert.match(devices.updateBlockReason() ?? '', /Ap\S*relhos/);
  await devices.privateKey(session);
  assert.equal(opened, 1);
  const storageKey = `0xdmme:private-recovery-return:${session.accountId}:${session.deviceId}`;
  records.set(storageKey, 'public-request');
  records.set('other-request', 'preserve');
  flow.pending.deadline = Date.now() - 1;
  assert.equal(devices.canActivate(), true);
  assert.equal(devices.updateBlockReason(), null);
  assert.equal(controllers.at(-1)?.walletPending, null);
  assert.equal(controllers.at(-1)?.identity, identity);
  assert.equal(records.has(storageKey), false);
  assert.equal(records.get('other-request'), 'preserve');
});
