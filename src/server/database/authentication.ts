import { signedInDeviceLimit } from '../../shared/account-activity/index.ts';
import { extraWalletAccount, lockWalletIdentity } from './account-wallets.ts';
import type { ContentCapacity } from './content-capacity.ts';
import type { Ecosystem } from '../../shared/wallet-identity/index.ts';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { assertVaultQuota, assertContentCapacity } from './vault-quota.ts';
import { AccountError, base64, encode } from '../../shared/account/index.ts';
import type {
  AccountSession,
  EncryptedProfile,
} from '../../shared/account/index.ts';
import { withTemporaryAdmission } from '../temporary-admission/index.ts';

export interface LoginChallenge {
  id: string;
  browserHash: string;
  address: string;
  ecosystem: Ecosystem;
  deviceId: string;
  message: string;
  expiresAt: Date;
  handoffHash?: string | null;
}

export interface LoginHandoff {
  browserHash: string;
  ticketHash: string;
  ecosystem: Ecosystem;
  deviceId: string;
  expiresAt: Date;
  address: string | null;
}

interface SessionRow {
  walletConfirmed: boolean;
  accountId: string;
  address: string;
  ecosystem: Ecosystem;
  name: string;
  deviceId: string;
  expiresAt: Date;
  csrf: string;
  profileRevision: number;
  walletEcosystem: Ecosystem | null;
  walletAddress: string | null;
}

async function transaction<T>(
  pool: pg.Pool,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Owns authentication tables; signatures/RPC/HTTP never run in these transactions. */
export class AuthenticationStore {
  private readonly pool: pg.Pool;
  private readonly contentCapacity: ContentCapacity;
  private readonly changes: import('./changes.ts').DatabaseChanges | undefined;
  constructor(
    pool: pg.Pool,
    contentCapacity: ContentCapacity,
    changes?: import('./changes.ts').DatabaseChanges,
  ) {
    this.pool = pool;
    this.contentCapacity = contentCapacity;
    this.changes = changes;
  }

  async createChallenge(challenge: LoginChallenge): Promise<void> {
    await withTemporaryAdmission(
      'Too many sign-in requests. Please wait.',
      () =>
        transaction(this.pool, async (client) => {
          await client.query(`WITH expired AS MATERIALIZED (SELECT id FROM hash_talk.login_challenges
          WHERE expires_at<=now() ORDER BY expires_at LIMIT 64 FOR UPDATE SKIP LOCKED)
        DELETE FROM hash_talk.login_challenges target USING expired WHERE target.id=expired.id`);
          await client.query(
            `INSERT INTO hash_talk.login_challenges
        (id, browser_hash, address, device_id, message, expires_at, ecosystem, handoff_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              challenge.id,
              challenge.browserHash,
              challenge.address,
              challenge.deviceId,
              challenge.message,
              challenge.expiresAt,
              challenge.ecosystem,
              challenge.handoffHash ?? null,
            ],
          );
        }),
    );
  }

  async claimAttempt(id: string, browserHash: string): Promise<LoginChallenge> {
    // Attempts are atomic and bounded, including malformed/invalid signatures.
    const result = await this.pool.query<LoginChallenge>(
      `UPDATE hash_talk.login_challenges
      SET attempts = attempts + 1 WHERE id = $1 AND browser_hash = $2
      AND expires_at > now() AND attempts < 3
      RETURNING id, browser_hash AS "browserHash", address, device_id AS "deviceId",
      message, expires_at AS "expiresAt", ecosystem, handoff_hash AS "handoffHash"`,
      [id, browserHash],
    );
    const challenge = result.rows[0];
    if (!challenge)
      throw new AccountError(401, 'Challenge invalid or expired.');
    return challenge;
  }

  private async account(
    client: pg.PoolClient,
    identity: { address: string; ecosystem: Ecosystem },
    preferredId?: string,
  ): Promise<string> {
    // Serialize only this wallet identity, without committing unused storage.
    await lockWalletIdentity(client, identity);
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM hash_talk.accounts WHERE address=$1 AND ecosystem=$2 FOR UPDATE',
      [identity.address, identity.ecosystem],
    );
    // An extra wallet signs in to the account it was added to.
    const known =
      existing.rows[0]?.id ?? (await extraWalletAccount(client, identity));
    if (known) {
      if (preferredId && known !== preferredId)
        throw new AccountError(
          409,
          'The account changed during sign-in. Start again.',
        );
      return known;
    }
    const created = await client.query<{ id: string }>(
      'INSERT INTO hash_talk.accounts(address,ecosystem,id) VALUES($1,$2,$3) RETURNING id',
      [identity.address, identity.ecosystem, preferredId ?? randomUUID()],
    );
    const id = created.rows[0]?.id;
    if (!id) throw new Error('Account was not persisted.');
    if (typeof this.contentCapacity !== 'number')
      await assertContentCapacity(client, this.contentCapacity);
    return id;
  }

  async previewAccountId(identity: {
    address: string;
    ecosystem: Ecosystem;
  }): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM hash_talk.accounts WHERE address=$1 AND ecosystem=$2
      UNION ALL SELECT account_id FROM hash_talk.account_wallets WHERE address=$1 AND ecosystem=$2`,
      [identity.address, identity.ecosystem],
    );
    // No account or session is created until confirmation in the original browser.
    return result.rows[0]?.id ?? randomUUID();
  }

  async finishLogin(input: {
    challenge: LoginChallenge;
    tokenHash: string;
    csrf: string;
    expiresAt: Date;
    previousTokenHash?: string;
  }): Promise<void> {
    const ended = await transaction(this.pool, async (client) => {
      const consumed = await client.query(
        `DELETE FROM hash_talk.login_challenges
        WHERE id = $1 AND browser_hash = $2 AND expires_at > now() AND handoff_hash IS NULL RETURNING id`,
        [input.challenge.id, input.challenge.browserHash],
      );
      if (consumed.rowCount !== 1)
        throw new AccountError(401, 'Challenge invalid or expired.');
      return this.insertSession(client, {
        ...input,
        identity: input.challenge,
      });
    });
    this.sessionEnded(ended);
  }

  private async insertSession(
    client: pg.PoolClient,
    input: {
      identity: { address: string; ecosystem: Ecosystem; deviceId: string };
      tokenHash: string;
      csrf: string;
      expiresAt: Date;
      previousTokenHash?: string;
      preferredAccountId?: string;
    },
  ): Promise<{ accountId: string; csrf: string } | null> {
    const accountId = await this.account(
      client,
      input.identity,
      input.preferredAccountId,
    );
    const state = await client.query<{ revoked: boolean }>(
      "SELECT event->'revoked' ? $2::text AS revoked FROM hash_talk.device_directories WHERE account_id=$1",
      [accountId, input.identity.deviceId],
    );
    const deviceId = state.rows[0]?.revoked
      ? randomUUID()
      : input.identity.deviceId;
    await this.registerDevice(client, accountId, deviceId);
    const ended = await this.reserveSession(
      client,
      accountId,
      input.previousTokenHash,
    );
    await client.query(
      `INSERT INTO hash_talk.login_sessions
        (token_hash, csrf, account_id, device_id, expires_at, wallet_ecosystem, wallet_address)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.tokenHash,
        input.csrf,
        accountId,
        deviceId,
        input.expiresAt,
        input.identity.ecosystem,
        input.identity.address,
      ],
    );
    return ended;
  }
  async beginLinked(input: {
    source: AccountSession;
    deviceId: string;
    tokenHash: string;
    csrf: string;
    expiresAt: Date;
    previousTokenHash?: string;
  }): Promise<void> {
    const ended = await transaction(this.pool, async (client) => {
      await client.query(
        'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
        [input.source.accountId],
      );
      const source = await client.query(
        'SELECT token_hash FROM hash_talk.login_sessions WHERE account_id=$1 AND device_id=$2 AND csrf=$3 AND expires_at>now() AND wallet_confirmed',
        [input.source.accountId, input.source.deviceId, input.source.csrf],
      );
      if (!source.rowCount)
        throw new AccountError(
          403,
          'Linking lacks current wallet confirmation.',
        );
      await this.registerDevice(client, input.source.accountId, input.deviceId);
      const ended = await this.reserveSession(
        client,
        input.source.accountId,
        input.previousTokenHash,
      );
      await client.query(
        'INSERT INTO hash_talk.login_sessions(token_hash,csrf,account_id,device_id,expires_at,wallet_confirmed) VALUES($1,$2,$3,$4,$5,false)',
        [
          input.tokenHash,
          input.csrf,
          input.source.accountId,
          input.deviceId,
          input.expiresAt,
        ],
      );
      return ended;
    });
    this.sessionEnded(ended);
  }

  async createHandoff(input: Omit<LoginHandoff, 'address'>): Promise<void> {
    await withTemporaryAdmission('Too many return requests. Please wait.', () =>
      transaction(this.pool, async (client) => {
        await client.query(`WITH expired AS MATERIALIZED (SELECT browser_hash FROM hash_talk.login_handoffs
          WHERE expires_at<=now() ORDER BY expires_at LIMIT 64 FOR UPDATE SKIP LOCKED)
        DELETE FROM hash_talk.login_handoffs target USING expired WHERE target.browser_hash=expired.browser_hash`);
        await client.query(
          `INSERT INTO hash_talk.login_handoffs
        (browser_hash,ticket_hash,ecosystem,device_id,expires_at) VALUES ($1,$2,$3,$4,$5)`,
          [
            input.browserHash,
            input.ticketHash,
            input.ecosystem,
            input.deviceId,
            input.expiresAt,
          ],
        );
      }),
    );
  }
  async handoffByTicket(ticketHash: string): Promise<LoginHandoff> {
    const result = await this.pool.query<LoginHandoff>(
      `SELECT browser_hash AS "browserHash", ticket_hash AS "ticketHash",
      ecosystem, device_id AS "deviceId", expires_at AS "expiresAt", address FROM hash_talk.login_handoffs
      WHERE ticket_hash = $1 AND expires_at > now() AND address IS NULL`,
      [ticketHash],
    );
    const row = result.rows[0];
    if (!row) throw new AccountError(401, 'Return request invalid or expired.');
    return row;
  }
  async handoffStatus(browserHash: string): Promise<{
    ecosystem: Ecosystem;
    address: string | null;
    expiresAt: Date;
  } | null> {
    const result = await this.pool.query<{
      ecosystem: Ecosystem;
      address: string | null;
      expiresAt: Date;
    }>(
      `SELECT ecosystem, address, expires_at AS "expiresAt" FROM hash_talk.login_handoffs WHERE browser_hash=$1 AND expires_at > now()`,
      [browserHash],
    );
    return result.rows[0] ?? null;
  }
  async cancelHandoff(browserHash: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM hash_talk.login_handoffs WHERE browser_hash=$1',
      [browserHash],
    );
  }
  async acceptHandoffSignature(
    challenge: LoginChallenge,
    ticketHash: string,
  ): Promise<void> {
    await transaction(this.pool, async (client) => {
      const consumed = await client.query(
        `DELETE FROM hash_talk.login_challenges WHERE id=$1 AND browser_hash=$2
        AND handoff_hash=$3 AND expires_at > now() RETURNING id`,
        [challenge.id, challenge.browserHash, ticketHash],
      );
      if (consumed.rowCount !== 1)
        throw new AccountError(401, 'Invalid return challenge.');
      const accepted = await client.query(
        `UPDATE hash_talk.login_handoffs SET address=$2 WHERE ticket_hash=$1
        AND ecosystem=$3 AND device_id=$4 AND expires_at > now() AND address IS NULL RETURNING browser_hash`,
        [
          ticketHash,
          challenge.address,
          challenge.ecosystem,
          challenge.deviceId,
        ],
      );
      if (accepted.rowCount !== 1)
        throw new AccountError(401, 'Request already used or expired.');
    });
  }
  async finishHandoff(input: {
    browserHash: string;
    address: string;
    ecosystem: Ecosystem;
    tokenHash: string;
    csrf: string;
    expiresAt: Date;
    previousTokenHash?: string;
    preferredAccountId?: string;
  }): Promise<void> {
    const ended = await transaction(this.pool, async (client) => {
      const consumed = await client.query<{ deviceId: string }>(
        `DELETE FROM hash_talk.login_handoffs
        WHERE browser_hash=$1 AND address=$2 AND ecosystem=$3 AND expires_at > now() RETURNING device_id AS "deviceId"`,
        [input.browserHash, input.address, input.ecosystem],
      );
      const row = consumed.rows[0];
      if (!row)
        throw new AccountError(401, 'Return invalid or not yet signed.');
      return this.insertSession(client, {
        ...input,
        identity: {
          address: input.address,
          ecosystem: input.ecosystem,
          deviceId: row.deviceId,
        },
      });
    });
    this.sessionEnded(ended);
  }

  private async registerDevice(
    client: pg.PoolClient,
    accountId: string,
    deviceId: string,
  ): Promise<void> {
    const devices = await client.query<{ known: boolean; total: number }>(
      `SELECT count(*)::integer AS total,
      coalesce(bool_or(device_id = $2), false) AS known FROM hash_talk.login_devices WHERE account_id = $1`,
      [accountId, deviceId],
    );
    const state = devices.rows[0];
    if (!state?.known && (state?.total ?? 32) >= 32)
      throw new AccountError(409, 'Device registration limit reached.');
    await client.query(
      `INSERT INTO hash_talk.login_devices (account_id, device_id)
      VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [accountId, deviceId],
    );
  }

  private async reserveSession(
    client: pg.PoolClient,
    accountId: string,
    previous?: string,
  ): Promise<{ accountId: string; csrf: string } | null> {
    const removed = previous
      ? await client.query<{ accountId: string; csrf: string }>(
          'DELETE FROM hash_talk.login_sessions WHERE token_hash = $1 RETURNING account_id AS "accountId", csrf',
          [previous],
        )
      : null;
    await client.query(`DELETE FROM hash_talk.login_sessions WHERE token_hash IN
      (SELECT token_hash FROM hash_talk.login_sessions WHERE expires_at <= now() ORDER BY expires_at LIMIT 64)`);
    const count = await client.query<{ total: number }>(
      `SELECT count(*)::integer AS total
      FROM hash_talk.login_sessions WHERE account_id = $1`,
      [accountId],
    );
    if ((count.rows[0]?.total ?? 8) >= 8)
      throw new AccountError(409, 'End one session before opening another.');
    return removed?.rows[0] ?? null;
  }

  async session(tokenHash: string): Promise<AccountSession> {
    const result = await this.pool.query<SessionRow>(
      `SELECT a.id AS "accountId", a.address, a.ecosystem,
      a.display_name AS name, s.device_id AS "deviceId", s.expires_at AS "expiresAt", s.csrf,
      a.profile_revision AS "profileRevision", s.wallet_confirmed AS "walletConfirmed",
      s.wallet_ecosystem AS "walletEcosystem", s.wallet_address AS "walletAddress" FROM hash_talk.login_sessions s
      JOIN hash_talk.accounts a ON a.id = s.account_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) throw new AccountError(401, 'Session ended or expired.');
    const { walletEcosystem, walletAddress, ...account } = row;
    return {
      ...account,
      expiresAt: row.expiresAt.toISOString(),
      deviceState: 'pending',
      historyAuthorized: false,
      ...(walletEcosystem && walletAddress
        ? { wallet: { ecosystem: walletEcosystem, address: walletAddress } }
        : {}),
    };
  }

  /** Live sessions of the caller's account, one row per device. */
  async accountSessions(tokenHash: string): Promise<
    {
      deviceId: string;
      expiresAt: Date;
      walletConfirmed: boolean;
      current: boolean;
    }[]
  > {
    const result = await this.pool.query<{
      deviceId: string;
      expiresAt: Date;
      walletConfirmed: boolean;
      current: boolean;
    }>(
      `SELECT o.device_id AS "deviceId", max(o.expires_at) AS "expiresAt",
      bool_or(o.wallet_confirmed) AS "walletConfirmed",
      bool_or(o.token_hash = s.token_hash) AS current
      FROM hash_talk.login_sessions s
      JOIN hash_talk.login_sessions o ON o.account_id = s.account_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND o.expires_at > now()
      GROUP BY o.device_id ORDER BY max(o.expires_at) DESC LIMIT $2`,
      [tokenHash, signedInDeviceLimit],
    );
    if (!result.rows.length)
      throw new AccountError(401, 'Session ended or expired.');
    return result.rows;
  }

  /** Extends a live session only when its deadline is earlier than
   * `dueBefore`, so repeated restores do not write. Ended sessions stay ended. */
  async renewSession(input: {
    tokenHash: string;
    expiresAt: Date;
    dueBefore: Date;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE hash_talk.login_sessions SET expires_at = $2
      WHERE token_hash = $1 AND expires_at > now() AND expires_at < $3`,
      [input.tokenHash, input.expiresAt, input.dueBefore],
    );
    return result.rowCount === 1;
  }

  private sessionEnded(
    ended: { accountId: string; csrf: string } | null,
  ): void {
    if (ended)
      this.changes?.committed([ended.accountId], {
        authorization: true,
        ended: [ended.csrf],
      });
  }
  async logout(tokenHash: string): Promise<void> {
    const removed = await this.pool.query<{ accountId: string; csrf: string }>(
      'DELETE FROM hash_talk.login_sessions WHERE token_hash = $1 RETURNING account_id AS "accountId", csrf',
      [tokenHash],
    );
    this.sessionEnded(removed.rows[0] ?? null);
  }

  async rename(tokenHash: string, name: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE hash_talk.accounts SET display_name = $2
      WHERE id = (SELECT s.account_id FROM hash_talk.login_sessions s WHERE s.token_hash = $1 AND s.expires_at > now()
        AND (s.wallet_confirmed OR EXISTS (SELECT 1 FROM hash_talk.device_directories d,
          jsonb_array_elements(d.event->'devices') device WHERE d.account_id=s.account_id AND device->>'id'=s.device_id::text)))
      RETURNING id`,
      [tokenHash, name],
    );
    if (result.rowCount !== 1)
      throw new AccountError(401, 'Session ended or expired.');
  }

  async readProfile(tokenHash: string): Promise<EncryptedProfile | null> {
    const result = await this.pool.query<{
      revision: number;
      iv: Buffer | null;
      ciphertext: Buffer | null;
    }>(
      `SELECT a.profile_revision AS revision,
      a.profile_iv AS iv, a.profile_ciphertext AS ciphertext FROM hash_talk.accounts a
      JOIN hash_talk.login_sessions s ON s.account_id = a.id WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) throw new AccountError(401, 'Session ended or expired.');
    if (!row.iv || !row.ciphertext) return null;
    return {
      version: 1,
      revision: row.revision,
      iv: encode(row.iv),
      ciphertext: encode(row.ciphertext),
    };
  }

  async writeProfile(
    tokenHash: string,
    profile: EncryptedProfile,
  ): Promise<void> {
    const iv = Buffer.from(base64(profile.iv, 12));
    const ciphertext = Buffer.from(base64(profile.ciphertext, 3_065_536));
    await transaction(this.pool, async (client) => {
      // Match device mutations' account lock, then use a fresh SQL snapshot.
      // A NOT EXISTS in a waiting UPDATE alone could miss new initialization.
      await client.query(
        `SELECT a.id FROM hash_talk.accounts a
        JOIN hash_talk.login_sessions s ON s.account_id=a.id
        WHERE s.token_hash=$1 AND s.expires_at>now() FOR UPDATE OF a`,
        [tokenHash],
      );
      const result = await client.query<{ id: string }>(
        `UPDATE hash_talk.accounts SET profile_revision = $2,
        profile_iv = $3, profile_ciphertext = $4 WHERE id =
        (SELECT account_id FROM hash_talk.login_sessions WHERE token_hash = $1 AND expires_at > now())
        AND profile_revision = $2 - 1
        AND NOT EXISTS (SELECT 1 FROM hash_talk.device_directories d WHERE d.account_id = hash_talk.accounts.id) RETURNING id`,
        [tokenHash, profile.revision, iv, ciphertext],
      );
      if (result.rowCount !== 1)
        throw new AccountError(
          409,
          'Profile changed in another session or session expired. Reload.',
        );
      const accountId = result.rows[0]?.id;
      if (accountId) await assertVaultQuota(client, accountId);
      await assertContentCapacity(client, this.contentCapacity);
    });
  }
}
