import { t } from '../../shared/i18n/index.ts';
import { appHref } from '../../shared/app-routes/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { observePublicAction } from '../public-traffic/index.ts';
import { communityElement as el } from './elements.ts';

export async function performPublicShare(
  input: { kind: 'share' | 'copy'; url: string },
  actions: {
    share: (url: string) => Promise<void>;
    copy: (url: string) => Promise<void>;
  },
  observe: (kind: 'share' | 'copy') => void,
): Promise<'shared' | 'copied'> {
  observe('share');
  if (input.kind === 'share') {
    await actions.share(input.url);
    return 'shared';
  }
  await actions.copy(input.url);
  observe('copy');
  return 'copied';
}

/** Independent link actions, beside the existing public-profile repost control. */
export function postLinkSharing(
  container: HTMLElement,
  post: CommunityPost,
): void {
  if (post.status !== 'visible' || post.parent !== null) return;
  const modes = (['share', 'copy'] as const).filter(available);
  if (!modes.length) return;
  const target = {
    category: 'post' as const,
    community: post.community,
    post: post.id,
  };
  const url = new URL(
    appHref(
      'communities',
      new URLSearchParams({ id: post.community, post: post.id }),
    ),
    location.origin,
  ).href;
  const status = el('span', '', 'post-link-status');
  status.setAttribute('role', 'status');
  let busy = false;
  async function run(kind: 'share' | 'copy'): Promise<void> {
    if (busy || !container.isConnected) return;
    busy = true;
    try {
      const result = await performPublicShare(
        { kind, url },
        {
          share: (value) => navigator.share({ url: value }),
          copy: (value) => navigator.clipboard.writeText(value),
        },
        (action) => observePublicAction(target, action),
      );
      if (container.isConnected)
        status.textContent =
          result === 'copied'
            ? t('Link copied.')
            : t('The browser received the sharing request.');
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
  for (const kind of modes) {
    const button = el(
      'button',
      kind === 'share' ? t('Share link') : t('Copy link'),
      'post-action post-link-action',
    );
    button.type = 'button';
    button.addEventListener('click', () => {
      void run(kind);
    });
    container.append(button);
  }
  container.append(status);
}

function available(kind: 'share' | 'copy'): boolean {
  if (typeof navigator === 'undefined') return false;
  return kind === 'share'
    ? typeof navigator.share === 'function'
    : typeof navigator.clipboard?.writeText === 'function';
}
