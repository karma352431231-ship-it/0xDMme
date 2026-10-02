import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { operationBytes, pageSize } from '../../shared/vault/index.ts';
import type { VaultCommit } from '../../shared/vault/index.ts';
import {
  assertVaultQuota,
  vaultUsage,
  assertContentCapacity,
} from './vault-quota.ts';
interface Operation {
  hash: string;
  object_hash: string;
  state: string;
  commit: unknown;
  writer: string | null;
}
interface Head {
  sequence: number;
  head: string | null;
}
export class VaultStore {
  private readonly pool: pg.Pool;
  private readonly contentCapacity: number;
  constructor(pool: pg.Pool, contentCapacity: number) {
    this.pool = pool;
    this.contentCapacity = contentCapacity;
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
  private async lock(
    client: pg.PoolClient,
    session: AccountSession,
    directory: string,
  ): Promise<void> {
    await client.query(
      'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
      [session.accountId],
    );
    const authorized = await client.query(
      `SELECT s.account_id FROM hash_talk.login_sessions s
      JOIN hash_talk.device_directories d ON d.account_id=s.account_id
      WHERE s.account_id=$1 AND s.device_id=$2 AND s.csrf=$3 AND s.expires_at>now() AND d.head=$4
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.event->'devices') device WHERE device->>'id'=$2::text)`,
      [session.accountId, session.deviceId, session.csrf, directory],
    );
    if (!authorized.rowCount)
      throw new AccountError(
        403,
        'Sessão ou autorização de cofre alterada. Atualize aparelhos.',
      );
  }
  private async operation(
    client: Pick<pg.PoolClient, 'query'>,
    accountId: string,
    id: string,
  ): Promise<Operation | undefined> {
    return (
      await client.query<Operation>(
        'SELECT hash,object_hash,state,commit,writer FROM hash_talk.vault_operations WHERE account_id=$1 AND id=$2',
        [accountId, id],
      )
    ).rows[0];
  }
  private async assertHead(
    client: pg.PoolClient,
    commit: VaultCommit,
  ): Promise<void> {
    const result = await client.query<Head>(
      'SELECT sequence,head FROM hash_talk.vault_heads WHERE account_id=$1',
      [commit.accountId],
    );
    const head = result.rows[0] ?? { sequence: 0, head: null };
    if (commit.sequence !== head.sequence + 1 || commit.previous !== head.head)
      throw new AccountError(
        409,
        'Cofre mudou em outro aparelho. Sincronize mantendo o rascunho.',
      );
  }
  async reserve(
    session: AccountSession,
    commit: VaultCommit,
    hash: string,
  ): Promise<{ status: string }> {
    return this.transaction(async (client) => {
      await this.lock(client, session, commit.directory);
      const existing = await this.operation(
        client,
        session.accountId,
        commit.id,
      );
      if (existing) {
        if (existing.hash !== hash)
          throw new AccountError(
            409,
            'Identificador já usado por outra operação.',
          );
        return { status: existing.state };
      }
      await this.assertHead(client, commit);
      await client.query(
        'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE',
      );
      const global = await client.query<{ total: number }>(
        "SELECT count(*)::integer AS total FROM hash_talk.vault_operations WHERE state<>'accepted'",
      );
      if ((global.rows[0]?.total ?? 256) >= 256)
        throw new AccountError(
          503,
          'Uploads temporários ocupados. Retome depois.',
        );
      const count = await client.query<{ total: number }>(
        "SELECT count(*)::integer AS total FROM hash_talk.vault_operations WHERE account_id=$1 AND state<>'accepted'",
        [session.accountId],
      );
      if ((count.rows[0]?.total ?? 4) >= 4)
        throw new AccountError(
          429,
          'Há quatro uploads incompletos. Retome ou descarte antes de criar outro.',
        );
      await client.query(
        "INSERT INTO hash_talk.vault_operations(account_id,id,hash,object_hash,commit,charge,state) VALUES($1,$2,$3,$4,$5,$6,'reserved')",
        [
          session.accountId,
          commit.id,
          hash,
          commit.block.hash,
          commit,
          operationBytes(commit),
        ],
      );
      await assertVaultQuota(client, session.accountId);
      await assertContentCapacity(client, this.contentCapacity);
      return { status: 'reserved' };
    });
  }
  async beginUpload(
    session: AccountSession,
    commit: VaultCommit,
    hash: string,
  ): Promise<string | null> {
    return this.transaction(async (client) => {
      await this.lock(client, session, commit.directory);
      const operation = await this.operation(
        client,
        session.accountId,
        commit.id,
      );
      if (!operation || operation.hash !== hash)
        throw new AccountError(409, 'Reserve esta operação antes do upload.');
      if (operation.state === 'accepted') return null;
      if (operation.state !== 'reserved')
        throw new AccountError(
          409,
          'Upload em andamento ou descarte pendente.',
        );
      await this.assertHead(client, commit);
      const writer = crypto.randomUUID();
      await client.query(
        "UPDATE hash_talk.vault_operations SET state='writing',writer=$3 WHERE account_id=$1 AND id=$2",
        [session.accountId, commit.id, writer],
      );
      return writer;
    });
  }
  async finishUpload(input: {
    session: AccountSession;
    commit: VaultCommit;
    hash: string;
    writer: string;
  }): Promise<void> {
    const { session, commit, hash, writer } = input;
    await this.transaction(async (client) => {
      await this.lock(client, session, commit.directory);
      await this.assertHead(client, commit);
      const saved = await client.query(
        "UPDATE hash_talk.vault_operations SET state='accepted',sequence=$4,writer=NULL WHERE account_id=$1 AND id=$2 AND state='writing' AND writer=$3 AND hash=$5 RETURNING id",
        [session.accountId, commit.id, writer, commit.sequence, hash],
      );
      if (!saved.rowCount)
        throw new AccountError(409, 'Upload não confirmado.');
      await client.query(
        'INSERT INTO hash_talk.vault_heads(account_id,sequence,head) VALUES($1,$2,$3) ON CONFLICT(account_id) DO UPDATE SET sequence=excluded.sequence,head=excluded.head',
        [session.accountId, commit.sequence, hash],
      );
    });
  }
  async releaseUpload(
    accountId: string,
    id: string,
    writer: string,
  ): Promise<void> {
    await this.pool.query(
      "UPDATE hash_talk.vault_operations SET state='reserved',writer=NULL WHERE account_id=$1 AND id=$2 AND writer=$3 AND state='writing'",
      [accountId, id, writer],
    );
  }
  /** Only at service startup after the previous single writer has stopped. */
  async resumeInterrupted(): Promise<void> {
    for (let batch = 0; batch < 8; batch++) {
      const rows = await this.pool.query(
        "UPDATE hash_talk.vault_operations SET state='reserved',writer=NULL WHERE (account_id,id) IN (SELECT account_id,id FROM hash_talk.vault_operations WHERE state IN ('writing','discarding') LIMIT 32)",
      );
      if (!rows.rowCount) return;
    }
  }
  async preflight(accountId: string, id: string): Promise<void> {
    const operation = await this.operation(this.pool, accountId, id);
    if (!operation || !['reserved', 'accepted'].includes(operation.state))
      throw new AccountError(409, 'Upload exige reserva desta conta.');
  }
  async expiredReservations(): Promise<{ account_id: string; id: string }[]> {
    return (
      await this.pool.query<{ account_id: string; id: string }>(
        "SELECT account_id,id FROM hash_talk.vault_operations WHERE state='reserved' AND reserved_at<now()-interval '24 hours' ORDER BY reserved_at LIMIT 8",
      )
    ).rows;
  }
  async claimExpired(accountId: string, id: string) {
    return this.transaction(async (client) => {
      await client.query(
        'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
        [accountId],
      );
      const writer = crypto.randomUUID();
      const result = await client.query<{ object_hash: string }>(
        "UPDATE hash_talk.vault_operations SET state='discarding',writer=$3 WHERE account_id=$1 AND id=$2 AND state='reserved' AND reserved_at<now()-interval '24 hours' RETURNING object_hash",
        [accountId, id, writer],
      );
      const row = result.rows[0];
      return row ? { hash: row.object_hash, writer } : null;
    });
  }
  async page(session: AccountSession, directory: string, after: number) {
    return this.transaction(async (client) => {
      await this.lock(client, session, directory);
      const rows = await client.query<{ commit: unknown }>(
        'SELECT commit FROM hash_talk.vault_operations WHERE account_id=$1 AND sequence>$2 ORDER BY sequence LIMIT $3',
        [session.accountId, after, pageSize],
      );
      const head = (
        await client.query<Head>(
          'SELECT sequence,head FROM hash_talk.vault_heads WHERE account_id=$1',
          [session.accountId],
        )
      ).rows[0] ?? { sequence: 0, head: null };
      if (after > head.sequence)
        throw new AccountError(
          409,
          'Cofre remoto anterior ao checkpoint local.',
        );
      const pending = await client.query<{ commit: unknown }>(
        "SELECT commit FROM hash_talk.vault_operations WHERE account_id=$1 AND state<>'accepted' ORDER BY id LIMIT 4",
        [session.accountId],
      );
      return {
        ...head,
        commits: rows.rows.map((r) => r.commit),
        pending: pending.rows.map((r) => r.commit),
        used: await vaultUsage(client, session.accountId),
      };
    });
  }
  async object(
    session: AccountSession,
    directory: string,
    id: string,
  ): Promise<VaultCommit> {
    return this.transaction(async (client) => {
      await this.lock(client, session, directory);
      const operation = await this.operation(client, session.accountId, id);
      if (operation?.state !== 'accepted')
        throw new AccountError(404, 'Bloco não confirmado nesta conta.');
      return operation.commit as VaultCommit;
    });
  }
  async beginDiscard(
    session: AccountSession,
    directory: string,
    id: string,
  ): Promise<{ hash: string; writer: string }> {
    return this.transaction(async (client) => {
      await this.lock(client, session, directory);
      const operation = await this.operation(client, session.accountId, id);
      if (!operation || operation.state !== 'reserved')
        throw new AccountError(
          409,
          'Versão confirmada ou upload em andamento não pode ser descartado.',
        );
      const writer = crypto.randomUUID();
      await client.query(
        "UPDATE hash_talk.vault_operations SET state='discarding',writer=$3 WHERE account_id=$1 AND id=$2",
        [session.accountId, id, writer],
      );
      return { hash: operation.object_hash, writer };
    });
  }
  async finishDiscard(
    accountId: string,
    id: string,
    writer: string,
  ): Promise<void> {
    await this.pool.query(
      "DELETE FROM hash_talk.vault_operations WHERE account_id=$1 AND id=$2 AND state='discarding' AND writer=$3",
      [accountId, id, writer],
    );
  }
  async releaseDiscard(
    accountId: string,
    id: string,
    writer: string,
  ): Promise<void> {
    await this.pool.query(
      "UPDATE hash_talk.vault_operations SET state='reserved',writer=NULL WHERE account_id=$1 AND id=$2 AND state='discarding' AND writer=$3",
      [accountId, id, writer],
    );
  }
}
