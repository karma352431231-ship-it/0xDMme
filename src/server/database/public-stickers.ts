import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AccountError, uuid } from '../../shared/account/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { PublicImage } from '../../shared/public-avatar/index.ts';
import { publicStickerLimits } from '../../shared/public-stickers/index.ts';
import type {
  PublicStickerFile,
  StickerFileType,
  StickerImage,
} from '../../shared/public-stickers/index.ts';
import type { ContentCapacity } from './content-capacity.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type {
  PublicModerationStore,
  PublicModerationSubject,
} from './public-moderation.ts';
import { assertContentCapacity } from './vault-quota.ts';

/**
 * Public stickers (24/11/2026): one small image per row, owned by a public
 * profile. Like profile banners, the bytes live in SQL and a stable address
 * serves them only while the current review is released.
 */
interface StickerRow {
  id: string;
  owner: string;
  bytes: Buffer | null;
  type: StickerFileType | null;
  width: number;
  height: number;
  review: string | null;
  content_hash: string | null;
  created_at: Date;
}
export interface OwnSticker {
  id: string;
  width: number;
  height: number;
  createdAt: string;
}
type Reader = Pick<pg.PoolClient, 'query'>;
const columns =
  'id,owner,bytes,type,width,height,review,content_hash,created_at';
interface StickerOptions {
  pool: pg.Pool;
  moderation: PublicModerationStore;
  authority: ContactStore;
  identity: (client: pg.PoolClient, account: string) => Promise<PublicProfile>;
  capacity: ContentCapacity;
}

export class PublicStickers {
  private readonly options: StickerOptions;
  constructor(options: StickerOptions) {
    this.options = options;
  }
  private async row(
    client: Reader,
    id: string,
    lock = false,
  ): Promise<StickerRow | undefined> {
    const rows = await client.query<StickerRow>(
      `SELECT ${columns} FROM hash_talk.public_stickers WHERE id=$1${lock ? ' FOR UPDATE' : ''}`,
      [uuid(id)],
    );
    return rows.rows[0];
  }
  /** Publishes one prepared image as the signed-in profile's sticker. */
  upload(authority: ContactAuthority, file: PublicStickerFile) {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.options.identity(
          client,
          authority.session.accountId,
        );
        // Serialize the per-profile count with other uploads of the profile.
        await client.query(
          'SELECT id FROM hash_talk.public_profiles WHERE id=$1 FOR UPDATE',
          [profile.id],
        );
        const contentHash = createHash('sha256')
          .update(file.bytes)
          .digest('hex');
        // The same picture published again keeps its first address.
        const same = await client.query<{ id: string }>(
          'SELECT id FROM hash_talk.public_stickers WHERE owner=$1 AND content_hash=$2 AND bytes IS NOT NULL LIMIT 1',
          [profile.id, contentHash],
        );
        if (same.rows[0]) return { id: same.rows[0].id };
        const count = await client.query<{ total: string }>(
          'SELECT count(*) AS total FROM hash_talk.public_stickers WHERE owner=$1',
          [profile.id],
        );
        if (Number(count.rows[0]?.total ?? 0) >= publicStickerLimits.perProfile)
          throw new AccountError(
            409,
            'Sticker limit reached. Delete a public sticker first.',
          );
        const id = randomUUID();
        await this.options.moderation.enqueue(
          client,
          {
            owner: profile.id,
            target: id,
            kind: 'sticker',
            contentHash,
          },
          async (review) => {
            await client.query(
              'INSERT INTO hash_talk.public_stickers(id,owner,bytes,type,width,height,review) VALUES($1,$2,$3,$4,$5,$6,$7)',
              [
                id,
                profile.id,
                Buffer.from(file.bytes),
                file.type,
                file.width,
                file.height,
                review,
              ],
            );
          },
        );
        await assertContentCapacity(client, this.options.capacity);
        return { id };
      },
    );
  }
  /** The signed-in profile's public stickers, newest first. */
  mine(authority: ContactAuthority): Promise<OwnSticker[]> {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.options.identity(
          client,
          authority.session.accountId,
        );
        const rows = await client.query<StickerRow>(
          `SELECT ${columns} FROM hash_talk.public_stickers WHERE owner=$1 AND bytes IS NOT NULL
            ORDER BY created_at DESC,id DESC LIMIT $2`,
          [profile.id, publicStickerLimits.perProfile],
        );
        return rows.rows.map((row) => ({
          id: row.id,
          width: row.width,
          height: row.height,
          createdAt: row.created_at.toISOString(),
        }));
      },
    );
  }
  /** Deleting a sticker also takes it out of every pack (cascade). */
  remove(authority: ContactAuthority, id: string) {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.options.identity(
          client,
          authority.session.accountId,
        );
        const row = await this.row(client, id, true);
        if (!row || row.owner !== profile.id)
          throw new AccountError(404, 'Sticker unavailable.');
        if (row.review)
          await this.options.moderation.remove(client, row.review);
        await client.query(
          'DELETE FROM hash_talk.public_stickers WHERE id=$1',
          [row.id],
        );
        return { removed: true as const };
      },
    );
  }
  /** Of the given stickers, the ones owned by `owner` (pack editing). */
  async owned(client: Reader, owner: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const rows = await client.query<{ id: string }>(
      'SELECT id FROM hash_talk.public_stickers WHERE owner=$1 AND id=ANY($2::uuid[]) AND bytes IS NOT NULL',
      [owner, ids],
    );
    return rows.rows.map((row) => row.id);
  }
  /** Of the given stickers, the ones whose current review is released. */
  async visible(client: Reader, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await client.query<StickerRow>(
      `SELECT ${columns} FROM hash_talk.public_stickers WHERE id=ANY($1::uuid[]) AND review IS NOT NULL`,
      [ids],
    );
    const reviews = await this.options.moderation.released(
      client,
      rows.rows.map((row) => row.review!),
    );
    return new Set(
      rows.rows
        .filter((row) => {
          const job = reviews.get(row.review!);
          return job?.target === row.id && job.contentHash === row.content_hash;
        })
        .map((row) => row.id),
    );
  }
  /** The released file at a sticker's stable address, or null. */
  async released(id: string): Promise<StickerImage | null> {
    const row = await this.row(this.options.pool, id);
    if (!row?.review || !row.bytes || !row.type) return null;
    const job = (
      await this.options.moderation.released(this.options.pool, [row.review])
    ).get(row.review);
    if (job?.target !== row.id || job.contentHash !== row.content_hash)
      return null;
    return { type: row.type, bytes: new Uint8Array(row.bytes) };
  }
  private async matching(
    client: Reader,
    job: PublicModerationSubject,
    lock = false,
  ): Promise<StickerRow | null> {
    if (job.kind !== 'sticker') return null;
    const row = await this.row(client, job.target, lock);
    return row?.owner === job.owner &&
      row.review === job.id &&
      row.content_hash === job.contentHash
      ? row
      : null;
  }
  /** Picture stickers only: the frame scanners never read a video clip. */
  async candidate(job: PublicModerationSubject): Promise<PublicImage | null> {
    const row = await this.matching(this.options.pool, job);
    return row?.bytes && row.type && row.type !== 'video/mp4'
      ? { type: row.type, bytes: new Uint8Array(row.bytes) }
      : null;
  }
  async bind(client: pg.PoolClient, job: PublicModerationSubject) {
    if (!(await this.matching(client, job, true))) return null;
    // The stable address reads the review on every request; nothing to bump.
    return () => Promise.resolve();
  }
  async bindPolicy(client: pg.PoolClient, job: PublicModerationSubject) {
    if (!(await this.matching(client, job, true))) return null;
    return async (next: string) => {
      await client.query(
        'UPDATE hash_talk.public_stickers SET review=$2 WHERE id=$1',
        [job.target, next],
      );
    };
  }
  nextCollection() {
    return this.options.moderation.nextCollection('sticker');
  }
  /** Expired or discarded reviews free their sticker's bytes. */
  async collect(signal: AbortSignal): Promise<number> {
    await this.options.moderation.expired('sticker');
    const reviews = await this.options.moderation.discarding('sticker');
    for (const review of reviews) {
      if (signal.aborted) break;
      await this.options.moderation.collect(review.id, async (client, job) => {
        const row = await this.row(client, job.target, true);
        if (row?.review !== job.id) return null;
        return async () => {
          await client.query(
            'UPDATE hash_talk.public_stickers SET bytes=NULL,type=NULL,review=NULL WHERE id=$1 AND review=$2',
            [job.target, job.id],
          );
        };
      });
    }
    return reviews.length;
  }
}
