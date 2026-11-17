import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Wallet } from 'ethers';
import { verifyTransition } from '../src/shared/devices/index.ts';
import type {
  DirectoryEvent,
  RecoveryBackup,
  RecoveryPair,
} from '../src/shared/devices/index.ts';
import { encode } from '../src/shared/account/index.ts';
import { recoveryMessage } from '../src/shared/wallet-recovery/index.ts';
import type { WalletRecovery } from '../src/shared/wallet-recovery/index.ts';
import {
  createWalletRecoveryFor,
  walletPairKey,
  walletRecoveryKey,
} from '../src/client/wallet-recovery/index.ts';
import {
  createIdentity,
  createRecovery,
  openRecovery,
  replaceRecovery,
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
    sign: (target: WalletRecovery = config) =>
      wallet.signMessage(recoveryMessage(target)),
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

await test('one backup wallet at most, distinct from the main wallet and of this account', async () => {
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
  for (const backups of [
    [sealed.backup, sealed.backup],
    [{ ...sealed.backup, wallet: c.main.config }],
    // Two single-wallet capsules would let any of three wallets open recovery.
    [sealed.backup, third.backup],
    [],
  ])
    await assert.rejects(reseal(c, c.initial, sealed.signing, backups));
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

type Signer = ReturnType<typeof signer>;
function walletOrder(a: Signer, b: Signer): [Signer, Signer] {
  const key = (value: Signer) =>
    `${value.config.ecosystem}:${value.config.address}`;
  return key(a) < key(b) ? [a, b] : [b, a];
}
/** The key two wallets derive together, as each derives it on demand. */
async function pairKey(a: Signer, b: Signer, salt: string) {
  const [first, second] = walletOrder(a, b);
  return walletPairKey({
    wallets: [first.config, second.config],
    signatures: [await first.sign(), await second.sign()],
    salt,
  });
}
/** The account moved to three wallets: a new authority sealed for each pair. */
async function withPairs(c: Account) {
  const wallets = [1, 2, 3].map((value) => signer(value, c.accountId)) as [
    Signer,
    Signer,
    Signer,
  ];
  const combinations = [
    [wallets[0], wallets[1]],
    [wallets[0], wallets[2]],
    [wallets[1], wallets[2]],
  ] as const;
  const sealedPairs = [];
  for (const [a, b] of combinations) {
    const [first, second] = walletOrder(a, b);
    const salt = encode(crypto.getRandomValues(new Uint8Array(32)));
    sealedPairs.push({
      wallets: [first.config, second.config] as const,
      salt,
      secret: await pairKey(a, b, salt),
    });
  }
  const replaced = await replaceRecovery(c.accountId, {
    main: wallets[0].config,
    pairs: sealedPairs,
  });
  const ring = freshKeyring(c.accountId, c.ring);
  const event = await prepareEvent({
    accountId: c.accountId,
    previous: c.initial,
    kind: 'reroot',
    signer: 'recovery',
    signing: c.authority.signing,
    root: replaced.root,
    identities: c.initial.devices,
    ring,
    profile: null,
    pairs: replaced.pairs,
  });
  return { wallets, replaced, ring, event };
}
function pairOf(event: DirectoryEvent, a: Signer, b: Signer): RecoveryPair {
  const [first, second] = walletOrder(a, b);
  const pair = event.pairs?.find(
    (entry) =>
      entry.wallets[0].address === first.config.address &&
      entry.wallets[1].address === second.config.address,
  );
  assert.ok(pair);
  return pair;
}

await test('with three wallets any two open recovery and no single wallet does', async () => {
  const c = await account();
  const { wallets, ring, event } = await withPairs(c);
  assert.equal(event.kind, 'reroot');
  assert.notEqual(event.root.signing, c.initial.root.signing);
  assert.equal(event.epoch, 2);
  for (const [a, b] of [
    [wallets[0], wallets[1]],
    [wallets[2], wallets[0]],
    [wallets[1], wallets[2]],
  ] as const) {
    const pair = pairOf(event, a, b);
    const opened = await openRecovery(event, {
      secret: await pairKey(a, b, pair.salt),
      pair: pair.wallets,
    });
    assert.deepEqual(opened.ring, ring);
  }
  // One wallet's own key opens nothing, whichever capsule it is tried on.
  for (const wallet of wallets) {
    await assert.rejects(
      recoverSecrets(event, await wallet.key(), wallet.config),
      /Recovery rejected/u,
    );
    await assert.rejects(
      recoverSecrets(event, await wallet.key()),
      /Recovery rejected/u,
    );
  }
  // The key of one pair does not open another pair's capsule.
  const first = pairOf(event, wallets[0], wallets[1]);
  const other = pairOf(event, wallets[1], wallets[2]);
  await assert.rejects(
    openRecovery(event, {
      secret: await pairKey(wallets[0], wallets[1], first.salt),
      pair: other.wallets,
    }),
    /Recovery rejected/u,
  );
  // The old authority, opened by the main wallet alone, no longer applies.
  await assert.rejects(
    recoverSecrets(event, await c.main.key(), c.main.config),
    /Recovery rejected/u,
  );
});

await test('a pair key needs each wallet to sign its own statement', async () => {
  const accountId = crypto.randomUUID();
  const [a, b] = walletOrder(signer(1, accountId), signer(2, accountId));
  const salt = encode(crypto.getRandomValues(new Uint8Array(32)));
  const wallets = [a.config, b.config] as const;
  await walletPairKey({
    wallets,
    signatures: [await a.sign(), await b.sign()],
    salt,
  });
  for (const signatures of [
    [await b.sign(), await a.sign()],
    [await a.sign(), await a.sign()],
    [await a.sign(), await signer(3, accountId).sign(b.config)],
  ] as const)
    await assert.rejects(
      walletPairKey({ wallets, signatures, salt }),
      /Recovery signature rejected/u,
    );
});

await test('only the previous authority replaces the root, with new keys and the same devices', async () => {
  const c = await account();
  const { replaced, event } = await withPairs(c);
  const base = { ...event, signature: event.signature };
  // Signed by the new authority or by a device instead of the previous one.
  await assert.rejects(forged(c.initial, base, replaced.signing));
  await assert.rejects(forged(c.initial, base, c.device.signing));
  // Keeping the old root keys under the new kind.
  await assert.rejects(
    forged(
      c.initial,
      {
        ...base,
        root: {
          ...event.root,
          signing: c.initial.root.signing,
          wrapping: c.initial.root.wrapping,
        },
      },
      c.authority.signing,
    ),
    /Invalid recovery replacement/u,
  );
  await assert.rejects(
    forged(c.initial, { ...base, epoch: 1 }, c.authority.signing),
    /Invalid recovery replacement/u,
  );
  const stranger = await createIdentity(crypto.randomUUID(), 'X');
  await assert.rejects(
    forged(
      c.initial,
      {
        ...base,
        devices: [
          ...event.devices,
          { ...event.devices[0]!, ...stranger.public },
        ],
      },
      c.authority.signing,
    ),
  );
});

await test('pairs are all three combinations of three wallets, never beside a backup', async () => {
  const c = await account();
  const { wallets, event } = await withPairs(c);
  const pairs = event.pairs!;
  const outsider = signer(4, c.accountId);
  const { sealed } = await withBackup(c);
  for (const altered of [
    { pairs: pairs.slice(0, 2) },
    { pairs: [pairs[0]!, pairs[0]!, pairs[1]!] },
    {
      pairs: [
        { ...pairs[0]!, wallets: [pairs[0]!.wallets[1], pairs[0]!.wallets[0]] },
        pairs[1]!,
        pairs[2]!,
      ],
    },
    {
      pairs: [
        pairs[0]!,
        pairs[1]!,
        { ...pairs[2]!, wallets: [pairs[2]!.wallets[0], outsider.config] },
      ],
    },
    {
      pairs: pairs.map((pair) => ({
        ...pair,
        wallets: pair.wallets.map((wallet) =>
          wallet.address === wallets[1].config.address
            ? { ...wallet, id: crypto.randomUUID() }
            : wallet,
        ),
      })),
    },
    { pairs, backups: [sealed.backup] },
    {
      pairs,
      root: { ...event.root, wallet: outsider.config },
    },
  ])
    await assert.rejects(
      forged(
        c.initial,
        { ...event, ...altered } as DirectoryEvent,
        c.authority.signing,
      ),
    );
});

await test('while pairs exist nothing but another root replacement changes them', async () => {
  const c = await account();
  const { wallets, replaced, ring, event } = await withPairs(c);
  const { sealed } = await withBackup(c);
  // A reseal cannot add a single-wallet capsule beside pairs.
  await assert.rejects(
    forged(
      event,
      {
        ...event,
        revision: 3,
        kind: 'reseal',
        backups: [sealed.backup],
      },
      replaced.signing,
    ),
  );
  // Linking a device carries the pairs over untouched.
  const second = await createIdentity(crypto.randomUUID(), 'B');
  const linked = await prepareEvent({
    accountId: c.accountId,
    previous: event,
    kind: 'link',
    signer: c.device.public.id,
    signing: c.device.signing,
    root: event.root,
    identities: [c.device.public, second.public],
    ring,
    linkId: crypto.randomUUID(),
    profile: null,
  });
  assert.deepEqual(linked.pairs, event.pairs);
  const { pairs: _dropped, ...withoutPairs } = linked;
  void _dropped;
  await assert.rejects(
    forged(event, withoutPairs, c.device.signing),
    /only through the recovery authority/u,
  );

  // Two wallets together return the account to the single-wallet rule.
  const pair = pairOf(event, wallets[1], wallets[2]);
  const opened = await openRecovery(event, {
    secret: await pairKey(wallets[1], wallets[2], pair.salt),
    pair: pair.wallets,
  });
  const main = signer(1, c.accountId);
  const backup = signer(3, c.accountId);
  const single = await replaceRecovery(c.accountId, {
    main: { wallet: main.config, secret: await main.key() },
    backups: [{ wallet: backup.config, secret: await backup.key() }],
  });
  const nextRing = freshKeyring(c.accountId, opened.ring);
  const back = await prepareEvent({
    accountId: c.accountId,
    previous: event,
    kind: 'reroot',
    signer: 'recovery',
    signing: opened.signing,
    root: single.root,
    identities: event.devices,
    ring: nextRing,
    profile: null,
    backups: single.backups,
  });
  assert.equal(Object.hasOwn(back, 'pairs'), false);
  assert.deepEqual(
    (await recoverSecrets(back, await main.key())).ring,
    nextRing,
  );
  assert.deepEqual(
    (await recoverSecrets(back, await backup.key(), backup.config)).ring,
    nextRing,
  );
  await assert.rejects(
    openRecovery(back, {
      secret: await pairKey(wallets[1], wallets[2], pair.salt),
      pair: pair.wallets,
    }),
    /Recovery rejected/u,
  );
});
