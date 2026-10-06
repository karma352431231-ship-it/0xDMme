import type pg from 'pg';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import {
  AccountError,
  encode,
  keys,
  uuid,
} from '../../shared/account/index.ts';
import {
  communityBoolean,
  communityCursor,
  communityMeta,
  communityPageSize,
  communityRevision,
} from '../../shared/communities/index.ts';
import type {
  Community,
  CommunityPage,
  CommunityState,
} from '../../shared/communities/index.ts';
import { pendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { PublicProfileStore } from './public-profile.ts';
import { assertContentCapacity } from './vault-quota.ts';
import {
  activeSanction,
  communityRole,
  currentCommunity,
  requireCommunityManager,
  requireCommunityParticipation,
} from './community-authority.ts';
import type {
  CommunityContext,
  CommunityRecord,
} from './community-authority.ts';
import { communityGovernance } from './community-governance.ts';
import { communityModeration, sanctionView } from './community-moderation.ts';
import { seedCommunityTags } from './community-post-tags.ts';

const columns =
  'c.id,c.owner,c.name,c.description,c.rules,c.revision,c.archived,(SELECT count(*)::text FROM hash_talk.community_follows f WHERE f.community_id=c.id) AS followers';
const privateColumns = columns + ',c.transfer_id,c.transfer_to';
type CommunityStateWire = Omit<CommunityState, 'pendingPhoto'> & {
  pendingPhoto: { type: string | null; bytes: string } | null;
};
function samePhoto(
  old: { type: string | null; bytes: Buffer | null },
  photo: PendingPublicAvatar | null,
): boolean {
  if (old.type !== (photo?.type ?? null)) return false;
  if (old.bytes === null) return photo === null;
  return photo !== null && old.bytes.equals(photo.bytes);
}
function pageRows<T extends { id: string }>(
  rows: T[],
): { items: T[]; next: string | null } {
  const items = rows.slice(0, communityPageSize);
  return {
    items,
    next: rows.length > communityPageSize ? (items.at(-1)?.id ?? null) : null,
  };
}
export class CommunityStore {
  private readonly pool: pg.Pool;
  private readonly authority: ContactStore;
  private readonly profiles: PublicProfileStore;
  private readonly capacity: number;
  constructor(options: {
    pool: pg.Pool;
    authority: ContactStore;
    profiles: PublicProfileStore;
    capacity: number;
  }) {
    this.pool = options.pool;
    this.authority = options.authority;
    this.profiles = options.profiles;
    this.capacity = options.capacity;
  }
  private async visible(
    client: Pick<pg.PoolClient, 'query'>,
    rows: CommunityRecord[],
  ): Promise<Community[]> {
    const owners = await this.profiles.identities(
      client,
      rows.flatMap((row) => (row.owner ? [row.owner] : [])),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      rules: row.rules,
      revision: row.revision,
      archived: row.archived,
      avatar: null,
      owner: row.owner ? (owners.get(row.owner) ?? null) : null,
      followers: Number(row.followers),
    }));
  }
  async read(id: string): Promise<Community> {
    const found = await this.pool.query<CommunityRecord>(
      `SELECT ${columns} FROM hash_talk.communities c WHERE c.id=$1`,
      [id],
    );
    if (!found.rows[0]) throw new AccountError(404, 'Comunidade indisponível.');
    const result = await this.visible(this.pool, found.rows);
    return result[0]!;
  }
  async list(after: string | null): Promise<CommunityPage> {
    const found = await this.pool.query<CommunityRecord>(
      `SELECT ${columns} FROM hash_talk.communities c WHERE ($1::uuid IS NULL OR c.id>$1) ORDER BY c.id LIMIT $2`,
      [after, communityPageSize + 1],
    );
    const page = pageRows(found.rows);
    return { ...page, items: await this.visible(this.pool, page.items) };
  }
  private async load(
    client: pg.PoolClient,
    id: string,
  ): Promise<CommunityRecord> {
    const result = await client.query<CommunityRecord>(
      `SELECT ${privateColumns} FROM hash_talk.communities c WHERE c.id=$1 FOR UPDATE OF c`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new AccountError(404, 'Comunidade indisponível.');
    return row;
  }
  private async state(context: CommunityContext): Promise<CommunityStateWire> {
    const row = await this.load(context.client, context.row.id);
    const next = { ...context, row };
    const role = await communityRole(next);
    const following = await context.client.query(
      'SELECT 1 FROM hash_talk.community_follows WHERE community_id=$1 AND profile_id=$2',
      [row.id, context.actor.id],
    );
    const sanction = await activeSanction(next);
    const photo =
      role === 'participant'
        ? null
        : (
            await context.client.query<{
              bytes: Buffer | null;
              type: string | null;
            }>(
              'SELECT pending_photo AS bytes,pending_photo_type AS type FROM hash_talk.communities WHERE id=$1',
              [row.id],
            )
          ).rows[0];
    const transfer = await this.transfer(next, role);
    return {
      community: (await this.visible(context.client, [row]))[0]!,
      role,
      following: Boolean(following.rowCount),
      canPost: !row.archived && !sanction,
      pendingPhoto: photo?.bytes
        ? { type: photo.type, bytes: encode(photo.bytes) }
        : null,
      sanction: await sanctionView(next, sanction),
      transfer,
    };
  }
  private async transfer(
    context: CommunityContext,
    role: string,
  ): Promise<CommunityState['transfer']> {
    const row = context.row;
    if (
      !row.transfer_id ||
      !row.transfer_to ||
      (role !== 'owner' && row.transfer_to !== context.actor.id)
    )
      return null;
    const target = (
      await this.profiles.identities(context.client, [row.transfer_to])
    ).get(row.transfer_to);
    return target ? { id: row.transfer_id, target } : null;
  }
  private async ownList(
    context: { client: pg.PoolClient; actor: string },
    data: Record<string, unknown>,
  ): Promise<CommunityPage> {
    keys(data, ['kind', 'after']);
    const kind = data['kind'];
    if (kind !== 'following' && kind !== 'managed' && kind !== 'invitations')
      throw new AccountError(400, 'Lista inválida.');
    const after = communityCursor(data['after']);
    const filter = {
      following:
        'EXISTS(SELECT 1 FROM hash_talk.community_follows f WHERE f.community_id=c.id AND f.profile_id=$1)',
      managed:
        '(c.owner=$1 OR EXISTS(SELECT 1 FROM hash_talk.community_moderators m WHERE m.community_id=c.id AND m.profile_id=$1))',
      invitations: 'c.transfer_to=$1',
    }[kind];
    const found = await context.client.query<CommunityRecord>(
      `SELECT ${columns} FROM hash_talk.communities c WHERE ${filter} AND ($2::uuid IS NULL OR c.id>$2) ORDER BY c.id LIMIT $3`,
      [context.actor, after, communityPageSize + 1],
    );
    const page = pageRows(found.rows);
    return { ...page, items: await this.visible(context.client, page.items) };
  }
  private async create(
    client: pg.PoolClient,
    actor: CommunityContext['actor'],
    data: Record<string, unknown>,
  ): Promise<CommunityRecord> {
    keys(data, ['id', 'meta']);
    const id = uuid(data['id']),
      meta = communityMeta(data['meta']);
    const previous = await client.query<CommunityRecord>(
      `SELECT ${privateColumns} FROM hash_talk.communities c WHERE c.id=$1`,
      [id],
    );
    if (previous.rows[0]) {
      const row = previous.rows[0];
      if (
        row.owner !== actor.id ||
        row.name !== meta.name ||
        row.description !== meta.description ||
        row.rules !== meta.rules
      )
        throw new AccountError(409, 'Identificador de criação já utilizado.');
      return row;
    }
    await client.query(
      'INSERT INTO hash_talk.communities(id,owner,name,description,rules) VALUES($1,$2,$3,$4,$5)',
      [id, actor.id, meta.name, meta.description, meta.rules],
    );
    await seedCommunityTags(client, id);
    await assertContentCapacity(client, this.capacity);
    return this.load(client, id);
  }
  private async edit(
    context: CommunityContext,
    data: Record<string, unknown>,
  ): Promise<void> {
    keys(data, ['id', 'revision', 'meta']);
    await requireCommunityManager(context);
    currentCommunity(context, communityRevision(data['revision']));
    const meta = communityMeta(data['meta']);
    const row = context.row;
    if (
      meta.name === row.name &&
      meta.description === row.description &&
      meta.rules === row.rules
    )
      return;
    await context.client.query(
      'UPDATE hash_talk.communities SET name=$2,description=$3,rules=$4,revision=revision+1 WHERE id=$1',
      [row.id, meta.name, meta.description, meta.rules],
    );
    await assertContentCapacity(context.client, this.capacity);
  }
  private async photo(
    context: CommunityContext,
    data: Record<string, unknown>,
  ): Promise<void> {
    keys(data, ['id', 'revision', 'photo']);
    await requireCommunityManager(context);
    const photo = pendingPublicAvatar(data['photo']);
    const result = await context.client.query<{
      bytes: Buffer | null;
      type: string | null;
    }>(
      'SELECT pending_photo AS bytes,pending_photo_type AS type FROM hash_talk.communities WHERE id=$1',
      [context.row.id],
    );
    const old = result.rows[0]!;
    if (samePhoto(old, photo)) return;
    currentCommunity(context, communityRevision(data['revision']));
    await context.client.query(
      'UPDATE hash_talk.communities SET pending_photo=$2,pending_photo_type=$3,revision=revision+1 WHERE id=$1',
      [
        context.row.id,
        photo ? Buffer.from(photo.bytes) : null,
        photo?.type ?? null,
      ],
    );
    if (photo && photo.bytes.length > (old.bytes?.length ?? 0))
      await assertContentCapacity(context.client, this.capacity);
  }
  private async follow(
    context: CommunityContext,
    data: Record<string, unknown>,
  ): Promise<void> {
    keys(data, ['id', 'following']);
    const following = communityBoolean(data['following']);
    if (!following) {
      await context.client.query(
        'DELETE FROM hash_talk.community_follows WHERE community_id=$1 AND profile_id=$2',
        [context.row.id, context.actor.id],
      );
      return;
    }
    await requireCommunityParticipation(context);
    const inserted = await context.client.query(
      'INSERT INTO hash_talk.community_follows(community_id,profile_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [context.row.id, context.actor.id],
    );
    if (inserted.rowCount)
      await assertContentCapacity(context.client, this.capacity);
  }
  async operate(
    operation: string,
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    return this.authority.withMessageAuthority(authority, async (client) => {
      const actor = await this.profiles.identity(
        client,
        authority.session.accountId,
      );
      if (operation === 'list')
        return this.ownList({ client, actor: actor.id }, data);
      const row =
        operation === 'create'
          ? await this.create(client, actor, data)
          : await this.load(client, uuid(data['id']));
      const context = { client, actor, row, profiles: this.profiles };
      switch (operation) {
        case 'state':
          keys(data, ['id']);
          break;
        case 'create':
          break;
        case 'edit':
          await this.edit(context, data);
          break;
        case 'photo':
          await this.photo(context, data);
          break;
        case 'follow':
          await this.follow(context, data);
          break;
        default: {
          if (
            await communityGovernance(context, operation, data, this.capacity)
          )
            break;
          const result = await communityModeration(
            context,
            operation,
            data,
            this.capacity,
          );
          if (result !== undefined) return result;
        }
      }
      return this.state(context);
    });
  }
  /** Account-scoped social reads share device/session revocation serialization. */
  async withActor<T>(
    authority: ContactAuthority,
    work: (context: {
      client: pg.PoolClient;
      actor: PublicProfile;
    }) => Promise<T>,
  ): Promise<T> {
    return this.authority.withMessageAuthority(authority, async (client) =>
      work({
        client,
        actor: await this.profiles.identity(
          client,
          authority.session.accountId,
        ),
      }),
    );
  }
  /** Future posts/replies use this contract instead of checking a cached UI state. */
  async withParticipation<T>(
    authority: ContactAuthority,
    id: string,
    work: (context: { client: pg.PoolClient; author: string }) => Promise<T>,
  ): Promise<T> {
    return this.withContext(authority, id, async (context) => {
      await requireCommunityParticipation(context);
      return work({ client: context.client, author: context.actor.id });
    });
  }
  /** Coordinated community operations revalidate account/device and serialize with governance. */
  async withContext<T>(
    authority: ContactAuthority,
    id: string,
    work: (context: CommunityContext) => Promise<T>,
  ): Promise<T> {
    return this.authority.withMessageAuthority(authority, async (client) => {
      const actor = await this.profiles.identity(
        client,
        authority.session.accountId,
      );
      const row = await this.load(client, id);
      return work({
        client,
        actor,
        row,
        profiles: this.profiles,
      });
    });
  }
}
