import { appHref } from '../../shared/app-routes/index.ts';
import { t } from '../../shared/i18n/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { communityElement as el } from './elements.ts';
import { iconLabel } from './presentation.ts';

/** The public address of a post or reply; it opens that item in its discussion. */
export function postShareUrl(
  post: Pick<CommunityPost, 'id' | 'community'>,
): string {
  return (
    location.origin +
    appHref(
      'communities',
      new URLSearchParams({ id: post.community, post: post.id }),
    )
  );
}

/** "Copy link" row for the post options menu; it says whether the copy worked. */
export function postLinkControl(
  container: HTMLElement,
  post: Pick<CommunityPost, 'id' | 'community'>,
): HTMLButtonElement {
  const copy = el('button', '', 'post-copy-link');
  copy.type = 'button';
  const paint = (label: string) => {
    copy.textContent = label;
    iconLabel(copy, 'link');
  };
  paint(t('Copy link'));
  let reset: ReturnType<typeof setTimeout> | undefined;
  // The result shows for a moment, then the row reads "Copy link" again.
  const settle = (label: string) => {
    paint(label);
    clearTimeout(reset);
    reset = setTimeout(() => {
      if (copy.isConnected) paint(t('Copy link'));
    }, 2000);
  };
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(postShareUrl(post)).then(
      () => settle(t('Link copied.')),
      () => settle(t('Could not copy the link.')),
    );
  });
  container.append(copy);
  return copy;
}
