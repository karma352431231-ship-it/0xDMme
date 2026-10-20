import { ownPublicProfile } from '../../shared/public-profile/index.ts';
import { profileFollow } from '../../shared/profile-social/index.ts';
import type { ProfileFollow } from '../../shared/profile-social/index.ts';
import type { PublicProfiles } from './controller.ts';

/** Account-scoped follow access; no private state is fetched while reading cards. */
export function profileFollows(controller: Pick<PublicProfiles, 'perform'>) {
  return {
    async inspect(target: string): Promise<ProfileFollow | null> {
      const own = ownPublicProfile(await controller.perform('state', {}));
      if (!own) throw new Error('Create your public profile to follow.');
      if (own.profile.id === target) return null;
      return profileFollow(
        await controller.perform('follow-state', { target }),
      );
    },
    async set(target: string, state: ProfileFollow): Promise<ProfileFollow> {
      return profileFollow(
        await controller.perform('follow', {
          target,
          following: !state.following,
          revision: state.revision,
        }),
      );
    },
  };
}
