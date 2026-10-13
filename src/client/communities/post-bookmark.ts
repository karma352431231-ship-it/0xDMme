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
        showToast(
          value.saved ? 'Postagem salva.' : 'Postagem removida dos salvos.',
        );
      } catch (error: unknown) {
        if (actions.valid())
          showToast(
            error instanceof Error
              ? error.message
              : 'Não foi possível salvar. Tente novamente.',
          );
        throw error;
      }
    }),
  );
  save.className = 'post-action post-save';
  function paint(saved: boolean): void {
    save.replaceChildren(
      communityIcon('bookmark'),
      el('span', saved ? 'Salvo' : 'Salvar', 'post-action-caption'),
    );
    save.setAttribute('aria-pressed', String(saved));
    save.setAttribute(
      'aria-label',
      saved ? 'Remover postagem dos salvos' : 'Salvar postagem',
    );
    save.title = saved ? 'Postagem salva' : 'Salvar postagem';
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
