import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Wallet } from 'ethers';
import { verifyTransition } from '../src/shared/devices/index.ts';
import type {
  DirectoryEvent,
  RecoveryBackup,
} from '../src/shared/devices/index.ts';
import { recoveryMessage } from '../src/shared/wallet-recovery/index.ts';
import type { WalletRecovery } from '../src/shared/wallet-recovery/index.ts';
import {
  createWalletRecoveryFor,
  walletRecoveryKey,
} from '../src/client/wallet-recovery/index.ts';
import {
  createIdentity,
  createRecovery,
  recoverSecrets,
  recoverySigner,
  sealBackup,
  signEvent,
} from '../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../src/client/device-operations/index.ts';

const origin = 'https://0xdmme.app';
function signer(value: number, accountId: string) {
  const wallet = new Wallet(`0x${value.toString(16).padStart(64, '0')}`);
  const config = createWalletRecoveryFor(
    accountId,
    { ecosystem: 'evm', address: wallet.address.toLowerCase() },
    origin,
  );
  return {
    config,
    key: async (target: WalletRecovery = config) =>
      walletRecoveryKey(target, [
        await wallet.signMessage(recoveryMessage(target)),
      ]),
  };
}
/** An account opened by its main wallet on one device. */
async function account() {
  const accountId = crypto.randomUUID();
  const main = signer(1, accountId);
  const device = await createIdentity(crypto.randomUUID(), 'A');
  const authority = await createRecovery(
    accountId,
    await main.key(),
    main.config,
  );
  const ring = freshKeyring(accountId);
  const initial = await prepareEvent({
    accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: authority.signing,
    root: authority.root,
    identities: [device.public],
    ring,
    profile: null,
  });
  return { accountId, main, device, authority, ring, initial };
}
type Account = Awaited<ReturnType<typeof account>>;
function reseal(
  c: Account,
  previous: DirectoryEvent,
  signing: CryptoKey,
  backups: RecoveryBackup[],
) {
  return prepareEvent({
    accountId: c.accountId,
    previous,
    kind: 'reseal',
    signer: 'recovery',
    signing,
    root: previous.root,
    identities: previous.devices,
    ring: c.ring,
    profile: null,
    backups,
  });
}
/** The account after a backup wallet received its own capsule. */
async function withBackup(c: Account, value = 2) {
  const backup = signer(value, c.accountId);
  const sealed = await sealBackup({
    event: c.initial,
    opener: { secret: await c.main.key(), wallet: c.main.config },
    backup: { wallet: backup.config, secret: await backup.key() },
  });
  const event = await reseal(c, c.initial, sealed.signing, [sealed.backup]);
  return { backup, sealed, event };
}
/** Re-signs a hand-altered event, as an attacker holding `key` could. */
async function forged(
  previous: DirectoryEvent,
  event: DirectoryEvent,
  key: CryptoKey,
): Promise<DirectoryEvent> {
  return verifyTransition(previous, await signEvent(event, key));
}

await test('a backup wallet opens the same recovery as the main wallet, and only with its own key', async () => {
  const c = await account();
  const { backup, event } = await withBackup(c);
  assert.equal(event.kind, 'reseal');
  assert.deepEqual(event.root, c.initial.root);
  assert.deepEqual(event.devices, c.initial.devices);

  const viaBackup = await recoverSecrets(
    event,
    await backup.key(),
    backup.config,
  );
  const viaMain = await recoverSecrets(event, await c.main.key());
  assert.deepEqual(viaBackup.ring, c.ring);
  assert.deepEqual(viaMain.ring, c.ring);

  // The main wallet cannot even derive a key for the backup's statement, and
  // its own key does not open the backup capsule. Nor the reverse.
  await assert.rejects(
    c.main.key(backup.config),
    /Recovery signature rejected/u,
  );
  await assert.rejects(
    recoverSecrets(event, await c.main.key(), backup.config),
    /Recovery rejected/u,
  );
  await assert.rejects(
    recoverSecrets(event, await backup.key(), c.main.config),
    /Recovery rejected/u,
  );
  // A wallet with no capsule opens nothing.
  const stranger = signer(3, c.accountId);
  await assert.rejects(
    recoverSecrets(event, await stranger.key(), stranger.config),
    /Recovery rejected/u,
  );
});

await test('a backup capsule is bound to its account and wallet', async () => {
  const c = await account();
  const { backup, sealed } = await withBackup(c);
  const other = signer(2, crypto.randomUUID());
  for (const wallet of [
    { ...backup.config, accountId: other.config.accountId },
    { ...backup.config, salt: other.config.salt },
    { ...backup.config, id: other.config.id },
  ])
    await assert.rejects(
      reseal(c, c.initial, sealed.signing, [{ ...sealed.backup, wallet }]).then(
        async (event) =>
          recoverSecrets(event, await backup.key(wallet), wallet),
      ),
    );
});

await test('only the recovery authority changes backup wallets, and nothing else with them', async () => {
  const c = await account();
  const { sealed, event } = await withBackup(c);
  const base = {
    ...c.initial,
    revision: 2,
    previous: event.previous,
    kind: 'reseal' as const,
    signer: 'recovery',
    backups: [sealed.backup],
  };
  // Signed by a device instead of the authority.
  await assert.rejects(
    forged(
      c.initial,
      { ...base, signer: c.device.public.id },
      c.device.signing,
    ),
  );
  await assert.rejects(forged(c.initial, base, c.device.signing));
  // Changing anything beside the backups.
  await assert.rejects(
    forged(c.initial, { ...base, epoch: 2 }, sealed.signing),
    /Invalid backup wallet change/u,
  );
  await assert.rejects(
    forged(
      c.initial,
      {
        ...base,
        devices: [{ ...c.initial.devices[0]!, name: 'Renamed' }],
      },
      sealed.signing,
    ),
  );
  // A reseal that changes nothing.
  await assert.rejects(
    forged(event, { ...event, revision: 3, previous: null }, sealed.signing),
  );
  // Another kind of change cannot add, drop or replace backups.
  const second = await createIdentity(crypto.randomUUID(), 'B');
  const linked = await prepareEvent({
    accountId: c.accountId,
    previous: event,
    kind: 'link',
    signer: c.device.public.id,
    signing: c.device.signing,
    root: event.root,
    identities: [c.device.public, second.public],
    ring: c.ring,
    linkId: crypto.randomUUID(),
    profile: null,
  });
  assert.deepEqual(linked.backups, event.backups);
  const { backups: _dropped, ...withoutBackups } = linked;
  void _dropped;
  await assert.rejects(
    forged(event, withoutBackups, c.device.signing),
    /only through the recovery authority/u,
  );
});

await test('backup wallets must be distinct wallets of this account, at most two', async () => {
  const c = await account();
  const { sealed } = await withBackup(c);
  const third = await sealBackup({
    event: c.initial,
    opener: { secret: await c.main.key(), wallet: c.main.config },
    backup: {
      wallet: signer(3, c.accountId).config,
      secret: await signer(3, c.accountId).key(),
    },
  });
  const fourth = { ...third.backup, wallet: signer(4, c.accountId).config };
  for (const backups of [
    [sealed.backup, sealed.backup],
    [{ ...sealed.backup, wallet: c.main.config }],
    [sealed.backup, third.backup, fourth],
    [],
  ])
    await assert.rejects(reseal(c, c.initial, sealed.signing, backups));
  assert.equal(
    (await reseal(c, c.initial, sealed.signing, [sealed.backup, third.backup]))
      .backups?.length,
    2,
  );
});

await test('removing the backup leaves no capsule for it and the main wallet still opens recovery', async () => {
  const c = await account();
  const { backup, event } = await withBackup(c);
  const signing = await recoverySigner(
    event,
    await c.main.key(),
    c.main.config,
  );
  const removed = await reseal(c, event, signing, []);
  assert.equal(Object.hasOwn(removed, 'backups'), false);
  await assert.rejects(
    recoverSecrets(removed, await backup.key(), backup.config),
    /Recovery rejected/u,
  );
  assert.deepEqual(
    (await recoverSecrets(removed, await c.main.key())).ring,
    c.ring,
  );
  // The backup wallet can also remove itself's sibling: it opens the authority.
  assert.ok(await recoverySigner(event, await backup.key(), backup.config));
});

await test('an account starts without backup wallets', async () => {
  const c = await account();
  const { sealed } = await withBackup(c);
  await assert.rejects(
    verifyTransition(
      null,
      await signEvent(
        { ...c.initial, backups: [sealed.backup] },
        c.authority.signing,
      ),
    ),
  );
});
