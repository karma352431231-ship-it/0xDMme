import { countShareClick } from './share-click.ts';
import { postLinkSharing } from './post-link-sharing.ts';
import { currentLanguage, t } from '../../shared/i18n/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { postShareState } from '../../shared/post-sharing/index.ts';
import type { Communities } from './controller.ts';
import { communityElement as el } from './elements.ts';
import { communityIcon } from './presentation.ts';

export function postSharing(
  container: HTMLElement,
  post: CommunityPost,
  access: {
    controller: Pick<Communities, 'request'>;
    run: (work: () => Promise<void>) => Promise<void>;
    valid: () => boolean;
    shared?: boolean | undefined;
  } | null,
): void {
  if (post.status !== 'visible') return;
  postLinkSharing(container, post);
  const button = access ? el('button') : el('a');
  button.className = 'post-action post-share';
  // Public count of profiles sharing the post; older payloads omit it.
  const count = el('span', '', 'post-share-count');
  let shares = post.shares ?? null;
  const paintCount = () => {
    count.hidden = shares === null;
    count.textContent = shares?.toLocaleString(currentLanguage()) ?? '';
  };
  paintCount();
  button.append(communityIcon('share'), count);
  container.append(button);
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-pressed') === 'true') return;
    void countShareClick(post)
      .catch(() => false)
      .then((counted) => {
        if (!counted && button.isConnected)
          button.title = t('ranking.share-count-failed');
      });
  });
  if (button instanceof HTMLAnchorElement) button.href = '#settings';
  if (!(button instanceof HTMLButtonElement) || !access) {
    button.setAttribute('aria-label', t('Sign in through Profile to share'));
    return;
  }
  button.type = 'button';
  const paint = (shared: boolean) => {
    button.setAttribute('aria-pressed', String(shared));
    button.setAttribute(
      'aria-label',
      shared ? t('Remove share from my profile') : t('Share on my profile'),
    );
    button.title = shared ? t('Shared') : t('Share');
  };
  paint(access.shared ?? false);
  button.addEventListener('click', () => {
    void access.run(async () => {
      const payload = { id: post.community, post: post.id };
      const old = postShareState(
        await access.controller.request('discovery-share', payload),
      );
      if (!access.valid()) return;
      const result = postShareState(
        await access.controller.request('discovery-share-set', {
          ...payload,
          state: { shared: !old.shared, revision: old.revision },
        }),
      );
      if (!access.valid()) return;
      if (shares !== null && result.shared !== old.shared)
        shares = Math.max(0, shares + (result.shared ? 1 : -1));
      paintCount();
      paint(result.shared);
      window.dispatchEvent(
        new CustomEvent('0xdmme-post-share', {
          detail: { post: post.id, shared: result.shared },
        }),
      );
    });
  });
}
