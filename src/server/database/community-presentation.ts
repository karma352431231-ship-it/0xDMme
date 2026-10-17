import type { ContentCapacity } from './content-capacity.ts';
import { keys } from '../../shared/account/index.ts';
import {
  communityMeta,
  communityRevision,
} from '../../shared/communities/index.ts';
import { pendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import {
  currentCommunity,
  requireCommunityManager,
} from './community-authority.ts';
import type { CommunityContext } from './community-authority.ts';
import type { CommunityPhotoStore } from './community-photo.ts';
import { assertContentCapacity } from './vault-quota.ts';

/** The caller owns the single authority transaction and the community row lock. */
export async function confirmCommunityPresentation(
  context: CommunityContext,
  data: Record<string, unknown>,
  operations: {
    edit: (data: Record<string, unknown>) => Promise<void>;
    photos: CommunityPhotoStore;
    banners: CommunityPhotoStore;
    capacity: ContentCapacity;
  },
): Promise<void> {
  keys(data, ['id', 'revision', 'meta', 'photo', 'banner']);
  await requireCommunityManager(context);
  const revision = communityRevision(data['revision']);
  currentCommunity(context, revision);
  const photo = pendingPublicAvatar(data['photo']),
    banner = pendingPublicAvatar(data['banner']),
    meta = communityMeta(data['meta']);
  await operations.edit({ id: context.row.id, revision, meta });
  await operations.photos.replace(context, revision, photo);
  await operations.banners.replace(context, revision, banner);
  await assertContentCapacity(context.client, operations.capacity);
}
