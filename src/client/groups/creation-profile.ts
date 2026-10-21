import { object } from '../../shared/account/index.ts';
import {
  groupTitle,
  groupDescription,
  groupPhoto,
} from '../../shared/group-messages/index.ts';
import type { GroupPhoto } from '../../shared/group-messages/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import { GroupCache } from './cache.ts';
import { GroupCatalog } from './catalog.ts';
import { composeGroup } from './outbox.ts';
export interface GroupCreationProfile {
  version: 1;
  title: string;
  description: string;
  photo: GroupPhoto | null;
}
export function creationProfile(
  title: string,
  input: { description?: string; photo?: GroupPhoto | null },
): GroupCreationProfile {
  return {
    version: 1,
    title: groupTitle({ version: 1, title }),
    description: groupDescription(input.description ?? ''),
    photo: groupPhoto(input.photo ?? null),
  };
}
export function assertCreationProfile(
  saved: GroupCreationProfile,
  requested: GroupCreationProfile,
): void {
  if (canonical(saved) !== canonical(requested))
    throw new Error(
      'Resume creation with the same name, description and photo or discard the pending request.',
    );
}
/** Persist the initial administrative profile and its outbox before releasing
 * the resumable creation record. Existing message encryption/quota applies. */
export async function stageCreationProfile(
  authority: VaultAuthority,
  event: GroupEvent,
  profile: GroupCreationProfile,
): Promise<void> {
  const catalog = new GroupCatalog(authority),
    id = event.groupId;
  await catalog.save({ state: event, title: profile.title });
  const cache = new GroupCache(authority, id),
    previous = await cache.get('profile');
  if (previous === null || object(previous)['sequence'] === 0)
    await cache.put('profile', { ...profile, epoch: 0, sequence: 0 });
  await stageInitialOutbox(authority, id, profile);
  await catalog.clearCreation();
}

async function stageInitialOutbox(
  authority: VaultAuthority,
  id: string,
  profile: GroupCreationProfile,
): Promise<void> {
  const pending = await new GroupCache(authority, id).get(`outbox:${id}`);
  if (pending !== null) {
    const draft = object(pending);
    if (
      draft['kind'] !== 'profile' ||
      draft['text'] !== JSON.stringify(profile)
    )
      throw new Error('Group profile request repeated with different content.');
    return;
  }
  await composeGroup({
    authority,
    groupId: id,
    text: JSON.stringify(profile),
    selection: null,
    kind: 'profile',
    id,
  });
}
