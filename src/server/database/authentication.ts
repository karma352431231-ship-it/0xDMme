import type { Ecosystem } from '../../shared/wallet-identity/index.ts';
import type pg from 'pg';
import {
  AccountError,
  accountReservation,
  base64,
  encode,
} from '../../shared/account/index.ts';
import type {
  AccountSession,
  EncryptedProfile,
} from '../../shared/account/index.ts';

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
  accountId: string;
  address: string;
  ecosystem: Ecosystem;
  name: string;
  deviceId: string;
  expiresAt: Date;
  csrf: string;
  profileRevision: number;
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
  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  async createChallenge(challenge: LoginChallenge): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('hash-talk:login-admission'))",
      );
      await client.query(`DELETE FROM hash_talk.login_challenges WHERE id IN
        (SELECT id FROM hash_talk.login_challenges WHERE expires_at <= now()
         ORDER BY expires_at LIMIT 64)`);
      const count = await client.query<{ total: number }>(
        'SELECT count(*)::integer AS total FROM hash_talk.login_challenges',
      );
      if ((count.rows[0]?.total ?? 1024) >= 1024)
        throw new AccountError(429, 'Muitos pedidos de login. Aguarde.');
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
    });
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
      throw new AccountError(401, 'Desafio inválido ou expirado.');
    return challenge;
  }

  private async account(
    client: pg.PoolClient,
    identity: { address: string; ecosystem: Ecosystem },
    capacity: number,
  ): Promise<string> {
    await client.query(
      'SELECT singleton FROM hash_talk.account_capacity WHERE singleton = true FOR UPDATE',
    );
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM hash_talk.accounts WHERE address = $1 AND ecosystem = $2',
      [identity.address, identity.ecosystem],
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const reserved = await client.query(
      `UPDATE hash_talk.account_capacity
      SET reserved_bytes = reserved_bytes + $1 WHERE singleton = true
      AND reserved_bytes + $1 <= $2 RETURNING singleton`,
      [accountReservation, capacity],
    );
    if (reserved.rowCount !== 1)
      throw new AccountError(
        503,
        'Capacidade de armazenamento indisponível para nova conta.',
      );
    const created = await client.query<{ id: string }>(
      'INSERT INTO hash_talk.accounts (address, ecosystem) VALUES ($1,$2) RETURNING id',
      [identity.address, identity.ecosystem],
    );
    const id = created.rows[0]?.id;
    if (!id) throw new Error('Conta não persistida.');
    return id;
  }

  async finishLogin(input: {
    challenge: LoginChallenge;
    tokenHash: string;
    csrf: string;
    expiresAt: Date;
    capacity: number;
    previousTokenHash?: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const consumed = await client.query(
        `DELETE FROM hash_talk.login_challenges
        WHERE id = $1 AND browser_hash = $2 AND expires_at > now() AND handoff_hash IS NULL RETURNING id`,
        [input.challenge.id, input.challenge.browserHash],
      );
      if (consumed.rowCount !== 1)
        throw new AccountError(401, 'Desafio inválido ou expirado.');
      await this.insertSession(client, { ...input, identity: input.challenge });
    });
  }

  private async insertSession(
    client: pg.PoolClient,
    input: {
      identity: { address: string; ecosystem: Ecosystem; deviceId: string };
      tokenHash: string;
      csrf: string;
      expiresAt: Date;
      capacity: number;
      previousTokenHash?: string;
    },
  ): Promise<void> {
    const accountId = await this.account(
      client,
      input.identity,
      input.capacity,
    );
    await this.registerDevice(client, accountId, input.identity.deviceId);
    await this.reserveSession(client, accountId, input.previousTokenHash);
    await client.query(
      `INSERT INTO hash_talk.login_sessions
        (token_hash, csrf, account_id, device_id, expires_at) VALUES ($1,$2,$3,$4,$5)`,
      [
        input.tokenHash,
        input.csrf,
        accountId,
        input.identity.deviceId,
        input.expiresAt,
      ],
    );
  }

  async createHandoff(input: Omit<LoginHandoff, 'address'>): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('hash-talk:handoff-admission'))",
      );
      await client.query(`DELETE FROM hash_talk.login_handoffs WHERE browser_hash IN
        (SELECT browser_hash FROM hash_talk.login_handoffs WHERE expires_at <= now() ORDER BY expires_at LIMIT 64)`);
      const count = await client.query<{ total: number }>(
        'SELECT count(*)::integer AS total FROM hash_talk.login_handoffs',
      );
      if ((count.rows[0]?.total ?? 256) >= 256)
        throw new AccountError(429, 'Muitos pedidos de retorno. Aguarde.');
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
    });
  }
  async handoffByTicket(ticketHash: string): Promise<LoginHandoff> {
    const result = await this.pool.query<LoginHandoff>(
      `SELECT browser_hash AS "browserHash", ticket_hash AS "ticketHash",
      ecosystem, device_id AS "deviceId", expires_at AS "expiresAt", address FROM hash_talk.login_handoffs
      WHERE ticket_hash = $1 AND expires_at > now() AND address IS NULL`,
      [ticketHash],
    );
    const row = result.rows[0];
    if (!row)
      throw new AccountError(401, 'Pedido de retorno inválido ou expirado.');
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
        throw new AccountError(401, 'Desafio de retorno inválido.');
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
        throw new AccountError(401, 'Pedido já usado ou expirado.');
    });
  }
  async finishHandoff(input: {
    browserHash: string;
    address: string;
    ecosystem: Ecosystem;
    tokenHash: string;
    csrf: string;
    expiresAt: Date;
    capacity: number;
    previousTokenHash?: string;
  }): Promise<void> {
    await transaction(this.pool, async (client) => {
      const consumed = await client.query<{ deviceId: string }>(
        `DELETE FROM hash_talk.login_handoffs
        WHERE browser_hash=$1 AND address=$2 AND ecosystem=$3 AND expires_at > now() RETURNING device_id AS "deviceId"`,
        [input.browserHash, input.address, input.ecosystem],
      );
      const row = consumed.rows[0];
      if (!row)
        throw new AccountError(401, 'Retorno inválido ou ainda não assinado.');
      await this.insertSession(client, {
        ...input,
        identity: {
          address: input.address,
          ecosystem: input.ecosystem,
          deviceId: row.deviceId,
        },
      });
    });
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
      throw new AccountError(
        409,
        'Limite de cadastros de dispositivos atingido.',
      );
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
  ): Promise<void> {
    if (previous)
      await client.query(
        'DELETE FROM hash_talk.login_sessions WHERE token_hash = $1',
        [previous],
      );
    await client.query(`DELETE FROM hash_talk.login_sessions WHERE token_hash IN
      (SELECT token_hash FROM hash_talk.login_sessions WHERE expires_at <= now() ORDER BY expires_at LIMIT 64)`);
    const count = await client.query<{ total: number }>(
      `SELECT count(*)::integer AS total
      FROM hash_talk.login_sessions WHERE account_id = $1`,
      [accountId],
    );
    if ((count.rows[0]?.total ?? 8) >= 8)
      throw new AccountError(409, 'Encerre uma sessão antes de abrir outra.');
  }

  async session(tokenHash: string): Promise<AccountSession> {
    const result = await this.pool.query<SessionRow>(
      `SELECT a.id AS "accountId", a.address, a.ecosystem,
      a.display_name AS name, s.device_id AS "deviceId", s.expires_at AS "expiresAt", s.csrf,
      a.profile_revision AS "profileRevision" FROM hash_talk.login_sessions s
      JOIN hash_talk.accounts a ON a.id = s.account_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) throw new AccountError(401, 'Sessão encerrada ou expirada.');
    return {
      ...row,
      expiresAt: row.expiresAt.toISOString(),
      deviceState: 'pending',
      historyAuthorized: false,
    };
  }

  async logout(tokenHash: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM hash_talk.login_sessions WHERE token_hash = $1',
      [tokenHash],
    );
  }

  async rename(tokenHash: string, name: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE hash_talk.accounts SET display_name = $2
      WHERE id = (SELECT account_id FROM hash_talk.login_sessions WHERE token_hash = $1 AND expires_at > now())
      RETURNING id`,
      [tokenHash, name],
    );
    if (result.rowCount !== 1)
      throw new AccountError(401, 'Sessão encerrada ou expirada.');
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
    if (!row) throw new AccountError(401, 'Sessão encerrada ou expirada.');
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
    const result = await this.pool.query(
      `UPDATE hash_talk.accounts SET profile_revision = $2,
      profile_iv = $3, profile_ciphertext = $4 WHERE id =
      (SELECT account_id FROM hash_talk.login_sessions WHERE token_hash = $1 AND expires_at > now())
      AND profile_revision = $2 - 1 RETURNING id`,
      [
        tokenHash,
        profile.revision,
        Buffer.from(base64(profile.iv, 12)),
        Buffer.from(base64(profile.ciphertext, 3_065_536)),
      ],
    );
    if (result.rowCount !== 1)
      throw new AccountError(
        409,
        'Perfil alterado em outra sessão ou sessão expirada. Recarregue.',
      );
  }
}
