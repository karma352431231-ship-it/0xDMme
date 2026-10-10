import { createHash } from 'node:crypto';
import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import { publicAvatarPath } from '../../shared/public-media/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type {
  PublicModerationStore,
  PublicModerationSubject,
} from './public-moderation.ts';
import { assertContentCapacity } from './vault-quota.ts';

interface BannerRow {
  revision: number;
  bytes: Buffer | null;
  type: 'image/png' | 'image/jpeg' | null;
  review: string | null;
  content_hash: string | null;
}
type Reader = Pick<pg.PoolClient, 'query'>;
const columns = 'revision,bytes,type,review,content_hash';
interface BannerOptions {
  pool: pg.Pool;
  moderation: PublicModerationStore;
  authority: ContactStore;
  identity: (client: pg.PoolClient, account: string) => Promise<PublicProfile>;
  capacity: number;
}
function sameBanner(
  row: BannerRow | undefined,
  banner: PendingPublicAvatar | null,
): boolean {
  if ((row?.type ?? null) !== (banner?.type ?? null)) return false;
  if (!row?.bytes) return banner === null;
  return banner !== null && row.bytes.equals(Buffer.from(banner.bytes));
}
export class ProfileBanners {
  private readonly options: BannerOptions;
  constructor(options: BannerOptions) {
    this.options = options;
  }
  private async row(client: Reader, id: string, lock = false) {
    const rows = await client.query<BannerRow>(
      `SELECT ${columns} FROM hash_talk.public_profile_banners WHERE profile_id=$1${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    return rows.rows[0];
  }
  private async view(client: Reader, row: BannerRow | undefined) {
    const retained =
      row?.review &&
      (await this.options.moderation.retained(client, row.review));
    return {
      revision: row?.revision ?? 0,
      banner:
        retained && row?.bytes && row.type
          ? { type: row.type, bytes: row.bytes.toString('base64') }
          : null,
    };
  }
  state(authority: ContactAuthority) {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.options.identity(
          client,
          authority.session.accountId,
        );
        return this.view(client, await this.row(client, profile.id));
      },
    );
  }
  replace(
    authority: ContactAuthority,
    revision: number,
    banner: PendingPublicAvatar | null,
  ) {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.options.identity(
          client,
          authority.session.accountId,
        );
        // Serialize the absent-row case and preserve revision tombstones after removal.
        await client.query(
          'SELECT id FROM hash_talk.public_profiles WHERE id=$1 FOR UPDATE',
          [profile.id],
        );
        const old = await this.row(client, profile.id, true);
        const bytes = banner ? Buffer.from(banner.bytes) : null;
        if (sameBanner(old, banner)) return this.view(client, old);
        if ((old?.revision ?? 0) !== revision)
          throw new AccountError(
            409,
            'Banner alterado em outro aparelho. Recarregue antes de editar.',
          );
        if (old?.review)
          await this.options.moderation.remove(client, old.review);
        const persist = async (review: string | null) => {
          await client.query(
            `INSERT INTO hash_talk.public_profile_banners(profile_id,bytes,type,review) VALUES($1,$2,$3,$4)
          ON CONFLICT(profile_id) DO UPDATE SET bytes=$2,type=$3,review=$4,revision=hash_talk.public_profile_banners.revision+1`,
            [profile.id, bytes, banner?.type ?? null, review],
          );
        };
        if (banner)
          await this.options.moderation.enqueue(
            client,
            {
              owner: profile.id,
              target: profile.id,
              kind: 'profile-banner',
              contentHash: createHash('sha256')
                .update(banner.bytes)
                .digest('hex'),
            },
            persist,
          );
        else await persist(null);
        await assertContentCapacity(client, this.options.capacity);
        return this.view(client, await this.row(client, profile.id));
      },
    );
  }
  private async matching(
    client: Reader,
    job: PublicModerationSubject,
    lock = false,
  ) {
    if (job.kind !== 'profile-banner' || job.owner !== job.target) return null;
    const row = await this.row(client, job.target, lock);
    return row?.review === job.id && row.content_hash === job.contentHash
      ? row
      : null;
  }
  async candidate(
    job: PublicModerationSubject,
  ): Promise<PendingPublicAvatar | null> {
    const row = await this.matching(this.options.pool, job);
    return row?.bytes && row.type
      ? { type: row.type, bytes: new Uint8Array(row.bytes) }
      : null;
  }
  async reference(id: string): Promise<string | null> {
    const row = await this.row(this.options.pool, id);
    if (!row?.review) return null;
    const job = (
      await this.options.moderation.released(this.options.pool, [row.review])
    ).get(row.review);
    return job?.target === id && (await this.matching(this.options.pool, job))
      ? publicAvatarPath('profile-banner', id, job.id)
      : null;
  }
  async released(target: string, review: string) {
    const job = (
      await this.options.moderation.released(this.options.pool, [review])
    ).get(review);
    return job?.target === target ? this.candidate(job) : null;
  }
  async bind(client: pg.PoolClient, job: PublicModerationSubject) {
    if (!(await this.matching(client, job, true))) return null;
    return async () => {
      await client.query(
        'UPDATE hash_talk.public_profile_banners SET revision=revision+1 WHERE profile_id=$1',
        [job.target],
      );
    };
  }
  async bindPolicy(client: pg.PoolClient, job: PublicModerationSubject) {
    if (!(await this.matching(client, job, true))) return null;
    return async (next: string) => {
      await client.query(
        'UPDATE hash_talk.public_profile_banners SET review=$2,revision=revision+1 WHERE profile_id=$1',
        [job.target, next],
      );
    };
  }
  nextCollection() {
    return this.options.moderation.nextCollection('profile-banner');
  }
  async collect(signal: AbortSignal) {
    await this.options.moderation.expired('profile-banner');
    const reviews = await this.options.moderation.discarding('profile-banner');
    for (const review of reviews) {
      if (signal.aborted) break;
      await this.options.moderation.collect(review.id, async (client, job) => {
        const row = await this.row(client, job.target, true);
        if (row?.review !== job.id) return null;
        return async () => {
          await client.query(
            'UPDATE hash_talk.public_profile_banners SET bytes=NULL,type=NULL,review=NULL,revision=revision+1 WHERE profile_id=$1 AND review=$2',
            [job.target, job.id],
          );
        };
      });
    }
    return reviews.length;
  }
}
