import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { startDevices } from '../src/client/devices/index.ts';
import { DeviceController } from '../src/client/devices/controller.ts';
import { createIdentity, sealTo } from '../src/client/device-keys/index.ts';
import { createWalletRecovery } from '../src/client/wallet-recovery/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import type { RecoveryFlow } from '../src/client/recovery-return/index.ts';
import { deviceDatabase } from './fixtures/device-database.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';
import { Wallet } from 'ethers';
import {
  recoveryMessage,
  transferContext,
} from '../src/shared/wallet-recovery/index.ts';
import { canonical, digest, eventHash } from '../src/shared/devices/index.ts';
import type { DirectoryEvent, LinkCode } from '../src/shared/devices/index.ts';
import {
  enrollmentPayload,
  verifyEnrollmentMac,
} from '../src/shared/device-enrollment/index.ts';
import { readCheckpoint } from '../src/client/device-storage/index.ts';

function requestBody(init?: RequestInit): unknown {
  if (typeof init?.body !== 'string')
    throw new Error('Expected a JSON request body.');
  return JSON.parse(init.body) as unknown;
}

function controllerFixture(t: TestContext) {
  const pendingRecords = new Map<string, string>();
  const wallet = new Wallet('0x' + '1'.padStart(64, '0'));
  const session: AccountSession = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    ecosystem: 'evm',
    address: wallet.address.toLowerCase(),
    name: '',
    csrf: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    profileRevision: 0,
    deviceState: 'pending',
    historyAuthorized: false,
    walletConfirmed: true,
  };
  const values = {
    indexedDB: deviceDatabase(),
    navigator: {
      userAgent: 'Android synthetic',
      locks: {
        request: (
          _name: string,
          _options: unknown,
          work: () => Promise<unknown>,
        ) => work(),
      },
    },
    location: { origin: 'https://0xdmme.app' },
    window: new EventTarget(),
    sessionStorage: {
      getItem: (key: string) => pendingRecords.get(key) ?? null,
      setItem: (key: string, value: string) => {
        pendingRecords.set(key, value);
      },
      removeItem: (key: string) => {
        pendingRecords.delete(key);
      },
    },
  };
  for (const [name, value] of Object.entries(values)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const calls: string[] = [],
    events: DirectoryEvent[] = [];
  const overrides = new Map<
    string,
    (init?: RequestInit) => Promise<Response>
  >();
  const simpleResponses = new Map<string, () => Response>([
    ['/api/account/profile', () => Response.json(null)],
    [
      '/api/account/devices/start',
      () =>
        Response.json({
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          serverTime: new Date().toISOString(),
        }),
    ],
    ['/api/account/devices/inspect', () => Response.json({})],
    [
      '/api/account/recovery-cancel',
      () => Response.json({ status: 'cancelled' }),
    ],
  ]);
  let loseCommit = false;
  t.mock.method(
    globalThis,
    'fetch',
    async (path: string, init?: RequestInit) => {
      calls.push(path);
      if (overrides.has(path)) return overrides.get(path)!(init);
      if (path.endsWith('/devices/read')) {
        const body = requestBody(init) as { after: number };
        return Response.json({
          events: events.slice(body.after),
          revision: events.length,
          head: events.length ? await eventHash(events.at(-1)!) : null,
          serverTime: new Date().toISOString(),
        });
      }
      const simple = simpleResponses.get(path);
      if (simple) return simple();
      if (path.endsWith('/recovery-start')) {
        const input = requestBody(init) as Record<string, unknown>;
        const ticket = 'a'.repeat(64),
          transfer = { version: 1, ticket, ...input };
        return Response.json({
          ticket,
          commitment: await digest(canonical(transfer)),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          serverTime: new Date().toISOString(),
        });
      }
      if (path.endsWith('/devices/commit')) {
        const body = requestBody(init) as {
          event: DirectoryEvent;
        };
        events.push(body.event);
        if (loseCommit) throw new Error('Synthetic lost commit response');
        return Response.json({
          head: await eventHash(body.event),
          revision: body.event.revision,
        });
      }
      throw new Error('Unexpected device fixture operation');
    },
  );
  const controller = new DeviceController();
  controller.setSession(session);
  const config = createWalletRecovery(session, 'https://0xdmme.app');
  return {
    controller,
    session,
    wallet,
    config,
    calls,
    events,
    overrides,
    pendingRecords,
    injectWallet: () => {
      Object.assign(values.window, {
        ethereum: {
          isMetaMask: true,
          request: ({
            method,
            params,
          }: {
            method: string;
            params?: string[];
          }) => {
            if (method === 'eth_requestAccounts' || method === 'eth_accounts')
              return Promise.resolve([wallet.address]);
            if (method === 'eth_chainId') return Promise.resolve('0x1');
            if (method === 'personal_sign')
              return wallet.signMessage(
                Uint8Array.from(Buffer.from(params![0]!.slice(2), 'hex')),
              );
            throw new Error('Unexpected synthetic wallet operation');
          },
        },
      });
    },
    useStorage: (database: IDBFactory = values.indexedDB) => {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: database,
      });
    },
    loseCommit: () => {
      loseCommit = true;
    },
  };
}

await test('restoration never opens the wallet; login opens only without keys and expired request stops blocking updates', async (t) => {
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
  const identity = await createIdentity(session.deviceId, 'Test');
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
    name: 'Test',
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
  assert.match(devices.updateBlockReason() ?? '', /Devices/);
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

await test('device enrollment preparation cannot publish a pending link after session invalidation', async (t) => {
  const f = controllerFixture(t),
    entered = deferred<void>(),
    response = deferred<Response>();
  f.overrides.set('/api/account/devices/read', () => {
    entered.resolve();
    return response.promise;
  });
  const pending = f.controller.startLink('Synthetic new device');
  const rejected = assert.rejects(pending, /Session changed/);
  await waitForBoundary(entered.promise);
  f.controller.setSession(null);
  response.resolve(
    Response.json({
      events: [],
      revision: 0,
      head: null,
      serverTime: new Date().toISOString(),
    }),
  );
  await rejected;
  assert.equal(f.controller.pendingCode, null);
  assert.equal(f.controller.authorized, false);
  assert.ok(!f.calls.includes('/api/account/devices/start'));
});

await test('a deferred enrollment candidate cannot reach inspection after the account changes', async (t) => {
  const f = controllerFixture(t),
    entered = deferred<void>(),
    response = deferred<Response>();
  f.overrides.set('/api/account/devices/enrollment-pending', () => {
    entered.resolve();
    return response.promise;
  });
  const pending = f.controller.approveEnrollment({
    version: 1,
    id: crypto.randomUUID(),
    accountId: f.session.accountId,
    root: 'a'.repeat(64),
    secret: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  });
  const rejected = assert.rejects(pending, /Session changed/);
  await waitForBoundary(entered.promise);
  f.controller.setSession(null);
  response.resolve(Response.json({ code: {}, proof: '' }));
  await rejected;
  assert.equal(f.controller.approvalCode, null);
  assert.ok(!f.calls.includes('/api/account/devices/inspect'));
});

await test('wallet initialization interrupted during the directory read wipes signatures and publishes no authorization', async (t) => {
  const f = controllerFixture(t),
    entered = deferred<void>(),
    response = deferred<Response>();
  const signature = await f.wallet.signMessage(recoveryMessage(f.config));
  const signatures = [signature, signature];
  f.overrides.set('/api/account/devices/read', () => {
    entered.resolve();
    return response.promise;
  });
  const pending = f.controller.completeLoginOpening({
    config: f.config,
    count: 2,
    signatures,
  });
  const rejected = assert.rejects(pending, /Session changed/);
  await waitForBoundary(entered.promise);
  f.controller.clearTransient();
  response.resolve(
    Response.json({
      events: [],
      revision: 0,
      head: null,
      serverTime: new Date().toISOString(),
    }),
  );
  await rejected;
  assert.deepEqual(signatures, ['', '']);
  assert.equal(f.events.length, 0);
  assert.equal(f.controller.authorized, false);
});

await test('an accepted initialization with a lost response reconciles the pinned root on refresh', async (t) => {
  const f = controllerFixture(t);
  const signature = await f.wallet.signMessage(recoveryMessage(f.config));
  const signatures = [signature, signature];
  f.loseCommit();
  await assert.rejects(
    f.controller.completeLoginOpening({
      config: f.config,
      count: 2,
      signatures,
    }),
    /Could not connect to the server/,
  );
  assert.deepEqual(signatures, ['', '']);
  assert.equal(f.events.length, 1);
  const pinned = await readCheckpoint(f.session.accountId);
  assert.equal(pinned.events.length, 0);
  assert.equal(pinned.trustedRoot, await digest(canonical(f.events[0]!.root)));
  await f.controller.refresh();
  assert.equal(f.controller.authorized, true);
  const confirmed = await readCheckpoint(f.session.accountId);
  assert.deepEqual(confirmed.events, f.events);
  assert.equal(confirmed.trustedRoot, pinned.trustedRoot);
});

await test('mobile wallet recovery restores only public request metadata and cancellation clears it before network completion', async (t) => {
  const f = controllerFixture(t);
  const input = {
    mode: 'initialize' as const,
    wallet: 'MetaMask',
    name: 'Synthetic device',
    revoked: [],
    revision: 0,
  };
  assert.equal(await f.controller.beginWalletRecovery(input), false);
  const pending = f.controller.walletPending;
  assert.ok(pending);
  assert.equal(f.pendingRecords.size, 1);
  const serialized = [...f.pendingRecords.values()][0]!;
  assert.ok(
    !serialized.includes('signatures') && !serialized.includes('legacy'),
  );
  f.controller.clearTransient();
  const cleared = f.controller.walletPending;
  assert.equal(cleared, null);
  await f.controller.refresh();
  assert.equal(
    f.controller.walletPending?.pending.transfer.ticket,
    pending.pending.transfer.ticket,
  );
  const started = deferred<void>(),
    response = deferred<Response>();
  f.overrides.set('/api/account/recovery-cancel', () => {
    started.resolve();
    return response.promise;
  });
  const cancelling = f.controller.cancelWalletRecovery();
  await waitForBoundary(started.promise);
  assert.equal(f.controller.walletPending, null);
  assert.equal(f.pendingRecords.size, 0);
  response.resolve(Response.json({ status: 'cancelled' }));
  await cancelling;
  assert.equal(f.controller.authorized, false);
});

await test('a mobile recovery request received after session invalidation is not retained or opened', async (t) => {
  const f = controllerFixture(t),
    started = deferred<void>(),
    response = deferred<Response>();
  f.overrides.set('/api/account/recovery-start', async (init) => {
    const input = requestBody(init) as Record<string, unknown>;
    const ticket = 'a'.repeat(64),
      transfer = { version: 1, ticket, ...input };
    const result = Response.json({
      ticket,
      commitment: await digest(canonical(transfer)),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      serverTime: new Date().toISOString(),
    });
    started.resolve();
    await response.promise;
    return result;
  });
  const pending = f.controller.beginWalletRecovery({
    mode: 'initialize',
    wallet: 'MetaMask',
    name: 'Synthetic device',
    revoked: [],
    revision: 0,
  });
  const rejected = assert.rejects(pending, /Session changed/);
  await waitForBoundary(started.promise);
  f.controller.setSession(null);
  response.resolve(
    Response.json({
      ticket: 'a'.repeat(64),
      commitment: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      serverTime: new Date().toISOString(),
    }),
  );
  await rejected;
  assert.equal(f.controller.walletPending, null);
  assert.equal(f.pendingRecords.size, 0);
  assert.equal(f.controller.authorized, false);
});

await test('linking keeps the recipient unauthorized until the signed receipt is confirmed and clears both drafts', async (t) => {
  const f = controllerFixture(t);
  const signature = await f.wallet.signMessage(recoveryMessage(f.config));
  await f.controller.completeLoginOpening({
    config: f.config,
    count: 2,
    signatures: [signature, signature],
  });
  const recipientStorage = deviceDatabase();
  f.useStorage(recipientStorage);
  const second = new DeviceController();
  second.setSession({
    ...f.session,
    deviceId: crypto.randomUUID(),
    csrf: 'b'.repeat(64),
  });
  await second.startLink('Synthetic linked device');
  assert.ok(second.pendingCode);
  assert.ok(second.pendingFingerprint);
  assert.ok(second.expiresAt > Date.now());
  assert.equal(second.authorized, false);
  const code = canonical(second.pendingCode);
  f.useStorage();
  await f.controller.inspectCode(code);
  assert.ok(f.controller.approvalCode);
  await f.controller.approveLink();
  assert.equal(f.controller.approvalCode, null);
  assert.ok(f.controller.receipt);
  f.useStorage(recipientStorage);
  await assert.rejects(
    second.finishLink('wrong receipt'),
    /Confirmation code does not match/,
  );
  assert.equal(second.authorized, false);
  assert.ok(second.pendingCode);
  await second.finishLink(f.controller.receipt);
  assert.equal(second.authorized, true);
  assert.equal(second.pendingCode, null);
  assert.equal(second.pendingFingerprint, '');
  assert.deepEqual(second.ring, f.controller.ring);
});

await test('direct wallet recovery initializes through the existing authority without leaving a pending return', async (t) => {
  const f = controllerFixture(t);
  f.injectWallet();
  assert.equal(
    await f.controller.beginWalletRecovery({
      mode: 'initialize',
      wallet: 'MetaMask',
      name: 'Synthetic device',
      revoked: [],
      revision: 0,
    }),
    true,
  );
  assert.equal(f.controller.authorized, true);
  assert.equal(f.events.length, 1);
  assert.equal(f.controller.walletPending, null);
  assert.equal(f.pendingRecords.size, 0);
  assert.ok(!f.calls.includes('/api/account/recovery-start'));
});

await test('mobile return stays pending without signatures and confirms the encrypted result through the same checkpoint authority', async (t) => {
  const f = controllerFixture(t);
  assert.equal(
    await f.controller.beginWalletRecovery({
      mode: 'initialize',
      wallet: 'MetaMask',
      name: 'Synthetic device',
      revoked: [],
      revision: 0,
    }),
    false,
  );
  const flow = f.controller.walletPending!;
  const response = (envelope: unknown) =>
    Promise.resolve(
      Response.json({
        envelope,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        serverTime: new Date().toISOString(),
      }),
    );
  f.overrides.set('/api/account/recovery-take', () => response(null));
  assert.equal(await f.controller.finishWalletRecovery(), false);
  assert.equal(f.controller.authorized, false);
  assert.equal(f.controller.walletPending, flow);
  const signature = await f.wallet.signMessage(recoveryMessage(flow.config));
  const envelope = await sealTo(
    flow.pending.transfer.receiver,
    { signatures: [signature, signature] },
    transferContext(flow.pending.transfer),
  );
  f.overrides.set('/api/account/recovery-take', () => response(envelope));
  assert.equal(await f.controller.finishWalletRecovery(), true);
  assert.equal(f.controller.authorized, true);
  assert.equal(f.controller.walletPending, null);
  assert.equal(f.pendingRecords.size, 0);
  assert.equal((await readCheckpoint(f.session.accountId)).events.length, 1);
});

await test('enrollment join binds the new session to its proven recipient and pins the code without granting vault access', async (t) => {
  const f = controllerFixture(t);
  const invitation = {
    version: 1 as const,
    id: crypto.randomUUID(),
    accountId: f.session.accountId,
    root: 'b'.repeat(64),
    secret: 'c'.repeat(64),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  };
  let substituted = true;
  f.overrides.set('/api/account/enrollment-join', async (init) => {
    const input = requestBody(init) as { code: LinkCode; proof: string };
    await verifyEnrollmentMac(invitation.secret, input.code, input.proof);
    return Response.json({
      ...f.session,
      deviceId: substituted ? crypto.randomUUID() : input.code.device.id,
      walletConfirmed: false,
    });
  });
  await assert.rejects(
    f.controller.joinEnrollment(enrollmentPayload(invitation)),
    /Session differs/,
  );
  assert.equal(f.controller.session, f.session);
  substituted = false;
  const joined = await f.controller.joinEnrollment(
    enrollmentPayload(invitation),
  );
  assert.equal(joined.walletConfirmed, false);
  assert.notEqual(joined.deviceId, f.session.deviceId);
  assert.equal(f.controller.authorized, false);
  const checkpoint = await readCheckpoint(f.session.accountId);
  assert.equal(checkpoint.trustedRoot, invitation.root);
  assert.deepEqual(checkpoint.events, []);
});
