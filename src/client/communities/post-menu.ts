import { postState, tagPage } from '../../shared/community-posts/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { postActions } from './post-forms.ts';
import type { PostActions } from './post-forms.ts';
import { communityRead } from './controller.ts';
/** Lazily load authority once the menu is opened, on every timeline surface. */
export async function postManagementMenu(
  host: HTMLElement,
  post: CommunityPost,
  access: PostActions,
) {
  const state = postState(
    await access.request('post-state', { id: post.community, post: post.id }),
  );
  const load = async (after: string | null) =>
    tagPage(
      await communityRead(
        `/api/communities/${post.community}/tags${after ? '?after=' + encodeURIComponent(after) : ''}`,
        AbortSignal.any([access.media.signal, AbortSignal.timeout(8000)]),
      ),
    );
  const tags =
    state.canEdit && !post.parent
      ? await load(null)
      : { items: [], next: null };
  if (!access.media.valid()) return;
  host.replaceChildren();
  postActions(host, state, { page: tags, run: access.run, load }, access);
  return state;
}
