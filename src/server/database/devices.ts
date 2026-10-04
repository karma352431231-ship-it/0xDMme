import type pg from 'pg';
import { assertVaultQuota, assertContentCapacity } from './vault-quota.ts';
import { AccountError, base64 } from '../../shared/account/index.ts';
import type {
  AccountSession,
  EncryptedProfile,
} from '../../shared/account/index.ts';
import type {
  DeviceIdentity,
  DirectoryEvent,
} from '../../shared/devices/index.ts';

export interface DirectoryRow {
  head: string;
  revision: number;
  event: unknown;
}
export interface DeviceLink {
  id: string;
  codeHash: string;
  device: DeviceIdentity;
  expiresAt: Date;
}
export class DeviceStore {
  private readonly pool: pg.Pool;
  private readonly contentCapacity: number;
  private readonly changes: import('./changes.ts').DatabaseChanges | undefined;
  constructor(
    pool: pg.Pool,
    contentCapacity: number,
    changes?: import('./changes.ts').DatabaseChanges,
  ) {
    this.pool = pool;
    this.contentCapacity = contentCapacity;
    this.changes = changes;
  }
  async current(accountId: string): Promise<DirectoryRow | null> {
    const result = await this.pool.query<DirectoryRow>(
      'SELECT head, revision, event FROM hash_talk.device_directories WHERE account_id=$1',
      [accountId],
    );
    return result.rows[0] ?? null;
  }
  async page(accountId: string, after: number): Promise<unknown[]> {
    const result = await this.pool.query<{ event: unknown }>(
      'SELECT event FROM hash_talk.device_events WHERE account_id=$1 AND revision>$2 ORDER BY revision LIMIT 8',
      [accountId, after],
    );
    return result.rows.map((row) => row.event);
  }
  async link(accountId: string, id: string): Promise<DeviceLink> {
    const result = await this.pool.query<DeviceLink>(
      'SELECT id, code_hash AS "codeHash", device, expires_at AS "expiresAt" FROM hash_talk.device_links WHERE account_id=$1 AND id=$2 AND expires_at>now() AND NOT cancelled',
      [accountId, id],
    );
    const row = result.rows[0];
    if (!row)
      throw new AccountError(
        409,
        'Código expirado, cancelado ou já utilizado.',
      );
    return row;
  }
  private async transaction<T>(
    operation: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
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
  private async lock(
    client: pg.PoolClient,
    session: AccountSession,
  ): Promise<void> {
    await client.query(
      'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
      [session.accountId],
    );
    const valid = await client.query(
      'SELECT token_hash FROM hash_talk.login_sessions WHERE account_id=$1 AND device_id=$2 AND csrf=$3 AND expires_at>now()',
      [session.accountId, session.deviceId, session.csrf],
    );
    if (!valid.rowCount)
      throw new AccountError(401, 'Sessão encerrada ou expirada.');
  }
  async createLink(session: AccountSession, link: DeviceLink): Promise<void> {
    await this.transaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('hash-talk:device-link-admission'))",
      );
      await this.lock(client, session);
      const reused = await client.query(
        'SELECT id FROM hash_talk.device_links WHERE id=$1',
        [link.id],
      );
      if (reused.rowCount)
        throw new AccountError(
          409,
          'Código já utilizado. Crie um novo pedido.',
        );
      await client.query(
        `DELETE FROM hash_talk.device_links WHERE id IN (SELECT id FROM hash_talk.device_links WHERE expires_at<=now() ORDER BY expires_at LIMIT 64)`,
      );
      const count = await client.query<{ total: number }>(
        'SELECT count(*)::integer AS total FROM hash_talk.device_links',
      );
      if ((count.rows[0]?.total ?? 256) >= 256)
        throw new AccountError(429, 'Muitos pedidos de vinculação. Aguarde.');
      const existing = await client.query(
        'SELECT account_id FROM hash_talk.device_directories WHERE account_id=$1',
        [session.accountId],
      );
      if (!existing.rowCount)
        throw new AccountError(
          409,
          'Configure primeiro a recuperação em um aparelho autorizado.',
        );
      await client.query(
        'UPDATE hash_talk.device_links SET cancelled=true WHERE account_id=$1 AND device_id=$2 AND NOT cancelled',
        [session.accountId, session.deviceId],
      );
      await client.query(
        'INSERT INTO hash_talk.device_links (id,account_id,device_id,code_hash,device,expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          link.id,
          session.accountId,
          session.deviceId,
          link.codeHash,
          link.device,
          link.expiresAt,
        ],
      );
    });
  }
  async cancelLink(session: AccountSession, id: string): Promise<void> {
    await this.pool.query(
      'UPDATE hash_talk.device_links SET cancelled=true WHERE id=$1 AND account_id=$2 AND device_id=$3 AND NOT cancelled',
      [id, session.accountId, session.deviceId],
    );
  }
  private async updateProfile(
    client: pg.PoolClient,
    accountId: string,
    profile: EncryptedProfile | null,
  ): Promise<void> {
    if (!profile) {
      const current = await client.query<{ revision: number }>(
        'SELECT profile_revision AS revision FROM hash_talk.accounts WHERE id=$1',
        [accountId],
      );
      if (current.rows[0]?.revision !== 0)
        throw new AccountError(
          409,
          'O perfil existente precisa ser preservado e cifrado com a nova chave.',
        );
      return;
    }
    const saved = await client.query(
      `UPDATE hash_talk.accounts SET profile_revision=$2, profile_iv=$3, profile_ciphertext=$4 WHERE id=$1 AND profile_revision=$2-1 RETURNING id`,
      [
        accountId,
        profile.revision,
        Buffer.from(base64(profile.iv, 12)),
        Buffer.from(base64(profile.ciphertext, 3_065_536)),
      ],
    );
    if (!saved.rowCount)
      throw new AccountError(
        409,
        'Perfil alterado em outra aba. Atualize antes de continuar.',
      );
  }
  async commit(input: {
    session: AccountSession;
    event: DirectoryEvent;
    head: string;
    profile: EncryptedProfile | null;
  }): Promise<void> {
    const { session, event, head, profile } = input;
    await this.transaction(async (client) => {
      await this.lock(client, session);
      const current = await client.query<DirectoryRow>(
        'SELECT head,revision,event FROM hash_talk.device_directories WHERE account_id=$1',
        [session.accountId],
      );
      if ((current.rows[0]?.head ?? null) !== event.previous)
        throw new AccountError(
          409,
          'Diretório alterado em outro aparelho. Atualize e confirme novamente.',
        );
      if (event.linkId)
        await this.consumeLink(client, session.accountId, event);
      if (event.kind !== 'link')
        await this.updateProfile(client, session.accountId, profile);
      await client.query(
        'INSERT INTO hash_talk.device_events (account_id,revision,event) VALUES ($1,$2,$3)',
        [session.accountId, event.revision, event],
      );
      await client.query(
        `INSERT INTO hash_talk.device_directories (account_id,revision,head,event) VALUES ($1,$2,$3,$4) ON CONFLICT (account_id) DO UPDATE SET revision=excluded.revision,head=excluded.head,event=excluded.event`,
        [session.accountId, event.revision, head, event],
      );
      if (event.revoked.length) {
        await client.query(
          'DELETE FROM hash_talk.login_sessions WHERE account_id=$1 AND device_id=ANY($2::uuid[])',
          [session.accountId, event.revoked],
        );
        await client.query(
          'DELETE FROM hash_talk.device_links WHERE account_id=$1 AND device_id=ANY($2::uuid[])',
          [session.accountId, event.revoked],
        );
      }
      await assertVaultQuota(client, session.accountId);
      if (profile) await assertContentCapacity(client, this.contentCapacity);
    });
    this.changes?.committed([session.accountId], {
      authorization: true,
      revoked: event.revoked,
    });
  }
  private async consumeLink(
    client: pg.PoolClient,
    accountId: string,
    event: DirectoryEvent,
  ): Promise<void> {
    const consumed = await client.query<{ device: DeviceIdentity }>(
      'UPDATE hash_talk.device_links SET cancelled=true WHERE id=$1 AND account_id=$2 AND expires_at>now() AND NOT cancelled RETURNING device',
      [event.linkId, accountId],
    );
    const target = consumed.rows[0]?.device;
    if (
      !target ||
      !event.devices.some(
        (device) =>
          device.id === target.id &&
          device.signing === target.signing &&
          device.wrapping === target.wrapping &&
          device.name === target.name,
      )
    )
      throw new AccountError(
        409,
        'Código expirado, reutilizado ou aparelho divergente.',
      );
  }
  async saveProfile(
    session: AccountSession,
    head: string,
    profile: EncryptedProfile,
  ): Promise<void> {
    await this.transaction(async (client) => {
      await this.lock(client, session);
      const current = await client.query<{ head: string }>(
        'SELECT head FROM hash_talk.device_directories WHERE account_id=$1',
        [session.accountId],
      );
      if (current.rows[0]?.head !== head)
        throw new AccountError(
          409,
          'Dispositivos alterados. Atualize antes de salvar.',
        );
      await this.updateProfile(client, session.accountId, profile);
      await assertVaultQuota(client, session.accountId);
      await assertContentCapacity(client, this.contentCapacity);
    });
  }
}
