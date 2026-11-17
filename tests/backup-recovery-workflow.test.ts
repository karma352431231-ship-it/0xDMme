import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Wallet } from 'ethers';
import type { AccountSession } from '../src/shared/account/index.ts';
import { identityOf } from '../src/shared/devices/index.ts';
import type { DirectoryEvent } from '../src/shared/devices/index.ts';
import { recoveryMessage } from '../src/shared/wallet-recovery/index.ts';
import {
  createWalletRecoveryFor,
  walletRecoveryKey,
} from '../src/client/wallet-recovery/index.ts';
import { detectedWalletSigner } from '../src/client/wallet-signer/index.ts';
import {
  createIdentity,
  createRecovery,
  recoverSecrets,
} from '../src/client/device-keys/index.ts';
import type { Keyring } from '../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../src/client/device-operations/index.ts';
import { DeviceBackupRecovery } from '../src/client/devices/backup-recovery.ts';
import type { BackupAuthority } from '../src/client/devices/backup-recovery.ts';
import type { WalletConnection } from '../src/client/wallet/index.ts';

const origin = 'https://0xdmme.app';
(globalThis as { location?: unknown }).location = { origin };

function wallet(value: number) {
  const signer = new Wallet(`0x${value.toString(16).padStart(64, '0')}`);
  const identity = {
    ecosystem: 'evm' as const,
    address: signer.address.toLowerCase(),
  };
  const prompts: string[] = [];
  const connection: WalletConnection = {
    id: `test:${value}`,
    name: `Wallet ${value}`,
    ecosystem: 'evm',
    identity: () =>
      Promise.resolve({ ...identity, address: signer.address, chainId: 1 }),
    sign: (message) => {
      prompts.push(message);
      return signer.signMessage(message);
    },
    observe: () => () => undefined,
  };
  return { signer, identity, connection, prompts };
}
type TestWallet = ReturnType<typeof wallet>;

/** The directory and keys one account's devices share, as a server would
 * hold them, with the authority contract a device controller provides. */
async function account(main: TestWallet) {
  const accountId = crypto.randomUUID();
  const config = createWalletRecoveryFor(accountId, main.identity, origin);
  const device = await createIdentity(crypto.randomUUID(), 'First');
  const created = await createRecovery(
    accountId,
    await walletRecoveryKey(config, [
      await main.signer.signMessage(recoveryMessage(config)),
    ]),
    config,
  );
  const state: { event: DirectoryEvent; ring: Keyring; joined: Keyring[] } = {
    ring: freshKeyring(accountId),
    event: undefined as unknown as DirectoryEvent,
    joined: [],
  };
  state.event = await prepareEvent({
    accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: created.signing,
    root: created.root,
    identities: [device.public],
    ring: state.ring,
    profile: null,
  });
  const session = (
    confirmed: TestWallet,
    deviceId: string,
  ): AccountSession => ({
    accountId,
    ecosystem: 'evm',
    address: main.identity.address,
    name: '',
    deviceId,
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: '2027-11-17T00:00:00.000Z',
    csrf: 'a'.repeat(64),
    profileRevision: 0,
    walletConfirmed: true,
    wallet: confirmed.identity,
  });
  let pending: Keyring | null = null;
  const authority = (active: AccountSession): BackupAuthority => ({
    run: (operation) => operation(active),
    current: () => Promise.resolve(state.event),
    directory: () => Promise.resolve(state.event),
    lease: () => () => undefined,
    prepare: (_session, change) =>
      prepareEvent({
        accountId,
        previous: change.previous,
        kind: 'reseal',
        signer: 'recovery',
        signing: change.signing,
        root: change.previous.root,
        identities: change.previous.devices.map(identityOf),
        ring: state.ring,
        profile: null,
        backups: change.backups,
      }),
    publish: (_session, event) => {
      state.event = event;
      return Promise.resolve();
    },
    rotate: async (_session, change) => {
      pending = freshKeyring(accountId, state.ring);
      return {
        profile: null,
        event: await prepareEvent({
          accountId,
          previous: change.previous,
          kind: 'reroot',
          signer: 'recovery',
          signing: change.signing,
          root: change.root,
          identities: change.previous.devices.map(identityOf),
          ring: pending,
          profile: null,
          backups: change.backups,
          pairs: change.pairs,
        }),
      };
    },
    publishRotation: (_session, event) => {
      assert.ok(pending);
      state.event = event;
      state.ring = pending;
      return Promise.resolve();
    },
    recoverDevice: async (_session, opened) => {
      state.joined.push(opened.ring);
      const added = await createIdentity(active.deviceId, 'Second');
      const ring = freshKeyring(accountId, opened.ring);
      state.event = await prepareEvent({
        accountId,
        previous: state.event,
        kind: 'recover',
        signer: 'recovery',
        signing: opened.signing,
        root: state.event.root,
        identities: [...state.event.devices.map(identityOf), added.public],
        ring,
        profile: null,
      });
      state.ring = ring;
    },
  });
  return {
    accountId,
    state,
    recovery: (confirmed: TestWallet, deviceId = device.public.id) =>
      new DeviceBackupRecovery(authority(session(confirmed, deviceId))),
  };
}
function signerOver(...wallets: TestWallet[]) {
  return detectedWalletSigner({
    connections: () => wallets.map((entry) => entry.connection),
    select: () => Promise.reject(new Error('No wallet should need selecting.')),
  });
}
async function key(owner: TestWallet, event: DirectoryEvent) {
  const config = [
    event.root.wallet,
    ...(event.backups ?? []).map((backup) => backup.wallet),
  ].find((entry) => entry?.address === owner.identity.address);
  assert.ok(config);
  return {
    config,
    secret: await walletRecoveryKey(config, [
      await owner.signer.signMessage(recoveryMessage(config)),
    ]),
  };
}

await test('from one wallet to a backup, to three wallets in pairs, to a new device, and back to two', async () => {
  const [main, backup, third] = [wallet(1), wallet(2), wallet(3)];
  const c = await account(main);
  const registered: string[] = [];

  // A backup wallet: one signature from the session's wallet, two from it.
  await c.recovery(main).add({
    opener: main.connection,
    backup: backup.connection,
    register: (added) => {
      registered.push(added.address);
      return Promise.resolve();
    },
  });
  assert.deepEqual(registered, [backup.identity.address]);
  assert.equal(c.state.event.kind, 'reseal');
  assert.deepEqual([main.prompts.length, backup.prompts.length], [1, 2]);
  const viaBackup = await key(backup, c.state.event);
  assert.deepEqual(
    (await recoverSecrets(c.state.event, viaBackup.secret, viaBackup.config))
      .ring,
    c.state.ring,
  );

  // A third wallet: the account moves to pairs under a new authority.
  const before = c.state.event;
  await c.recovery(main).enterPairs({
    sign: signerOver(main, backup, third),
    third: third.identity,
    register: () => {
      registered.push(third.identity.address);
      return Promise.resolve();
    },
  });
  const paired = c.state.event;
  assert.equal(paired.kind, 'reroot');
  assert.equal(paired.pairs?.length, 3);
  assert.equal(paired.backups, undefined);
  assert.notEqual(paired.root.signing, before.root.signing);
  assert.equal(paired.epoch, before.epoch + 1);
  // The session's wallet signs the old and the new statement, the backup one
  // new statement and the new wallet its statement twice.
  assert.deepEqual(
    [main.prompts.length, backup.prompts.length, third.prompts.length],
    [3, 3, 2],
  );
  // What opened recovery before the change no longer does.
  await assert.rejects(
    recoverSecrets(paired, viaBackup.secret, viaBackup.config),
    /Recovery rejected/u,
  );

  // A new device signed in with the backup wallet opens with the third.
  const ring = c.state.ring;
  await c.recovery(backup, crypto.randomUUID()).recoverWithPair({
    sign: signerOver(backup, third),
    second: third.identity,
  });
  assert.deepEqual(c.state.joined, [ring]);
  assert.equal(c.state.event.kind, 'recover');
  assert.equal(c.state.event.devices.length, 2);
  assert.deepEqual(c.state.event.pairs, paired.pairs);
  // The session's wallet with a wallet outside the account opens nothing.
  await assert.rejects(
    c.recovery(backup, crypto.randomUUID()).recoverWithPair({
      sign: signerOver(backup, wallet(4)),
      second: wallet(4).identity,
    }),
    /do not open recovery together/u,
  );

  // The main wallet cannot be the one removed.
  await assert.rejects(
    c.recovery(main).leavePairs({
      sign: signerOver(main, backup, third),
      remove: main.identity,
    }),
    /main wallet cannot be removed/u,
  );
  // Removing the third returns to a main wallet and one backup.
  await c.recovery(main).leavePairs({
    sign: signerOver(main, backup),
    remove: third.identity,
  });
  const single = c.state.event;
  assert.equal(single.kind, 'reroot');
  assert.equal(single.pairs, undefined);
  assert.equal(single.backups?.length, 1);
  for (const owner of [main, backup]) {
    const opened = await key(owner, single);
    assert.deepEqual(
      (await recoverSecrets(single, opened.secret, opened.config)).ring,
      c.state.ring,
    );
  }
});

await test('nothing is published when the directory moved while the wallets were signing', async () => {
  const [main, backup] = [wallet(1), wallet(2)];
  const c = await account(main);
  const original = c.state.event;
  const other = await createIdentity(crypto.randomUUID(), 'Other');
  await assert.rejects(
    c.recovery(main).add({
      opener: main.connection,
      backup: backup.connection,
      // Another device changes the directory during the signing window.
      register: async () => {
        c.state.event = await prepareEvent({
          accountId: c.accountId,
          previous: original,
          kind: 'link',
          signer: original.devices[0]!.id,
          signing: (await createIdentity(original.devices[0]!.id, 'x')).signing,
          root: original.root,
          identities: [identityOf(original.devices[0]!), other.public],
          ring: c.state.ring,
          linkId: crypto.randomUUID(),
          profile: null,
        }).catch(() => ({ ...original, revision: original.revision + 1 }));
      },
    }),
    /Authorization changed during signing/u,
  );
  assert.equal(c.state.event.backups, undefined);
});

await test('a wallet this browser does not present is asked for once, then the step fails', async () => {
  const [main, backup, third] = [wallet(1), wallet(2), wallet(3)];
  const asked: string[] = [];
  const sign = detectedWalletSigner({
    connections: () => [main.connection],
    select: (needed) => {
      asked.push(needed.address);
      return Promise.resolve();
    },
  });
  const config = createWalletRecoveryFor(
    crypto.randomUUID(),
    backup.identity,
    origin,
  );
  await assert.rejects(
    sign(config, 1, () => undefined),
    /not selected in this browser/u,
  );
  assert.deepEqual(asked, [backup.identity.address]);
  assert.deepEqual(third.prompts, []);
});
