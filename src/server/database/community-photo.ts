import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import { publicAvatarPath } from '../../shared/public-media/index.ts';
import { currentCommunity } from './community-authority.ts';
import type { CommunityContext } from './community-authority.ts';
import type {
  PublicModerationStore,
  PublicModerationSubject,
} from './public-moderation.ts';

interface PhotoRow {
  bytes: Buffer | null;
  type: 'image/png' | 'image/jpeg' | null;
  review: string | null;
}
const columns =
  'pending_photo AS bytes,pending_photo_type AS type,pending_review AS review';
function matches(
  row: PhotoRow | undefined,
  review: PublicModerationSubject,
): boolean {
  return (
    row?.review === review.id &&
    row.bytes !== null &&
    createHash('sha256').update(row.bytes).digest('hex') === review.contentHash
  );
}
/** CommunityStore owns authorization and the enclosing replacement transaction. */
export class CommunityPhotoStore {
  nextCollection(): Promise<number | null> {
    return this.moderation.nextCollection('community-photo');
  }
  private readonly pool: pg.Pool;
  private readonly moderation: PublicModerationStore;
  constructor(pool: pg.Pool, moderation: PublicModerationStore) {
    this.pool = pool;
    this.moderation = moderation;
  }
  async replace(
    context: CommunityContext,
    revision: number,
    photo: PendingPublicAvatar | null,
  ): Promise<void> {
    const found = await context.client.query<PhotoRow>(
      `SELECT ${columns} FROM hash_talk.communities WHERE id=$1`,
      [context.row.id],
    );
    const old = found.rows[0]!;
    if (
      old.type === (photo?.type ?? null) &&
      (old.bytes === null
        ? photo === null
        : photo !== null && old.bytes.equals(photo.bytes))
    )
      return;
    currentCommunity(context, revision);
    if (old.review) await this.moderation.remove(context.client, old.review);
    const persist = async (review: string | null) => {
      await context.client.query(
        'UPDATE hash_talk.communities SET pending_photo=$2,pending_photo_type=$3,pending_review=$4,revision=revision+1 WHERE id=$1',
        [
          context.row.id,
          photo ? Buffer.from(photo.bytes) : null,
          photo?.type ?? null,
          review,
        ],
      );
    };
    if (photo)
      await this.moderation.enqueue(
        context.client,
        {
          owner: context.actor.id,
          kind: 'community-photo',
          target: context.row.id,
          contentHash: createHash('sha256').update(photo.bytes).digest('hex'),
        },
        persist,
      );
    else await persist(null);
  }
  async candidate(
    review: PublicModerationSubject,
  ): Promise<PendingPublicAvatar | null> {
    if (review.kind !== 'community-photo') return null;
    const found = await this.pool.query<PhotoRow>(
      `SELECT ${columns} FROM hash_talk.communities WHERE id=$1`,
      [review.target],
    );
    const row = found.rows[0];
    if (!matches(row, review) || !row?.bytes || !row.type) return null;
    return { type: row.type, bytes: new Uint8Array(row.bytes) };
  }
  async restricted(
    client: pg.PoolClient,
    id: string,
  ): Promise<PhotoRow | null> {
    const found = await client.query<PhotoRow>(
      `SELECT ${columns} FROM hash_talk.communities WHERE id=$1`,
      [id],
    );
    const row = found.rows[0];
    if (!row?.review || !(await this.moderation.retained(client, row.review)))
      return null;
    return row;
  }
  async bind(client: pg.PoolClient, review: PublicModerationSubject) {
    if (review.kind !== 'community-photo') return null;
    const found = await client.query<PhotoRow>(
      `SELECT ${columns} FROM hash_talk.communities WHERE id=$1 FOR UPDATE`,
      [review.target],
    );
    if (!matches(found.rows[0], review)) return null;
    // Publication stays closed until the scanner and projection are validated.
    return async () => {
      await client.query(
        'UPDATE hash_talk.communities SET revision=revision+1 WHERE id=$1',
        [review.target],
      );
    };
  }
  async references(
    client: Pick<pg.PoolClient, 'query'>,
    ids: string[],
  ): Promise<Map<string, string>> {
    const found = await client.query<{
      id: string;
      review: string | null;
      hash: string | null;
    }>(
      'SELECT id,pending_review AS review,pending_photo_hash AS hash FROM hash_talk.communities WHERE id=ANY($1::uuid[])',
      [ids],
    );
    const released = await this.moderation.released(
      client,
      found.rows.flatMap((row) => (row.review ? [row.review] : [])),
    );
    const references = new Map<string, string>();
    for (const row of found.rows) {
      const review = row.review ? released.get(row.review) : null;
      if (
        review?.kind === 'community-photo' &&
        review.target === row.id &&
        review.contentHash === row.hash
      )
        references.set(
          row.id,
          publicAvatarPath('community-photo', row.id, review.id),
        );
    }
    return references;
  }
  async releasedPhoto(
    target: string,
    review: string,
  ): Promise<PendingPublicAvatar | null> {
    const subject = (await this.moderation.released(this.pool, [review])).get(
      review,
    );
    if (
      !subject ||
      subject.kind !== 'community-photo' ||
      subject.target !== target
    )
      return null;
    return this.candidate(subject);
  }
  async bindPolicy(client: pg.PoolClient, review: PublicModerationSubject) {
    if (review.kind !== 'community-photo') return null;
    const found = await client.query<PhotoRow>(
      `SELECT ${columns} FROM hash_talk.communities WHERE id=$1 FOR UPDATE`,
      [review.target],
    );
    if (!matches(found.rows[0], review)) return null;
    return async (next: string) => {
      await client.query(
        'UPDATE hash_talk.communities SET pending_review=$2,revision=revision+1 WHERE id=$1',
        [review.target, next],
      );
    };
  }
  private async bindCollection(
    client: pg.PoolClient,
    review: PublicModerationSubject,
  ) {
    if (review.kind !== 'community-photo') return null;
    const found = await client.query<PhotoRow>(
      `SELECT ${columns} FROM hash_talk.communities WHERE id=$1 FOR UPDATE`,
      [review.target],
    );
    if (found.rows[0]?.review !== review.id) return null;
    return async () => {
      await client.query(
        'UPDATE hash_talk.communities SET pending_photo=NULL,pending_photo_type=NULL,pending_review=NULL,revision=revision+1 WHERE id=$1 AND pending_review=$2',
        [review.target, review.id],
      );
    };
  }
  async collect(signal: AbortSignal): Promise<number> {
    await this.moderation.expired('community-photo');
    const reviews = await this.moderation.discarding('community-photo');
    for (const review of reviews) {
      if (signal.aborted) return 0;
      await this.moderation.collect(review.id, (client, subject) =>
        this.bindCollection(client, subject),
      );
    }
    return reviews.length;
  }
}
