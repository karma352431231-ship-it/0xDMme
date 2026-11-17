import { confirmingWallet } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  backupLimit,
  canonical,
  recoveryWalletFor,
} from '../../shared/devices/index.ts';
import type {
  DirectoryEvent,
  RecoveryBackup,
  RecoveryPair,
  RecoveryRoot,
} from '../../shared/devices/index.ts';
import { encode } from '../../shared/account/index.ts';
import type { EncryptedProfile } from '../../shared/account/index.ts';
import type { RecoverySigner } from '../wallet-signer/index.ts';
import type { WalletRecovery } from '../../shared/wallet-recovery/index.ts';
import { applicationOrigin } from '../application-origin/index.ts';
import {
  openRecovery,
  recoverSecrets,
  recoverySigner,
  replaceRecovery,
  sealBackup,
} from '../device-keys/index.ts';
import type { Keyring } from '../device-keys/index.ts';
import {
  createWalletRecoveryFor,
  signRecovery,
  walletPairKey,
  walletRecoveryKey,
} from '../wallet-recovery/index.ts';
import type { WalletConnection } from '../wallet/index.ts';
import type { WalletIdentity } from '../../shared/account-wallets/index.ts';
import { canonicalAddress } from '../../shared/wallet-identity/index.ts';

type Wallet = WalletIdentity;
/** What changing recovery wallets needs from the device authority. */
export interface BackupAuthority {
  run: <T>(operation: (session: AccountSession) => Promise<T>) => Promise<T>;
  /** The verified current directory, with this device authorized in it. */
  current: (session: AccountSession) => Promise<DirectoryEvent>;
  /** The verified current directory for a device not yet authorized in it;
   * its local identity is loaded. */
  directory: (session: AccountSession) => Promise<DirectoryEvent>;
  /** Throws once the session or directory this work started from is gone. */
  lease: (session: AccountSession) => (message: string) => void;
  /** Builds and verifies the signed change without publishing it. */
  prepare: (
    session: AccountSession,
    change: {
      previous: DirectoryEvent;
      signing: CryptoKey;
      backups: RecoveryBackup[];
    },
  ) => Promise<DirectoryEvent>;
  publish: (session: AccountSession, event: DirectoryEvent) => Promise<void>;
  /** Builds a root replacement: a new epoch for the same devices, with the
   * profile sealed again for it. Nothing is published. */
  rotate: (
    session: AccountSession,
    change: {
      previous: DirectoryEvent;
      signing: CryptoKey;
      root: RecoveryRoot;
      backups: RecoveryBackup[];
      pairs: RecoveryPair[];
    },
  ) => Promise<{ event: DirectoryEvent; profile: EncryptedProfile | null }>;
  publishRotation: (
    session: AccountSession,
    event: DirectoryEvent,
    profile: EncryptedProfile | null,
  ) => Promise<void>;
  /** Adds this device with an opened recovery authority. */
  recoverDevice: (
    session: AccountSession,
    opened: { ring: Keyring; signing: CryptoKey },
  ) => Promise<void>;
}
interface Snapshot {
  session: AccountSession;
  event: DirectoryEvent;
  /** Throws once the session ended or the signing window closed. */
  current: () => void;
}

const signingWindow = 5 * 60_000;
function sameWallet(a: Wallet, b: Wallet): boolean {
  return a.ecosystem === b.ecosystem && a.address === b.address;
}

/**
 * Lets a backup wallet open recovery, or stops it. Both changes are signed by
 * the recovery authority, which this workflow opens with a signature from the
 * wallet that confirmed the session. Wallet prompts happen outside the device
 * authority's exclusive turn; the turn is taken only to read the directory
 * and, at the end, to publish against that same directory. Signatures and
 * derived keys live only for the duration of one call.
 */
export class DeviceBackupRecovery {
  private readonly authority: BackupAuthority;
  constructor(authority: BackupAuthority) {
    this.authority = authority;
  }
  private snapshot(): Promise<Snapshot> {
    return this.authority.run(async (session) => {
      const valid = this.authority.lease(session);
      const end = Date.now() + signingWindow;
      return {
        session,
        event: await this.authority.current(session),
        current: () => {
          valid('Request interrupted or expired. Start again.');
          if (Date.now() > end)
            throw new Error('Request interrupted or expired. Start again.');
        },
      };
    });
  }
  /** Opens the authority with the session's wallet: one signature. */
  private async opener(
    at: Snapshot,
    connection: WalletConnection,
  ): Promise<{ wallet: WalletRecovery; secret: CryptoKey }> {
    const wallet = recoveryWalletFor(at.event, confirmingWallet(at.session));
    if (!wallet)
      throw new Error(
        'This wallet cannot open your history yet. Sign in with your main wallet and add it again in settings.',
      );
    const signatures = await signRecovery({
      wallet: connection,
      config: wallet,
      count: 1,
      current: at.current,
    });
    try {
      return { wallet, secret: await walletRecoveryKey(wallet, signatures) };
    } finally {
      signatures.fill('');
    }
  }
  /** Publishes only if the directory is still the one the work started from. */
  private publish(
    at: Snapshot,
    change: { signing: CryptoKey; backups: RecoveryBackup[] },
    verify?: (event: DirectoryEvent) => Promise<unknown>,
  ): Promise<void> {
    return this.authority.run(async (session) => {
      at.current();
      const latest = await this.authority.current(session);
      if (canonical(latest) !== canonical(at.event))
        throw new Error(
          'Authorization changed during signing. Cancel and check again.',
        );
      const event = await this.authority.prepare(session, {
        previous: latest,
        ...change,
      });
      await verify?.(event);
      at.current();
      await this.authority.publish(session, event);
    });
  }
  /**
   * Gives the wallet selected in `backup` its own recovery capsule. The
   * session's wallet signs once to open the authority. `beforeBackup` lets the
   * user switch wallets when both live in one extension. `register` adds the
   * wallet to the account, which the server requires before it accepts the
   * capsule. The new wallet then signs its recovery statement twice, which
   * must match, before anything is published.
   */
  async add(input: {
    opener: WalletConnection;
    backup: WalletConnection;
    beforeBackup?: () => Promise<void>;
    register: (wallet: Wallet) => Promise<void>;
  }): Promise<void> {
    const at = await this.snapshot();
    const existing = at.event.backups ?? [];
    if (existing.length >= backupLimit)
      throw new Error(
        'This account already has the maximum number of wallets.',
      );
    const opener = await this.opener(at, input.opener);
    await input.beforeBackup?.();
    at.current();
    const selected = await input.backup.identity(true);
    const wallet = {
      ecosystem: selected.ecosystem,
      address: canonicalAddress(selected.ecosystem, selected.address),
    };
    if (recoveryWalletFor(at.event, wallet))
      throw new Error('This wallet already opens your history.');
    await input.register(wallet);
    at.current();
    const config = createWalletRecoveryFor(
      at.session.accountId,
      wallet,
      applicationOrigin(),
    );
    const signatures = await signRecovery({
      wallet: input.backup,
      config,
      count: 2,
      current: at.current,
    });
    try {
      const sealed = await sealBackup({
        event: at.event,
        opener,
        backup: {
          wallet: config,
          secret: await walletRecoveryKey(config, signatures),
        },
      });
      const fresh = await walletRecoveryKey(config, [signatures.at(-1) ?? '']);
      await this.publish(
        at,
        { signing: sealed.signing, backups: [...existing, sealed.backup] },
        // Prove the capsule about to be published opens with a new derivation.
        (event) => recoverSecrets(event, fresh, config),
      );
    } finally {
      signatures.fill('');
    }
  }
  /** Stops `wallet` opening recovery. Returns false when it never did. */
  async remove(input: {
    opener: WalletConnection;
    wallet: Wallet;
  }): Promise<boolean> {
    const at = await this.snapshot();
    const existing = at.event.backups ?? [];
    const remaining = existing.filter(
      (backup) => !sameWallet(backup.wallet, input.wallet),
    );
    if (remaining.length === existing.length) return false;
    if (sameWallet(confirmingWallet(at.session), input.wallet))
      throw new Error(
        'Sign in with another wallet of this account to remove this one.',
      );
    const opener = await this.opener(at, input.opener);
    await this.publish(at, {
      signing: await recoverySigner(at.event, opener.secret, opener.wallet),
      backups: remaining,
    });
    return true;
  }
  /** Two wallets, each signing its current statement once, in pair order. */
  private async pairOpener(
    at: Snapshot,
    sign: RecoverySigner,
    wallets: readonly [Wallet, Wallet],
  ) {
    const pair = (at.event.pairs ?? []).find((entry) =>
      wallets.every((wallet) =>
        entry.wallets.some((member) => sameWallet(member, wallet)),
      ),
    );
    if (!pair) throw new Error('These wallets do not open recovery together.');
    const signatures: string[] = [];
    try {
      for (const wallet of pair.wallets)
        signatures.push(...(await sign(wallet, 1, at.current)));
      return {
        pair: pair.wallets,
        secret: await walletPairKey({
          wallets: pair.wallets,
          signatures: [signatures[0] ?? '', signatures[1] ?? ''],
          salt: pair.salt,
        }),
      };
    } finally {
      signatures.fill('');
    }
  }
  /** Publishes a root replacement if the directory did not move meanwhile. */
  private replace(
    at: Snapshot,
    change: {
      signing: CryptoKey;
      root: RecoveryRoot;
      backups: RecoveryBackup[];
      pairs: RecoveryPair[];
    },
    verify: (event: DirectoryEvent) => Promise<unknown>,
  ): Promise<void> {
    return this.authority.run(async (session) => {
      at.current();
      const latest = await this.authority.current(session);
      if (canonical(latest) !== canonical(at.event))
        throw new Error(
          'Authorization changed during signing. Cancel and check again.',
        );
      const rotation = await this.authority.rotate(session, {
        previous: latest,
        ...change,
      });
      await verify(rotation.event);
      at.current();
      await this.authority.publishRotation(
        session,
        rotation.event,
        rotation.profile,
      );
    });
  }
  /**
   * Moves an account with a main and a backup wallet to three wallets that
   * open recovery only in pairs. The session's wallet opens the current
   * authority. `register` adds the third wallet to the account, which the
   * server requires. Each wallet then signs a fresh statement, the new wallet
   * twice, and a new authority sealed for the three pairs replaces the old.
   */
  async enterPairs(input: {
    sign: RecoverySigner;
    third: Wallet;
    register: () => Promise<void>;
  }): Promise<void> {
    const at = await this.snapshot();
    const { main, backup, own } = pairStart(at, input.third);
    const opening = await input.sign(own, 1, at.current);
    const opened = await openRecovery(at.event, {
      secret: await walletRecoveryKey(own, opening),
      wallet: own,
    }).finally(() => opening.fill(''));
    await input.register();
    at.current();
    const fresh = (wallet: Wallet) =>
      createWalletRecoveryFor(
        at.session.accountId,
        wallet,
        applicationOrigin(),
      );
    const members = [fresh(main), fresh(backup), fresh(input.third)];
    const signatures = new Map<WalletRecovery, string>();
    try {
      for (const [index, config] of members.entries())
        signatures.set(
          config,
          (await input.sign(config, index === 2 ? 2 : 1, at.current)).at(-1) ??
            '',
        );
      const pairs = await sealedPairs(members, signatures);
      const replaced = await replaceRecovery(at.session.accountId, {
        main: members[0]!,
        pairs,
      });
      await this.replace(
        at,
        {
          signing: opened.signing,
          root: replaced.root,
          backups: [],
          pairs: replaced.pairs,
        },
        // Every pair must open the authority about to be published.
        async (event) => {
          for (const pair of pairs)
            await openRecovery(event, {
              secret: pair.secret,
              pair: pair.wallets,
            });
        },
      );
    } finally {
      signatures.clear();
    }
  }
  /**
   * Returns a three-wallet account to a main wallet and one backup, dropping
   * `remove`. The two remaining wallets open the authority together, sign a
   * fresh statement each, and a new authority replaces the old.
   */
  async leavePairs(input: {
    sign: RecoverySigner;
    remove: Wallet;
  }): Promise<void> {
    const at = await this.snapshot();
    const main = at.event.root.wallet;
    const all = [
      ...new Map(
        (at.event.pairs ?? [])
          .flatMap((pair) => pair.wallets)
          .map((wallet) => [`${wallet.ecosystem}:${wallet.address}`, wallet]),
      ).values(),
    ];
    const kept = all.filter((wallet) => !sameWallet(wallet, input.remove));
    const backup = kept.find((wallet) => main && !sameWallet(wallet, main));
    if (!main || !backup || kept.length !== 2 || sameWallet(main, input.remove))
      throw new Error('The main wallet cannot be removed.');
    const opener = await this.pairOpener(at, input.sign, [main, backup]);
    const opened = await openRecovery(at.event, opener);
    const fresh = (wallet: Wallet) =>
      createWalletRecoveryFor(
        at.session.accountId,
        wallet,
        applicationOrigin(),
      );
    const next = { main: fresh(main), backup: fresh(backup) };
    const secrets = {
      main: await this.freshKey(next.main, input.sign, at),
      backup: await this.freshKey(next.backup, input.sign, at),
    };
    const replaced = await replaceRecovery(at.session.accountId, {
      main: { wallet: next.main, secret: secrets.main },
      backups: [{ wallet: next.backup, secret: secrets.backup }],
    });
    await this.replace(
      at,
      {
        signing: opened.signing,
        root: replaced.root,
        backups: replaced.backups,
        pairs: [],
      },
      async (event) => {
        await recoverSecrets(event, secrets.main);
        await recoverSecrets(event, secrets.backup, next.backup);
      },
    );
  }
  private async freshKey(
    config: WalletRecovery,
    sign: RecoverySigner,
    at: Snapshot,
  ): Promise<CryptoKey> {
    const signatures = await sign(config, 1, at.current);
    try {
      return await walletRecoveryKey(config, signatures);
    } finally {
      signatures.fill('');
    }
  }
  /** Opens a three-wallet account on this device with the session's wallet
   * and `second`, another wallet of the account. */
  async recoverWithPair(input: {
    sign: RecoverySigner;
    second: Wallet;
  }): Promise<void> {
    const session = await this.authority.run((active) =>
      Promise.resolve(active),
    );
    const valid = this.authority.lease(session);
    const end = Date.now() + signingWindow;
    const at: Snapshot = {
      session,
      event: await this.authority.run((active) =>
        this.authority.directory(active),
      ),
      current: () => {
        valid('Request interrupted or expired. Start again.');
        if (Date.now() > end)
          throw new Error('Request interrupted or expired. Start again.');
      },
    };
    const opener = await this.pairOpener(at, input.sign, [
      confirmingWallet(session),
      input.second,
    ]);
    await this.authority.run(async (active) => {
      at.current();
      const latest = await this.authority.directory(active);
      if (canonical(latest) !== canonical(at.event))
        throw new Error(
          'Authorization changed during signing. Cancel and check again.',
        );
      await this.authority.recoverDevice(
        active,
        await openRecovery(latest, opener),
      );
    });
  }
}

/** The three pairs of three wallets, each in canonical order with its own
 * salt and the key both wallets derive. */
async function sealedPairs(
  members: WalletRecovery[],
  signatures: Map<WalletRecovery, string>,
) {
  const order = (wallet: WalletRecovery) =>
    `${wallet.ecosystem}:${wallet.address}`;
  const sorted = [...members].sort((a, b) => (order(a) < order(b) ? -1 : 1));
  const pairs = [];
  for (const [first, second] of [
    [sorted[0]!, sorted[1]!],
    [sorted[0]!, sorted[2]!],
    [sorted[1]!, sorted[2]!],
  ] as const) {
    const salt = encode(crypto.getRandomValues(new Uint8Array(32)));
    pairs.push({
      wallets: [first, second] as const,
      salt,
      secret: await walletPairKey({
        wallets: [first, second],
        signatures: [signatures.get(first) ?? '', signatures.get(second) ?? ''],
        salt,
      }),
    });
  }
  return pairs;
}

/** The wallets an account must already have before a third joins them. */
function pairStart(at: Snapshot, third: Wallet) {
  const main = at.event.root.wallet;
  const backup = at.event.backups?.[0]?.wallet;
  if (!main || !backup || at.event.pairs)
    throw new Error('Finish setting up your backup wallet first.');
  if (recoveryWalletFor(at.event, third))
    throw new Error('This wallet already opens your history.');
  const own = recoveryWalletFor(at.event, confirmingWallet(at.session));
  if (!own) throw new Error('This wallet does not open recovery.');
  return { main, backup, own };
}
