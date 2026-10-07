import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { postState } from '../../shared/community-posts/index.ts';
import { postPreference } from '../../shared/community-discovery/index.ts';
import type { Communities } from './controller.ts';

interface Interaction {
  controller: Pick<Communities, 'request'>;
  valid: () => boolean;
}
export async function togglePostVote(
  post: CommunityPost,
  position: 1 | -1,
  access: Interaction,
): Promise<void> {
  if (!access.valid()) return;
  const payload = { id: post.community, post: post.id },
    state = postState(await access.controller.request('post-state', payload));
  if (!access.valid()) return;
  postState(
    await access.controller.request('post-vote', {
      ...payload,
      position: state.vote.position === position ? 0 : position,
      voteRevision: state.vote.revision,
    }),
  );
}
export async function togglePostPreference(
  post: CommunityPost,
  key: 'saved' | 'hidden',
  access: Interaction,
) {
  if (!access.valid()) return null;
  const payload = { id: post.community, post: post.id },
    value = postPreference(
      await access.controller.request('discovery-preference', payload),
    );
  if (!access.valid()) return null;
  const result = postPreference(
    await access.controller.request('discovery-preference-set', {
      ...payload,
      preference: { ...value, [key]: !value[key] },
    }),
  );
  return access.valid() ? result : null;
}
