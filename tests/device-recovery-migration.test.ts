import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Wallet } from 'ethers';
import { canonical, digest, eventHash } from '../src/shared/devices/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import { recoveryMessage } from '../src/shared/wallet-recovery/index.ts';
import {
  createWalletRecovery,
  walletRecoveryKey,
} from '../src/client/wallet-recovery/index.ts';
import {
  createIdentity,
  createRecovery,
  newSecret,
} from '../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../src/client/device-operations/index.ts';
import {
  advanceCheckpoint,
  readCheckpoint,
} from '../src/client/device-storage/index.ts';
import { DeviceController } from '../src/client/devices/controller.ts';

// This fixture models only atomic checkpoint reads/writes. Real IndexedDB and
// non-exportable key persistence are verified separately in the browser.
function checkpointDatabase(records: Map<string, unknown>): IDBFactory {
  return {
    open() {
      const opening: { result: unknown; onsuccess?: () => void } = {
        result: {
          close() {},
          transaction() {
            const transaction: {
              oncomplete?: () => void;
              abort: () => void;
              objectStore: () => unknown;
            } = {
              abort() {},
              objectStore: () => ({
                get(key: string) {
                  const request: { result: unknown; onsuccess?: () => void } = {
                    result: structuredClone(records.get(key)),
                  };
                  queueMicrotask(() => {
                    request.onsuccess?.();
                    transaction.oncomplete?.();
                  });
                  return request;
                },
                put(value: unknown, key: string) {
                  records.set(key, structuredClone(value));
                },
              }),
            };
            return transaction;
          },
        },
      };
      queueMicrotask(() => opening.onsuccess?.());
      return opening;
    },
  } as unknown as IDBFactory;
}
await test('raiz local avança só por migração verificada; outro aparelho reconcilia e usa épocas antigas', async (t) => {
  const wallet = new Wallet(`0x${'1'.padStart(64, '0')}`);
  const accountId = crypto.randomUUID();
  const identity = await createIdentity(crypto.randomUUID(), 'A');
  const session: AccountSession = {
    accountId,
    deviceId: identity.public.id,
    ecosystem: 'evm',
    address: wallet.address.toLowerCase(),
    csrf: 'a'.repeat(64),
    name: '',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    profileRevision: 0,
    historyAuthorized: false,
    deviceState: 'pending',
  };
  const old = await createRecovery(accountId, newSecret());
  const oldRing = freshKeyring(accountId);
  const initial = await prepareEvent({
    accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: old.signing,
    root: old.root,
    identities: [identity.public],
    ring: oldRing,
    profile: null,
  });
  const config = createWalletRecovery(session, 'https://0xdmme.app');
  const authority = await createRecovery(
    accountId,
    await walletRecoveryKey(config, [
      await wallet.signMessage(recoveryMessage(config)),
    ]),
    config,
  );
  const ring = freshKeyring(accountId, oldRing);
  const migration = await prepareEvent({
    accountId,
    previous: initial,
    kind: 'migrate',
    signer: 'recovery',
    signing: old.signing,
    root: authority.root,
    identities: [identity.public],
    ring,
    profile: null,
  });
  const oldCheckpoint = {
    events: [initial],
    trustedRoot: await digest(canonical(old.root)),
  };
  const nextCheckpoint = {
    events: [initial, migration],
    trustedRoot: await digest(canonical(authority.root)),
  };
  const records = new Map<string, unknown>([
    [`checkpoint:${accountId}`, oldCheckpoint],
    [`identity:${accountId}:${identity.public.id}`, identity],
  ]);
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: checkpointDatabase(records),
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'indexedDB'));
  await assert.rejects(
    advanceCheckpoint(accountId, {
      ...nextCheckpoint,
      events: [initial, { ...migration, signature: initial.signature }],
    }),
  );
  await assert.rejects(
    advanceCheckpoint(accountId, { ...nextCheckpoint, events: [migration] }),
  );
  assert.deepEqual(await readCheckpoint(accountId), oldCheckpoint);
  await advanceCheckpoint(accountId, nextCheckpoint);
  assert.deepEqual(await readCheckpoint(accountId), nextCheckpoint);
  records.set(`checkpoint:${accountId}`, oldCheckpoint);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      locks: {
        request: (
          _name: string,
          _options: unknown,
          work: () => Promise<unknown>,
        ) => work(),
      },
    },
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: () => null },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  });
  const head = await eventHash(migration);
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(
      Response.json({
        events: [migration],
        revision: 2,
        head,
        serverTime: new Date().toISOString(),
      }),
    ),
  );
  const controller = new DeviceController();
  controller.setSession(session);
  await controller.refresh();
  assert.equal(controller.authorized, true);
  assert.deepEqual(controller.ring, ring);
  assert.equal(controller.trustedRoot, nextCheckpoint.trustedRoot);
  assert.deepEqual(await readCheckpoint(accountId), nextCheckpoint);
});
