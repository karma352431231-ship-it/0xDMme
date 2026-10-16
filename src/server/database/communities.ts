import { assignCommunityAddress } from './community-address.ts';
import { communitySlug } from '../../shared/community-address/index.ts';
import {
  createCommunityClassification,
  readCommunityClassifications,
  verifyCommunityClassification,
} from './community-classification.ts';
import { reconcileMentionNotifications } from './mention-admission.ts';
import { writeCommunityName } from './community-names.ts';
import { mentionQuery } from '../../shared/public-mentions/index.ts';
import { CommunityFollowerStore } from './community-followers.ts';
import { confirmCommunityPresentation } from './community-presentation.ts';
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
import type {
  PublicModerationStore,
  PublicModerationSubject,
} from './public-moderation.ts';
import { CommunityPhotoStore } from './community-photo.ts';
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
import { operateCommunityBadge } from './community-badges.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import { storePublicReport } from './public-reports.ts';
import { postCount } from '../../shared/community-posts/index.ts';

const columns =
  '(SELECT slug FROM hash_talk.community_addresses a WHERE a.community_id=c.id) AS slug,c.id,c.created_at,c.owner,c.name,c.description,c.rules,c.revision,c.archived,(SELECT count(*)::text FROM hash_talk.community_follows f WHERE f.community_id=c.id) AS followers';
const privateColumns = columns + ',c.transfer_id,c.transfer_to';
type CommunityStateWire = Omit<
  CommunityState,
  'pendingPhoto' | 'pendingBanner'
> & {
  pendingPhoto: { type: string | null; bytes: string } | null;
  pendingBanner: { type: string | null; bytes: string } | null;
};
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
  private readonly followers: CommunityFollowerStore;
  private socialControls: {
    state: (
      authority: ContactAuthority,
      peer: string,
    ) => Promise<SocialRelation | null>;
    block: (
      authority: ContactAuthority,
      input: { peer: string; blocked: boolean; revision: number },
    ) => Promise<void>;
  } | null = null;
  setSocialControls(
    controls: NonNullable<CommunityStore['socialControls']>,
  ): void {
    this.socialControls = controls;
  }
  async profileBlock(
    operation: string,
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ) {
    if (!this.socialControls)
      throw new AccountError(503, 'Bloqueio indisponível.');
    keys(
      data,
      operation === 'profile-block-set'
        ? ['target', 'blocked', 'revision']
        : ['target'],
    );
    const peer = uuid(data['target']);
    if (operation === 'profile-block-set')
      await this.socialControls.block(authority, {
        peer,
        blocked: communityBoolean(data['blocked']),
        revision: postCount(data['revision']),
      });
    const state = await this.socialControls.state(authority, peer);
    return {
      blocked: state?.blocked ?? false,
      revision: state?.blockRevision ?? 0,
    };
  }
  private readonly pool: pg.Pool;
  private readonly authority: ContactStore;
  private readonly profiles: PublicProfileStore;
  private readonly capacity: number;
  private readonly photos: CommunityPhotoStore;
  private readonly banners: CommunityPhotoStore;
  constructor(options: {
    pool: pg.Pool;
    authority: ContactStore;
    profiles: PublicProfileStore;
    capacity: number;
    moderation: PublicModerationStore;
  }) {
    this.pool = options.pool;
    this.authority = options.authority;
    this.profiles = options.profiles;
    this.followers = new CommunityFollowerStore(options.profiles);
    this.capacity = options.capacity;
    this.photos = new CommunityPhotoStore(options.pool, options.moderation);
    this.banners = new CommunityPhotoStore(
      options.pool,
      options.moderation,
      'banner',
    );
  }
  private async visible(
    client: Pick<pg.PoolClient, 'query'>,
    rows: CommunityRecord[],
  ): Promise<Community[]> {
    const owners = await this.profiles.identities(
      client,
      rows.flatMap((row) => (row.owner ? [row.owner] : [])),
    );
    const photos = await this.photos.references(
      client,
      rows.map((row) => row.id),
    );
    const banners = await this.banners.references(
      client,
      rows.map((row) => row.id),
    );
    const classifications = await readCommunityClassifications(
      client,
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug ?? null,
      createdAt: row.created_at?.toISOString() ?? null,
      name: row.name,
      description: row.description,
      rules: row.rules,
      revision: row.revision,
      archived: row.archived,
      avatar: photos.get(row.id) ?? null,
      banner: banners.get(row.id) ?? null,
      ...(classifications.has(row.id)
        ? { classification: classifications.get(row.id)! }
        : {}),
      owner: row.owner ? (owners.get(row.owner) ?? null) : null,
      followers: Number(row.followers),
    }));
  }
  async suggestions(value: string): Promise<CommunityPage> {
    const query = mentionQuery(value).replace(/[\\%_]/gu, '\\$&') + '%';
    const found = await this.pool.query<CommunityRecord>(
      `SELECT ${columns} FROM hash_talk.communities c WHERE hash_talk.community_name_key(c.name) LIKE $1 AND NOT c.archived ORDER BY hash_talk.community_name_key(c.name) LIMIT 8`,
      [query],
    );
    return { items: await this.visible(this.pool, found.rows), next: null };
  }
  async readAddress(value: string): Promise<Community> {
    const found = await this.pool.query<{ community_id: string }>(
      'SELECT community_id FROM hash_talk.community_addresses WHERE slug=$1',
      [communitySlug(value)],
    );
    if (!found.rows[0]) throw new AccountError(404, 'Comunidade indisponível.');
    return this.read(found.rows[0].community_id);
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
  /** Feed photos reuse the approval gate, without fetching private candidates. */
  async photoReferences(
    client: Pick<pg.PoolClient, 'query'>,
    ids: string[],
  ): Promise<Map<string, string>> {
    if (ids.length > communityPageSize)
      throw new AccountError(400, 'Página muito grande.');
    if (!ids.length) return new Map();
    return this.photos.references(client, ids);
  }
  /** Discovery projects at most one page without private governance columns. */
  async publicIdentity(client: Pick<pg.PoolClient, 'query'>, profile: string) {
    return (
      (await this.profiles.identities(client, [profile])).get(profile) ?? null
    );
  }
  async readMany(
    client: Pick<pg.PoolClient, 'query'>,
    ids: string[],
  ): Promise<Community[]> {
    if (ids.length > communityPageSize)
      throw new AccountError(400, 'Página muito grande.');
    const found = await client.query<CommunityRecord>(
      `SELECT ${columns} FROM hash_talk.communities c WHERE c.id=ANY($1::uuid[])`,
      [ids],
    );
    return this.visible(client, found.rows);
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
        : await this.photos.restricted(context.client, row.id);
    const transfer = await this.transfer(next, role);
    const banner =
      role === 'participant'
        ? null
        : await this.banners.restricted(context.client, row.id);
    return {
      community: (await this.visible(context.client, [row]))[0]!,
      role,
      following: Boolean(following.rowCount),
      canPost: !row.archived && !sanction,
      pendingPhoto: photo?.bytes
        ? { type: photo.type, bytes: encode(photo.bytes) }
        : null,
      pendingBanner: banner?.bytes
        ? { type: banner.type, bytes: encode(banner.bytes) }
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
    keys(data, [
      'id',
      'meta',
      ...(Object.hasOwn(data, 'classification') ? ['classification'] : []),
    ]);
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
      await verifyCommunityClassification(client, id, data['classification']);
      return row;
    }
    await writeCommunityName(
      client,
      'INSERT INTO hash_talk.communities(id,owner,name,description,rules) VALUES($1,$2,$3,$4,$5)',
      [id, actor.id, meta.name, meta.description, meta.rules],
    );
    await assignCommunityAddress(client, id, meta.name);
    await createCommunityClassification(client, id, data['classification']);
    await seedCommunityTags(client, id);
    await reconcileMentionNotifications(client, {
      source: { kind: 'community', id },
      actor: actor.id,
      texts: [meta.description],
    });
    await client.query(
      'INSERT INTO hash_talk.community_follows(community_id,profile_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [id, actor.id],
    );
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
    await writeCommunityName(
      context.client,
      'UPDATE hash_talk.communities SET name=$2,description=$3,rules=$4,revision=revision+1 WHERE id=$1',
      [row.id, meta.name, meta.description, meta.rules],
    );
    await reconcileMentionNotifications(context.client, {
      source: { kind: 'community', id: row.id },
      actor: context.actor.id,
      texts: [meta.description],
    });
    await assertContentCapacity(context.client, this.capacity);
  }
  private async photo(
    context: CommunityContext,
    data: Record<string, unknown>,
  ): Promise<void> {
    keys(data, ['id', 'revision', 'photo']);
    await requireCommunityManager(context);
    await this.photos.replace(
      context,
      communityRevision(data['revision']),
      pendingPublicAvatar(data['photo']),
    );
  }
  moderationCandidate(review: PublicModerationSubject) {
    return (
      review.kind === 'community-banner' ? this.banners : this.photos
    ).candidate(review);
  }
  releasedPhoto(target: string, review: string) {
    return this.photos.releasedPhoto(target, review);
  }
  releasedBanner(target: string, review: string) {
    return this.banners.releasedPhoto(target, review);
  }
  bindPolicy(client: pg.PoolClient, subject: PublicModerationSubject) {
    return (
      subject.kind === 'community-banner' ? this.banners : this.photos
    ).bindPolicy(client, subject);
  }
  bindModeration(client: pg.PoolClient, review: PublicModerationSubject) {
    return (
      review.kind === 'community-banner' ? this.banners : this.photos
    ).bind(client, review);
  }
  async collectModeration(signal: AbortSignal) {
    const photos = await this.photos.collect(signal);
    const banners = await this.banners.collect(signal);
    return Math.max(photos, banners);
  }
  async nextModerationCollection(): Promise<number | null> {
    const times = (
      await Promise.all([
        this.photos.nextCollection(),
        this.banners.nextCollection(),
      ])
    ).filter((time): time is number => time !== null);
    return times.length ? Math.min(...times) : null;
  }
  private async follow(
    context: CommunityContext,
    data: Record<string, unknown>,
  ): Promise<void> {
    keys(data, ['id', 'following']);
    const following = communityBoolean(data['following']);
    if (context.row.owner === context.actor.id) {
      if (!following)
        throw new AccountError(
          403,
          'O dono segue sua comunidade automaticamente.',
        );
      return;
    }
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
  followerPage(id: unknown, after: unknown, tab: unknown = 'all') {
    return this.followers.read({ client: this.pool, id, after, tab });
  }
  async operate(
    operation: string,
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    if (operation === 'followers-page') {
      keys(data, ['id', 'tab', 'after']);
      return this.withReader(authority, ({ client, actor }) =>
        this.followers.read({
          client,
          id: data['id'],
          tab: data['tab'],
          after: data['after'],
          viewer: actor?.id ?? null,
        }),
      );
    }
    if (operation === 'presentation')
      return this.withContext(authority, uuid(data['id']), async (context) => {
        await confirmCommunityPresentation(context, data, {
          edit: (value) => this.edit(context, value),
          photos: this.photos,
          banners: this.banners,
          capacity: this.capacity,
        });
        return this.state(context);
      });
    if (
      operation === 'profile-block-set' ||
      operation === 'profile-block-state'
    )
      return this.profileBlock(operation, authority, data);
    if (operation.startsWith('badge-'))
      return this.withContext(authority, uuid(data['id']), (context) =>
        operateCommunityBadge(context, operation, data, this.capacity),
      );
    if (operation === 'public-report')
      return this.withActor(authority, (context) =>
        storePublicReport(context, data, this.capacity),
      );
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
  async withReader<T>(
    authority: ContactAuthority,
    work: (context: {
      client: pg.PoolClient;
      actor: PublicProfile | null;
    }) => Promise<T>,
  ): Promise<T> {
    return this.authority.withMessageAuthority(authority, async (client) =>
      work({
        client,
        actor: await this.profiles.identityOrNull(
          client,
          authority.session.accountId,
        ),
      }),
    );
  }
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
