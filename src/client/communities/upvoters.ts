import { t, translatedError } from '../../shared/i18n/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { upvoterPage } from '../../shared/public-upvotes/index.ts';
import { publicIdentityAvatar } from '../public-identity/index.ts';
import { communityRead } from './controller.ts';
import { communityElement as el } from './elements.ts';

/** The net score opens a bounded page of current positive voters, never downvoters. */
export function publicUpvoteScore(post: CommunityPost): HTMLButtonElement {
  const score = el('button', String(post.score), 'post-score');
  score.type = 'button';
  score.title = t('upvote.show');
  score.addEventListener('click', () => {
    try {
      showUpvoters(post);
    } catch (error: unknown) {
      score.title =
        error instanceof Error
          ? translatedError(error.message)
          : t('Could not load.');
    }
  });
  return score;
}
function showUpvoters(post: CommunityPost): void {
  const dialog = el('dialog', '', 'public-upvoters'),
    list = el('div'),
    status = el('p'),
    more = el('button', t('upvote.more')),
    close = el('button', t('Close'));
  const lifetime = new AbortController();
  let after: string | null = null,
    busy = false,
    page = new AbortController();
  const finish = () => {
    lifetime.abort();
    page.abort();
    window.removeEventListener('hashchange', finish);
    dialog.close();
    dialog.remove();
  };
  close.type = 'button';
  more.type = 'button';
  more.hidden = true;
  status.setAttribute('role', 'status');
  dialog.setAttribute('aria-label', t('upvote.heading'));
  dialog.append(el('h2', t('upvote.heading')), list, status, more, close);
  close.addEventListener('click', finish);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    finish();
  });
  window.addEventListener('hashchange', finish, { once: true });
  const read = async () => {
    if (busy || lifetime.signal.aborted) return;
    busy = true;
    more.disabled = true;
    status.textContent = t('upvote.loading');
    try {
      const result = upvoterPage(
        await communityRead(
          `/api/communities/${post.community}/posts/${post.id}/upvoters${after ? `?after=${encodeURIComponent(after)}` : ''}`,
          AbortSignal.any([lifetime.signal, AbortSignal.timeout(10000)]),
        ),
      );
      if (lifetime.signal.aborted) return;
      page.abort();
      page = new AbortController();
      list.replaceChildren();
      for (const profile of result.items) {
        const row = el('div', '', 'public-upvoter');
        row.append(
          publicIdentityAvatar(
            profile,
            AbortSignal.any([page.signal, lifetime.signal]),
          ),
          el('span', `@${profile.handle}`),
        );
        list.append(row);
      }
      after = result.next;
      more.hidden = !after;
      status.textContent = result.items.length ? '' : t('upvote.empty');
    } catch (error: unknown) {
      if (!lifetime.signal.aborted) {
        status.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Could not load.');
        more.hidden = false;
      }
    } finally {
      busy = false;
      more.disabled = false;
    }
  };
  more.addEventListener('click', () => {
    void read();
  });
  document.body.append(dialog);
  try {
    dialog.showModal();
    void read();
  } catch (error: unknown) {
    finish();
    throw error;
  }
}
