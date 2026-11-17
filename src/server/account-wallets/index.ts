import { randomUUID } from 'node:crypto';
import {
  AccountError,
  keys,
  object,
  requireWalletSession,
  uuid,
} from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  sameWallet,
  walletAdditionStatement,
  walletIdentity,
  walletRequestSeconds,
} from '../../shared/account-wallets/index.ts';
import type {
  AccountWallet,
  WalletAdditionRequest,
  WalletIdentity,
} from '../../shared/account-wallets/index.ts';
import { verifyWalletStatement } from '../../shared/representatives/index.ts';
import type { AccountWalletStore } from '../database/index.ts';

const pendingLimit = 128;
interface Pending {
  accountId: string;
  csrf: string;
  wallet: WalletIdentity;
  message: string;
  expiresAt: number;
}

/**
 * Adds and removes the extra wallets that sign in to an account. A wallet is
 * added only after it signs a statement naming this account, requested from a
 * wallet-confirmed session. Pending requests are short-lived, single-use and
 * held in memory: a restart only makes the user ask again.
 */
export class AccountWalletService {
  private readonly store: AccountWalletStore;
  private readonly origin: string;
  private readonly pending = new Map<string, Pending>();
  constructor(options: { store: AccountWalletStore; origin: string }) {
    this.store = options.store;
    this.origin = options.origin;
  }
  async operate(
    operation: string,
    session: AccountSession,
    input: unknown,
  ): Promise<unknown> {
    if (operation === 'list') return { wallets: await this.list(session) };
    if (operation === 'request') return this.request(session, input);
    if (operation === 'add') return { wallets: await this.add(session, input) };
    if (operation === 'remove')
      return { wallets: await this.remove(session, input) };
    throw new AccountError(404, 'Route not found.');
  }
  list(session: AccountSession): Promise<AccountWallet[]> {
    return this.store.list(session);
  }
  /** Issues the statement the new wallet must sign. One open request per
   * session: asking again replaces the earlier one. */
  request(session: AccountSession, input: unknown): WalletAdditionRequest {
    requireWalletSession(session);
    const wallet = walletIdentity(input);
    const account = { ecosystem: session.ecosystem, address: session.address };
    if (sameWallet(wallet, account))
      throw new AccountError(409, 'This wallet is already on this account.');
    const now = Date.now();
    for (const [id, entry] of this.pending)
      if (entry.expiresAt <= now || entry.csrf === session.csrf)
        this.pending.delete(id);
    if (this.pending.size >= pendingLimit)
      throw new AccountError(429, 'Too many wallet requests. Please wait.');
    const id = randomUUID();
    const expiresAt = new Date(now + walletRequestSeconds * 1000);
    const message = walletAdditionStatement({
      origin: this.origin,
      account,
      wallet,
      id,
      expiresAt: expiresAt.toISOString(),
    });
    this.pending.set(id, {
      accountId: session.accountId,
      csrf: session.csrf,
      wallet,
      message,
      expiresAt: expiresAt.getTime(),
    });
    return { id, expiresAt: expiresAt.toISOString(), message };
  }
  async add(session: AccountSession, input: unknown): Promise<AccountWallet[]> {
    const data = object(input);
    keys(data, ['id', 'signature']);
    const id = uuid(data['id']);
    const request = this.pending.get(id);
    // Single use, whatever the outcome.
    this.pending.delete(id);
    if (
      !request ||
      request.accountId !== session.accountId ||
      request.csrf !== session.csrf ||
      request.expiresAt <= Date.now()
    )
      throw new AccountError(401, 'Wallet request invalid or expired.');
    if (typeof data['signature'] !== 'string' || data['signature'].length > 132)
      throw new AccountError(400, 'Invalid wallet signature.');
    verifyWalletStatement(request.wallet, request.message, data['signature']);
    await this.store.add(session, request.wallet);
    return this.store.list(session);
  }
  async remove(
    session: AccountSession,
    input: unknown,
  ): Promise<AccountWallet[]> {
    requireWalletSession(session);
    await this.store.remove(session, walletIdentity(input));
    return this.store.list(session);
  }
}
