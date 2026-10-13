import { t } from '../../shared/i18n/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import type { FeedEntry } from '../../shared/community-discovery/index.ts';
import { communityElement as el } from './elements.ts';
import { postHeader, communityIcon } from './presentation.ts';
import { repliedPost } from './reply-context.ts';
import { showPublicAvatar } from '../public-media/index.ts';

export function sharedEntry(
  entry: FeedEntry,
  signal: AbortSignal,
  privacy?: ExternalMediaConsent,
): HTMLElement {
  const share = entry.share!;
  const row = el(
    'article',
    '',
    'card community-card community-post community-post-is-share',
  );
  row.dataset['postId'] = entry.post.id;
  const avatar = postHeader(
    row,
    {
      ...entry.post,
      author: share.author,
      authorBadges: [],
      createdAt: share.createdAt,
      editedAt: null,
    },
    entry.community,
    'community',
  );
  const chip = el('span', t('Compartilhou'), 'post-kind-reply post-kind-share');
  chip.prepend(communityIcon('share'));
  row.querySelector('.community-post-author')?.after(chip);
  if (share.author.avatar)
    showPublicAvatar(avatar, {
      kind: 'avatar',
      target: share.author.id,
      reference: share.author.avatar,
      signal,
    });
  row.append(
    repliedPost({
      parent: entry.post,
      community: entry.community,
      signal,
      kind: 'share',
      ...(privacy ? { privacy } : {}),
    }),
  );
  return row;
}
