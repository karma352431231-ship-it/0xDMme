import { AccountError } from '../../shared/account/index.ts';
import type { PublicAvatarKind } from '../../shared/public-media/index.ts';
import type { PublicProfileStore, CommunityStore } from '../database/index.ts';
import type {
  CommunityMediaStore,
  PublicModerationMediaCandidate,
} from '../database/index.ts';
import { CommunityMediaFiles } from '../community-media/index.ts';
import { createHash } from 'node:crypto';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';

/** Read only the current released bytes; a public URI never bypasses the global gate. */
export class PublicMediaService {
  private readonly stores: {
    profiles: Pick<PublicProfileStore, 'releasedAvatar'>;
    communities: Pick<CommunityStore, 'releasedPhoto'>;
    media?: Pick<CommunityMediaStore, 'releasedMedia'>;
  };
  private readonly files: CommunityMediaFiles | null;
  constructor(
    stores: {
      profiles: Pick<PublicProfileStore, 'releasedAvatar'>;
      communities: Pick<CommunityStore, 'releasedPhoto'>;
      media?: Pick<CommunityMediaStore, 'releasedMedia'>;
    },
    directory?: string,
  ) {
    this.stores = stores;
    this.files = directory ? new CommunityMediaFiles(directory) : null;
  }
  async avatar(
    kind: PublicAvatarKind,
    target: string,
    review: string,
  ): Promise<PendingPublicAvatar> {
    const read = () =>
      kind === 'avatar'
        ? this.stores.profiles.releasedAvatar(target, review)
        : this.stores.communities.releasedPhoto(target, review);
    const content = await read();
    if (!content || !(await read()))
      throw new AccountError(404, 'Mídia pública indisponível.');
    return content;
  }
  async media(
    target: string,
    review: string,
    thumbnail: boolean,
  ): Promise<{ type: string; bytes: Uint8Array }> {
    if (!this.stores.media || !this.files)
      throw new AccountError(503, 'Mídia pública indisponível.');
    const candidate = await this.stores.media.releasedMedia(target, review);
    if (!candidate) throw new AccountError(404, 'Mídia pública indisponível.');
    const bytes = await this.verifiedBytes(candidate, thumbnail);
    const current = await this.stores.media.releasedMedia(target, review);
    if (
      !current ||
      current.resultHash !== candidate.resultHash ||
      current.thumbnailHash !== candidate.thumbnailHash
    )
      throw new AccountError(404, 'Mídia pública indisponível.');
    return { type: thumbnail ? 'image/png' : candidate.result.type, bytes };
  }
  private async verifiedBytes(
    candidate: PublicModerationMediaCandidate,
    thumbnail: boolean,
  ): Promise<Uint8Array> {
    const expected = thumbnail
      ? candidate.result.thumbnailBytes
      : candidate.result.bytes;
    const bytes = await this.files!.read(
      candidate.id,
      thumbnail ? 'thumbnail' : 'result',
      expected,
    );
    const hash = thumbnail ? candidate.thumbnailHash : candidate.resultHash;
    if (
      bytes.length !== expected ||
      createHash('sha256').update(bytes).digest('hex') !== hash
    )
      throw new AccountError(503, 'Mídia pública indisponível.');
    return bytes;
  }
}
