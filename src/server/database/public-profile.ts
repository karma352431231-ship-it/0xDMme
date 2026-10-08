import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AccountError, encode } from '../../shared/account/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import { publicAvatarPath } from '../../shared/public-media/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import { assertContentCapacity } from './vault-quota.ts';
import type {
  PublicModerationStore,
  PublicModerationSubject,
} from './public-moderation.ts';

interface ProfileRow {
  id: string;
  handle: string;
  revision: number;
  pendingAvatar: Buffer | null;
  pendingType: string | null;
  pendingReview: string | null;
  pendingHash: string | null;
}
const publicColumns =
  'id,handle,pending_review AS "pendingReview",pending_avatar_hash AS "pendingHash"';
const ownColumns = `${publicColumns},revision,pending_avatar AS "pendingAvatar",pending_avatar_type AS "pendingType"`;
function visible(
  row: Pick<ProfileRow, 'id' | 'handle'>,
  avatar: string | null = null,
): PublicProfile {
  return { id: row.id, handle: row.handle, avatar };
}
function own(row: ProfileRow | undefined, profile?: PublicProfile) {
  return row
    ? {
        profile: profile ?? visible(row),
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
  private readonly moderation: PublicModerationStore;
  constructor(
    pool: pg.Pool,
    authority: ContactStore,
    capacity: number,
    moderation: PublicModerationStore,
  ) {
    this.pool = pool;
    this.authority = authority;
    this.capacity = capacity;
    this.moderation = moderation;
  }
  async read(handle: string): Promise<PublicProfile | null> {
    const result = await this.pool.query<ProfileRow>(
      `SELECT ${publicColumns} FROM hash_talk.public_profiles WHERE handle=$1`,
      [handle],
    );
    return (await this.project(this.pool, result.rows))[0] ?? null;
  }
  private async project(
    client: Pick<pg.PoolClient, 'query'>,
    rows: ProfileRow[],
  ): Promise<PublicProfile[]> {
    const released = await this.moderation.released(
      client,
      rows.flatMap((row) => (row.pendingReview ? [row.pendingReview] : [])),
    );
    return rows.map((row) => {
      const subject = row.pendingReview
        ? released.get(row.pendingReview)
        : null;
      const approved =
        subject?.kind === 'avatar' &&
        subject.target === row.id &&
        subject.owner === row.id &&
        subject.contentHash === row.pendingHash;
      return visible(
        row,
        approved && row.pendingReview
          ? publicAvatarPath('avatar', row.id, row.pendingReview)
          : null,
      );
    });
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
    return (await this.project(client, result.rows))[0] ?? null;
  }
  async identities(
    client: Pick<pg.PoolClient, 'query'>,
    ids: string[],
  ): Promise<Map<string, PublicProfile>> {
    const result = await client.query<ProfileRow>(
      `SELECT ${publicColumns} FROM hash_talk.public_profiles WHERE id=ANY($1::uuid[])`,
      [ids],
    );
    return new Map(
      (await this.project(client, result.rows)).map((profile) => [
        profile.id,
        profile,
      ]),
    );
  }
  /** Internal coordination only; callers must never include this account in social responses. */
  async accountFor(client: pg.PoolClient, profile: string): Promise<string> {
    const result = await client.query<{ account_id: string }>(
      'SELECT account_id FROM hash_talk.public_profiles WHERE id=$1',
      [profile],
    );
    const account = result.rows[0]?.account_id;
    if (!account) throw new AccountError(404, 'Perfil público indisponível.');
    return account;
  }
  private async view(client: pg.PoolClient, row: ProfileRow | undefined) {
    if (!row) return null;
    const retained =
      row.pendingReview &&
      (await this.moderation.retained(client, row.pendingReview));
    const profile = (await this.project(client, [row]))[0]!;
    return own(
      retained ? row : { ...row, pendingAvatar: null, pendingType: null },
      profile,
    );
  }
  async state(authority: ContactAuthority) {
    return this.authority.withMessageAuthority(authority, async (client) => {
      const result = await client.query<ProfileRow>(
        `SELECT ${ownColumns} FROM hash_talk.public_profiles WHERE account_id=$1`,
        [authority.session.accountId],
      );
      return this.view(client, result.rows[0]);
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
        return this.view(client, previous.rows[0]);
      }
      const result = await client.query<ProfileRow>(
        `INSERT INTO hash_talk.public_profiles(id,account_id,handle) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING ${ownColumns}`,
        [randomUUID(), account, handle],
      );
      if (!result.rows[0])
        throw new AccountError(409, 'Este @ já está em uso. Escolha outro.');
      await assertContentCapacity(client, this.capacity);
      return this.view(client, result.rows[0]);
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
      if (sameAvatar(old, avatar)) return this.view(client, old);
      if (old.revision !== revision)
        throw new AccountError(
          409,
          'Perfil alterado em outro aparelho. Recarregue antes de editar.',
        );
      if (old.pendingReview)
        await this.moderation.remove(client, old.pendingReview);
      let updated: ProfileRow | undefined;
      const persist = async (review: string | null) => {
        const result = await client.query<ProfileRow>(
          `UPDATE hash_talk.public_profiles SET pending_avatar=$2,pending_avatar_type=$3,pending_review=$4,revision=revision+1 WHERE account_id=$1 RETURNING ${ownColumns}`,
          [account, bytes, type, review],
        );
        updated = result.rows[0];
      };
      if (bytes)
        await this.moderation.enqueue(
          client,
          {
            owner: old.id,
            target: old.id,
            kind: 'avatar',
            contentHash: createHash('sha256').update(bytes).digest('hex'),
          },
          persist,
        );
      else await persist(null);
      if (!updated) throw new Error('Avatar não persistido.');
      return this.view(client, updated);
    });
  }
  /** Signed author operations use the current public identity, never a supplied owner ID. */
  async moderationNotices(authority: ContactAuthority, after: string | null) {
    return this.authority.withMessageAuthority(authority, async (client) => {
      const profile = await this.identity(client, authority.session.accountId);
      return this.moderation.notices(client, profile.id, after);
    });
  }
  async moderationAppeal(
    authority: ContactAuthority,
    input: { id: string; reason: string },
  ) {
    return this.authority.withMessageAuthority(authority, async (client) => {
      const profile = await this.identity(client, authority.session.accountId);
      return this.moderation.appeal(client, { ...input, owner: profile.id });
    });
  }
  /** Worker-only read; no transport exposes these candidate bytes. */
  async moderationCandidate(
    job: PublicModerationSubject,
  ): Promise<PendingPublicAvatar | null> {
    if (job.kind !== 'avatar' || job.target !== job.owner) return null;
    const result = await this.pool.query<ProfileRow>(
      `SELECT ${ownColumns} FROM hash_talk.public_profiles WHERE id=$1 AND pending_review=$2`,
      [job.target, job.id],
    );
    const row = result.rows[0];
    if (
      !row?.pendingAvatar ||
      createHash('sha256').update(row.pendingAvatar).digest('hex') !==
        job.contentHash
    )
      return null;
    if (row.pendingType !== 'image/png' && row.pendingType !== 'image/jpeg')
      throw new Error('Tipo do candidato público inválido.');
    return { type: row.pendingType, bytes: new Uint8Array(row.pendingAvatar) };
  }
  /** A known URI is not authorization: match accepted review, current target and bytes again. */
  async releasedAvatar(
    target: string,
    review: string,
  ): Promise<PendingPublicAvatar | null> {
    const subject = (await this.moderation.released(this.pool, [review])).get(
      review,
    );
    if (!subject || subject.kind !== 'avatar' || subject.target !== target)
      return null;
    return this.moderationCandidate(subject);
  }
  /** Lock order matches avatar replacement: target first, review second. */
  async bindPolicy(client: pg.PoolClient, job: PublicModerationSubject) {
    if (job.kind !== 'avatar' || job.target !== job.owner) return null;
    const found = await client.query<ProfileRow>(
      `SELECT ${publicColumns} FROM hash_talk.public_profiles WHERE id=$1 FOR UPDATE`,
      [job.target],
    );
    const row = found.rows[0];
    if (
      !row ||
      row.pendingReview !== job.id ||
      row.pendingHash !== job.contentHash
    )
      return null;
    return async (review: string) => {
      await client.query(
        'UPDATE hash_talk.public_profiles SET pending_review=$2,revision=revision+1 WHERE id=$1',
        [job.target, review],
      );
    };
  }
  async bindModeration(client: pg.PoolClient, job: PublicModerationSubject) {
    if (job.kind !== 'avatar' || job.target !== job.owner) return null;
    const result = await client.query<ProfileRow>(
      `SELECT ${ownColumns} FROM hash_talk.public_profiles WHERE id=$1 FOR UPDATE`,
      [job.target],
    );
    const row = result.rows[0];
    if (
      !row?.pendingAvatar ||
      row.pendingReview !== job.id ||
      createHash('sha256').update(row.pendingAvatar).digest('hex') !==
        job.contentHash
    )
      return null;
    // Publication projection remains closed until the validated scanner is integrated.
    return async () => {
      await client.query(
        'UPDATE hash_talk.public_profiles SET revision=revision+1 WHERE id=$1',
        [job.target],
      );
    };
  }
  private async bindCollection(
    client: pg.PoolClient,
    review: PublicModerationSubject,
  ) {
    if (review.kind !== 'avatar' || review.target !== review.owner) return null;
    const found = await client.query<{ pending_review: string | null }>(
      'SELECT pending_review FROM hash_talk.public_profiles WHERE id=$1 FOR UPDATE',
      [review.target],
    );
    if (found.rows[0]?.pending_review !== review.id) return null;
    return async () => {
      await client.query(
        'UPDATE hash_talk.public_profiles SET pending_avatar=NULL,pending_avatar_type=NULL,pending_review=NULL,revision=revision+1 WHERE id=$1 AND pending_review=$2',
        [review.target, review.id],
      );
    };
  }
  async collectModeration(signal: AbortSignal): Promise<number> {
    await this.moderation.expired('avatar');
    const reviews = await this.moderation.discarding('avatar');
    for (const review of reviews) {
      if (signal.aborted) return 0;
      await this.moderation.collect(review.id, (client, subject) =>
        this.bindCollection(client, subject),
      );
    }
    return reviews.length;
  }
  nextModerationCollection(): Promise<number | null> {
    return this.moderation.nextCollection('avatar');
  }
}
