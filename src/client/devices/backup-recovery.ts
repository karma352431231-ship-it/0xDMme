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
} from '../../shared/devices/index.ts';
import type { WalletRecovery } from '../../shared/wallet-recovery/index.ts';
import { applicationOrigin } from '../application-origin/index.ts';
import {
  recoverSecrets,
  recoverySigner,
  sealBackup,
} from '../device-keys/index.ts';
import {
  createWalletRecoveryFor,
  signRecovery,
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
}
