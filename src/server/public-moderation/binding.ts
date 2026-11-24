import { profileOwnedModeration } from '../../shared/public-moderation/index.ts';
import type {
  Database,
  PublicModerationBinding,
  PublicModerationRetargeting,
} from '../database/index.ts';

/** Both automatic and exceptional decisions bind through the byte owner's contract. */
export function publicModerationBinding(
  database: Database,
): PublicModerationBinding {
  return (client, subject) => {
    if (profileOwnedModeration(subject.kind))
      return database.publicProfiles.bindModeration(client, subject);
    if (
      subject.kind === 'community-photo' ||
      subject.kind === 'community-banner'
    )
      return database.communities.bindModeration(client, subject);
    return database.communityMedia.bindModeration(client, subject);
  };
}
export function publicModerationRetargeting(
  database: Database,
): PublicModerationRetargeting {
  return (client, subject) => {
    if (profileOwnedModeration(subject.kind))
      return database.publicProfiles.bindPolicy(client, subject);
    if (
      subject.kind === 'community-photo' ||
      subject.kind === 'community-banner'
    )
      return database.communities.bindPolicy(client, subject);
    return database.communityMedia.bindPolicy(client, subject);
  };
}
