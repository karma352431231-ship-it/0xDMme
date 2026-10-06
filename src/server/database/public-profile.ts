import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AccountError, encode } from '../../shared/account/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import { assertContentCapacity } from './vault-quota.ts';

interface ProfileRow {
  id: string;
  handle: string;
  revision: number;
  pendingAvatar: Buffer | null;
  pendingType: string | null;
}
const publicColumns = 'id,handle';
const ownColumns = `${publicColumns},revision,pending_avatar AS "pendingAvatar",pending_avatar_type AS "pendingType"`;
function visible(row: Pick<ProfileRow, 'id' | 'handle'>): PublicProfile {
  return { id: row.id, handle: row.handle, avatar: null };
}
function own(row: ProfileRow | undefined) {
  return row
    ? {
        profile: visible(row),
        revision: row.revision,
        pendingAvatar: row.pendingAvatar
          ? { type: row.pendingType, bytes: encode(row.pendingAvatar) }
          : null,
      }
    : null;
}
function sameAvatar(
  row: ProfileRow,
  avatar: PendingPublicAvatar | null,
): boolean {
  if (row.pendingType !== (avatar?.type ?? null)) return false;
  if (row.pendingAvatar === null) return avatar === null;
  return avatar !== null && row.pendingAvatar.equals(avatar.bytes);
}
export class PublicProfileStore {
  private readonly pool: pg.Pool;
  private readonly authority: ContactStore;
  private readonly capacity: number;
  constructor(pool: pg.Pool, authority: ContactStore, capacity: number) {
    this.pool = pool;
    this.authority = authority;
    this.capacity = capacity;
  }
  async read(handle: string): Promise<PublicProfile | null> {
    const result = await this.pool.query<ProfileRow>(
      `SELECT ${publicColumns} FROM hash_talk.public_profiles WHERE handle=$1`,
      [handle],
    );
    return result.rows[0] ? visible(result.rows[0]) : null;
  }
  /** Public identity contract for coordinated social admissions; no private fields. */
  async identity(
    client: pg.PoolClient,
    account: string,
  ): Promise<PublicProfile> {
    const profile = await this.identityOrNull(client, account);
    if (!profile)
      throw new AccountError(
        403,
        'Crie seu perfil público em Perfil antes de participar.',
      );
    return profile;
  }
  /** Authenticated public readers need not create a social identity. */
  async identityOrNull(
    client: pg.PoolClient,
    account: string,
  ): Promise<PublicProfile | null> {
    const result = await client.query<ProfileRow>(
      `SELECT ${publicColumns} FROM hash_talk.public_profiles WHERE account_id=$1`,
      [account],
    );
    return result.rows[0] ? visible(result.rows[0]) : null;
  }
  async identities(
    client: Pick<pg.PoolClient, 'query'>,
    ids: string[],
  ): Promise<Map<string, PublicProfile>> {
    const result = await client.query<ProfileRow>(
      `SELECT ${publicColumns} FROM hash_talk.public_profiles WHERE id=ANY($1::uuid[])`,
      [ids],
    );
    return new Map(result.rows.map((row) => [row.id, visible(row)]));
  }
  async state(authority: ContactAuthority) {
    return this.authority.withMessageAuthority(authority, async (client) => {
      const result = await client.query<ProfileRow>(
        `SELECT ${ownColumns} FROM hash_talk.public_profiles WHERE account_id=$1`,
        [authority.session.accountId],
      );
      return own(result.rows[0]);
    });
  }
  async create(authority: ContactAuthority, handle: string) {
    return this.authority.withMessageAuthority(authority, async (client) => {
      const account = authority.session.accountId;
      const previous = await client.query<ProfileRow>(
        `SELECT ${ownColumns} FROM hash_talk.public_profiles WHERE account_id=$1`,
        [account],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].handle !== handle)
          throw new AccountError(409, 'Seu @ já foi criado e é fixo.');
        return own(previous.rows[0]);
      }
      const result = await client.query<ProfileRow>(
        `INSERT INTO hash_talk.public_profiles(id,account_id,handle) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING ${ownColumns}`,
        [randomUUID(), account, handle],
      );
      if (!result.rows[0])
        throw new AccountError(409, 'Este @ já está em uso. Escolha outro.');
      await assertContentCapacity(client, this.capacity);
      return own(result.rows[0]);
    });
  }
  async avatar(
    authority: ContactAuthority,
    revision: number,
    avatar: PendingPublicAvatar | null,
  ) {
    const bytes = avatar ? Buffer.from(avatar.bytes) : null;
    const type = avatar?.type ?? null;
    return this.authority.withMessageAuthority(authority, async (client) => {
      const account = authority.session.accountId;
      const current = await client.query<ProfileRow>(
        `SELECT ${ownColumns} FROM hash_talk.public_profiles WHERE account_id=$1 FOR UPDATE`,
        [account],
      );
      const old = current.rows[0];
      if (!old)
        throw new AccountError(404, 'Crie seu perfil público primeiro.');
      if (sameAvatar(old, avatar)) return own(old);
      if (old.revision !== revision)
        throw new AccountError(
          409,
          'Perfil alterado em outro aparelho. Recarregue antes de editar.',
        );
      const result = await client.query<ProfileRow>(
        `UPDATE hash_talk.public_profiles SET pending_avatar=$2,pending_avatar_type=$3,revision=revision+1 WHERE account_id=$1 RETURNING ${ownColumns}`,
        [account, bytes, type],
      );
      if (bytes && bytes.length > (old.pendingAvatar?.length ?? 0))
        await assertContentCapacity(client, this.capacity);
      return own(result.rows[0]);
    });
  }
}
