import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { maximumWallets } from '../../shared/account-wallets/index.ts';
import type {
  AccountWallet,
  WalletIdentity,
} from '../../shared/account-wallets/index.ts';

type Session = Pick<AccountSession, 'accountId' | 'deviceId' | 'csrf'>;

/** Serializes everything that decides which account a wallet signs in to:
 * account creation at sign-in and adding the wallet to an existing account. */
export async function lockWalletIdentity(
  client: pg.PoolClient,
  identity: WalletIdentity,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    '0xdmme:account:' + identity.ecosystem + ':' + identity.address,
  ]);
}
/** The account an extra wallet signs in to, if it was added to one. */
export async function extraWalletAccount(
  client: Pick<pg.PoolClient, 'query'>,
  identity: WalletIdentity,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    'SELECT account_id AS id FROM hash_talk.account_wallets WHERE ecosystem=$1 AND address=$2',
    [identity.ecosystem, identity.address],
  );
  return result.rows[0]?.id ?? null;
}

/** How many wallets the account this wallet signs in to has, and which
 * account that is. A wallet unknown to the service has none. */
export async function signInAccount(
  client: Pick<pg.PoolClient, 'query'>,
  identity: WalletIdentity,
): Promise<{ accountId: string; wallets: number } | null> {
  const result = await client.query<{ id: string; wallets: number }>(
    `SELECT a.id, 1 + (SELECT count(*)::integer FROM hash_talk.account_wallets w
      WHERE w.account_id = a.id) AS wallets
    FROM hash_talk.accounts a
    WHERE (a.ecosystem=$1 AND a.address=$2) OR a.id =
      (SELECT account_id FROM hash_talk.account_wallets WHERE ecosystem=$1 AND address=$2)`,
    [identity.ecosystem, identity.address],
  );
  const row = result.rows[0];
  return row ? { accountId: row.id, wallets: row.wallets } : null;
}
/** A wallet may open recovery only while it is an extra wallet of the account. */
export async function assertRegisteredWallets(
  client: Pick<pg.PoolClient, 'query'>,
  accountId: string,
  wallets: WalletIdentity[],
): Promise<void> {
  const registered = await client.query<WalletIdentity>(
    'SELECT ecosystem, address FROM hash_talk.account_wallets WHERE account_id=$1',
    [accountId],
  );
  for (const wallet of wallets)
    if (
      !registered.rows.some(
        (row) =>
          row.ecosystem === wallet.ecosystem && row.address === wallet.address,
      )
    )
      throw new AccountError(
        409,
        'Add this wallet to the account before giving it recovery.',
      );
}

/** Owns the extra-wallet table and the rule that an address signs in to one
 * account only, across this table and each account's primary wallet. */
export class AccountWalletStore {
  private readonly pool: pg.Pool;
  constructor(pool: pg.Pool) {
    this.pool = pool;
  }
  private async transaction<T>(
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  /** Locks the account and requires this live session to be wallet-confirmed. */
  private async confirmed(client: pg.PoolClient, session: Session) {
    await client.query(
      'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
      [session.accountId],
    );
    const valid = await client.query<{ confirmed: boolean }>(
      'SELECT wallet_confirmed AS confirmed FROM hash_talk.login_sessions WHERE account_id=$1 AND device_id=$2 AND csrf=$3 AND expires_at>now()',
      [session.accountId, session.deviceId, session.csrf],
    );
    if (!valid.rows[0])
      throw new AccountError(401, 'Session ended or expired.');
    if (!valid.rows[0].confirmed)
      throw new AccountError(
        403,
        'Confirm your wallet in this session to perform this action.',
      );
  }
  /** The account's wallets, primary first, then in the order they were added. */
  async list(session: Session): Promise<AccountWallet[]> {
    const result = await this.pool.query<AccountWallet>(
      `WITH live AS (SELECT account_id FROM hash_talk.login_sessions
        WHERE account_id=$1 AND device_id=$2 AND csrf=$3 AND expires_at>now() LIMIT 1)
      SELECT ecosystem, address, "primary" FROM (
        SELECT a.ecosystem, a.address, true AS "primary", NULL::timestamptz AS added
        FROM hash_talk.accounts a JOIN live ON live.account_id=a.id
        UNION ALL
        SELECT w.ecosystem, w.address, false, w.added_at
        FROM hash_talk.account_wallets w JOIN live ON live.account_id=w.account_id
      ) wallets ORDER BY "primary" DESC, added LIMIT $4`,
      [session.accountId, session.deviceId, session.csrf, maximumWallets],
    );
    if (!result.rows.length)
      throw new AccountError(401, 'Session ended or expired.');
    return result.rows;
  }
  private async assertUnused(
    client: pg.PoolClient,
    accountId: string,
    wallet: WalletIdentity,
  ): Promise<void> {
    const primary = await client.query<{ id: string }>(
      'SELECT id FROM hash_talk.accounts WHERE ecosystem=$1 AND address=$2',
      [wallet.ecosystem, wallet.address],
    );
    const owner =
      primary.rows[0]?.id ?? (await extraWalletAccount(client, wallet));
    if (owner === accountId)
      throw new AccountError(409, 'This wallet is already on this account.');
    if (owner)
      throw new AccountError(409, 'This wallet already has its own account.');
  }
  /** Adds a wallet whose possession the caller has already verified. */
  async add(session: Session, wallet: WalletIdentity): Promise<void> {
    await this.transaction(async (client) => {
      await lockWalletIdentity(client, wallet);
      await this.confirmed(client, session);
      await this.assertUnused(client, session.accountId, wallet);
      const extras = await client.query<{ total: number }>(
        'SELECT count(*)::integer AS total FROM hash_talk.account_wallets WHERE account_id=$1',
        [session.accountId],
      );
      if ((extras.rows[0]?.total ?? maximumWallets) >= maximumWallets - 1)
        throw new AccountError(
          409,
          'This account already has the maximum number of wallets.',
        );
      await client.query(
        'INSERT INTO hash_talk.account_wallets(account_id,ecosystem,address) VALUES($1,$2,$3)',
        [session.accountId, wallet.ecosystem, wallet.address],
      );
    });
  }
  /** Removes an extra wallet. Its address is then free to open another account. */
  async remove(session: Session, wallet: WalletIdentity): Promise<void> {
    await this.transaction(async (client) => {
      await lockWalletIdentity(client, wallet);
      await this.confirmed(client, session);
      // The directory may name a recovery wallet only while it is registered.
      const recovery = await client.query(
        `SELECT 1 FROM hash_talk.device_directories d,
        jsonb_array_elements(
          coalesce(jsonb_path_query_array(d.event, '$.backups[*].wallet'), '[]'::jsonb) ||
          coalesce(jsonb_path_query_array(d.event, '$.pairs[*].wallets[*]'), '[]'::jsonb)
        ) wallet
        WHERE d.account_id=$1 AND wallet->>'ecosystem'=$2 AND wallet->>'address'=$3 LIMIT 1`,
        [session.accountId, wallet.ecosystem, wallet.address],
      );
      if (recovery.rowCount)
        throw new AccountError(
          409,
          'Remove this wallet from recovery before removing it from the account.',
        );
      const removed = await client.query(
        'DELETE FROM hash_talk.account_wallets WHERE account_id=$1 AND ecosystem=$2 AND address=$3',
        [session.accountId, wallet.ecosystem, wallet.address],
      );
      if (!removed.rowCount)
        throw new AccountError(
          404,
          'This wallet is not an extra wallet of this account.',
        );
    });
  }
}
