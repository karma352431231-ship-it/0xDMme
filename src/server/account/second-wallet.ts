import { createHash, randomBytes } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';
import { sameWallet } from '../../shared/account-wallets/index.ts';
import type { WalletIdentity } from '../../shared/account-wallets/index.ts';

const pendingLimit = 128;
export const secondWalletSeconds = 300;

/** The first of two wallets signed in. The caller presents `ticket` with the
 * second wallet's signature; nothing is signed in until then. */
export class SecondWalletRequired extends AccountError {
  readonly ticket: string;
  readonly expiresAt: string;
  constructor(ticket: string, expiresAt: Date) {
    super(401, 'This account needs a second wallet to sign in.');
    this.ticket = ticket;
    this.expiresAt = expiresAt.toISOString();
  }
}
interface FirstSignature {
  accountId: string;
  deviceId: string;
  wallet: WalletIdentity;
  expiresAt: number;
}
function hash(ticket: string): string {
  return createHash('sha256').update(ticket).digest('hex');
}

/**
 * Remembers that one wallet of an account already signed, until a different
 * wallet of the same account signs for the same device. Tickets are random,
 * single-use, short-lived and held in memory: a restart only makes the user
 * start the sign-in again.
 */
export class SecondWalletGate {
  private readonly pending = new Map<string, FirstSignature>();
  /** Records the first signature and tells the caller to bring a second. */
  require(first: Omit<FirstSignature, 'expiresAt'>): SecondWalletRequired {
    const now = Date.now();
    for (const [key, entry] of this.pending)
      if (entry.expiresAt <= now) this.pending.delete(key);
    if (this.pending.size >= pendingLimit)
      throw new AccountError(429, 'Too many sign-in attempts. Please wait.');
    const ticket = randomBytes(32).toString('hex');
    const expiresAt = now + secondWalletSeconds * 1000;
    this.pending.set(hash(ticket), { ...first, expiresAt });
    return new SecondWalletRequired(ticket, new Date(expiresAt));
  }
  /** Consumes the ticket when `second` completes the same sign-in with
   * another wallet. A wrong or expired ticket ends that attempt. */
  complete(ticket: unknown, second: Omit<FirstSignature, 'expiresAt'>): void {
    if (typeof ticket !== 'string' || !/^[a-f0-9]{64}$/u.test(ticket))
      throw new AccountError(400, 'Invalid sign-in request.');
    const key = hash(ticket);
    const first = this.pending.get(key);
    this.pending.delete(key);
    if (
      !first ||
      first.expiresAt <= Date.now() ||
      first.accountId !== second.accountId ||
      first.deviceId !== second.deviceId
    )
      throw new AccountError(
        401,
        'The first wallet signature expired. Start signing in again.',
      );
    if (sameWallet(first.wallet, second.wallet))
      throw new AccountError(
        409,
        'Sign with a different wallet of this account.',
      );
  }
}
