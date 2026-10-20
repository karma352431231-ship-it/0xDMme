import { t, translatedError } from '../../shared/i18n/index.ts';
import type { FeedEntry } from '../../shared/community-discovery/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import type { Communities } from './controller.ts';
import {
  communityElement as el,
  communityButton as button,
} from './elements.ts';
import { communityIcon } from './presentation.ts';
import { togglePostPreference } from './post-interactions.ts';
import { showToast } from '../toast/index.ts';
interface BookmarkActions {
  controller: Pick<Communities, 'request'>;
  run: (work: () => Promise<void>) => Promise<void>;
  valid: () => boolean;
  saved?: boolean | undefined;
}
/** The server-confirmed state leads; failures never show a saved bookmark. */
export function postBookmark(
  container: HTMLElement,
  post: CommunityPost,
  actions: BookmarkActions,
): void {
  const save = button(container, '', () =>
    actions.run(async () => {
      try {
        const value = await togglePostPreference(post, 'saved', actions);
        if (!value) return;
        paint(value.saved);
        if (value.saved) showToast(t('Post saved.'), { success: true });
        else showToast(t('Post removed from saved items.'));
      } catch (error: unknown) {
        if (actions.valid())
          showToast(
            error instanceof Error
              ? translatedError(error.message)
              : t('Could not save. Try again.'),
          );
        throw error;
      }
    }),
  );
  save.className = 'post-action post-save';
  function paint(saved: boolean): void {
    save.replaceChildren(
      communityIcon('bookmark'),
      el('span', saved ? t('Saved') : t('Save'), 'post-action-caption'),
    );
    save.setAttribute('aria-pressed', String(saved));
    save.setAttribute(
      'aria-label',
      saved ? t('Remove post from saved items') : t('Save post'),
    );
    save.title = saved ? t('Saved post') : t('Save post');
  }
  paint(actions.saved ?? post.viewer?.saved ?? false);
}

/** A new session must not inherit the previous viewer's bookmark from a mounted public card. */
export function withoutBookmarkState(entry: FeedEntry): FeedEntry {
  const clean = { ...entry, post: { ...entry.post } };
  delete clean.viewerSaved;
  if (clean.post.viewer) {
    clean.post.viewer = { ...clean.post.viewer };
    delete clean.post.viewer.saved;
  }
  return clean;
}
