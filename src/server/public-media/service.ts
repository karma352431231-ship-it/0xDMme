import { AccountError } from '../../shared/account/index.ts';
import type { PublicAvatarKind } from '../../shared/public-media/index.ts';
import type { PublicProfileStore, CommunityStore } from '../database/index.ts';
import type {
  CommunityMediaStore,
  PublicModerationMediaCandidate,
} from '../database/index.ts';
import { CommunityMediaFiles } from '../community-media/index.ts';
import { verifiedMediaFile } from './file.ts';
import type { VerifiedMediaFile } from './file.ts';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';

/** Select the released output and its exact integrity/size contract together. */
function releasedFile(
  candidate: PublicModerationMediaCandidate,
  thumbnail: boolean,
) {
  if (thumbnail)
    return {
      name: 'thumbnail' as const,
      type: 'image/png',
      bytes: candidate.result.thumbnailBytes,
      hash: candidate.thumbnailHash,
    };
  return {
    name: 'result' as const,
    type: candidate.result.type,
    bytes: candidate.result.bytes,
    hash: candidate.resultHash,
  };
}

/** Read only the current released bytes; a public URI never bypasses the global gate. */
export class PublicMediaService {
  private readonly stores: {
    profiles: Pick<PublicProfileStore, 'releasedAvatar'> &
      Partial<Pick<PublicProfileStore, 'releasedBanner'>>;
    communities: Pick<CommunityStore, 'releasedPhoto'> &
      Partial<Pick<CommunityStore, 'releasedBanner'>>;
    media?: Pick<CommunityMediaStore, 'releasedMedia'>;
  };
  private readonly files: CommunityMediaFiles | null;
  constructor(
    stores: {
      profiles: Pick<PublicProfileStore, 'releasedAvatar'> &
        Partial<Pick<PublicProfileStore, 'releasedBanner'>>;
      communities: Pick<CommunityStore, 'releasedPhoto'> &
        Partial<Pick<CommunityStore, 'releasedBanner'>>;
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
      kind === 'profile-banner'
        ? (this.stores.profiles.releasedBanner?.(target, review) ??
          Promise.resolve(null))
        : kind === 'avatar'
          ? this.stores.profiles.releasedAvatar(target, review)
          : kind === 'community-banner'
            ? (this.stores.communities.releasedBanner?.(target, review) ??
              Promise.resolve(null))
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
    signal: AbortSignal,
  ): Promise<{ type: string; file: VerifiedMediaFile }> {
    if (!this.stores.media || !this.files)
      throw new AccountError(503, 'Mídia pública indisponível.');
    signal.throwIfAborted();
    const candidate = await this.stores.media.releasedMedia(target, review);
    if (!candidate) throw new AccountError(404, 'Mídia pública indisponível.');
    const descriptor = releasedFile(candidate, thumbnail);
    const handle = await this.files.openRead(
      candidate.id,
      descriptor.name,
      descriptor.bytes,
    );
    const file = await verifiedMediaFile(handle, {
      bytes: descriptor.bytes,
      hash: descriptor.hash,
      signal,
    });
    try {
      const current = await this.stores.media.releasedMedia(target, review);
      if (
        !current ||
        current.resultHash !== candidate.resultHash ||
        current.thumbnailHash !== candidate.thumbnailHash
      )
        throw new AccountError(404, 'Mídia pública indisponível.');
      signal.throwIfAborted();
      await file.check();
      return { type: descriptor.type, file };
    } catch (error: unknown) {
      await file.close();
      throw error;
    }
  }
}
