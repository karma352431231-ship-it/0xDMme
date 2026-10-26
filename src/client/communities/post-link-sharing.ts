import { t } from '../../shared/i18n/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import {
  observePublicAction,
  performPublicShare,
} from '../public-traffic/index.ts';
import { postShareUrl } from './post-link.ts';
import { communityElement as el } from './elements.ts';

/** Independent link actions, beside the existing public-profile repost control. */
export function postLinkSharing(
  container: HTMLElement,
  post: CommunityPost,
): void {
  if (post.status !== 'visible' || post.parent !== null) return;
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function')
    return;
  const target = {
    category: 'post' as const,
    community: post.community,
    post: post.id,
  };
  const url = postShareUrl(post);
  const status = el('span', '', 'post-link-status');
  status.setAttribute('role', 'status');
  let busy = false;
  async function run(): Promise<void> {
    if (busy || !container.isConnected) return;
    busy = true;
    try {
      await performPublicShare(
        { kind: 'share', url },
        {
          share: (value) => navigator.share({ url: value }),
          copy: (value) => navigator.clipboard.writeText(value),
        },
        (action) => observePublicAction(target, action),
      );
      if (container.isConnected)
        status.textContent = t('The browser received the sharing request.');
    } catch (error) {
      if (container.isConnected)
        status.textContent =
          error instanceof DOMException && error.name === 'AbortError'
            ? t('Sharing was canceled.')
            : t('Sharing is unavailable. Try again.');
    } finally {
      busy = false;
    }
  }
  const button = el('button', t('Share link'), 'post-action post-link-action');
  button.type = 'button';
  button.addEventListener('click', () => {
    void run();
  });
  container.append(button);
  container.append(status);
}
