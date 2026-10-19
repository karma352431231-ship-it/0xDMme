import { t } from '../../shared/i18n/index.ts';
import { gifUrls } from '../gif-search/index.ts';
import type { FeedEntry } from '../../shared/community-discovery/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { communityCard as card, communityElement as el } from './elements.ts';
import { postHeader, postTagLink, postComments } from './presentation.ts';
import { postPreview } from './post-preview.ts';
import { sharedEntry } from './shared-context.ts';
import { markReply, repliedPost } from './reply-context.ts';
import { showPublicPostMedia } from '../public-media/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { showPostExternalMedia } from './post-external-media.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';

/** Posts lead with their title; replies have none and are marked as replies. */
export function entryCard(post: CommunityPost): HTMLElement {
  const row = post.parent
    ? el('article', '', 'card community-card')
    : card(post.title || t('Post'));
  row.classList.add('community-post');
  row.dataset['postId'] = post.id;
  return row;
}
/**
 * A reply in a feed or profile: marked in its header and preceded by the
 * whole post it answers, which leads back to the original discussion.
 */
export function appendReplyContext(
  row: HTMLElement,
  entry: FeedEntry,
  signal: AbortSignal,
  privacy?: ExternalMediaConsent,
): void {
  if (entry.post.parent) markReply(row);
  if (!entry.context) return;
  row.append(
    repliedPost({
      parent: entry.context.parent,
      root: entry.context.root,
      community: entry.community,
      signal,
      ...(privacy ? { privacy } : {}),
    }),
  );
}
export function renderActivityEntry(
  entry: FeedEntry,
  signal: AbortSignal,
  privacy?: ExternalMediaConsent,
): HTMLElement {
  const { post, community } = entry;
  const row = entry.share
    ? sharedEntry(entry, signal, privacy)
    : entryCard(post);
  if (entry.share) return row;
  const avatar = postHeader(row, post, community);
  if (post.author?.avatar)
    showPublicAvatar(avatar, {
      kind: 'avatar',
      target: post.author.id,
      reference: post.author.avatar,
      signal,
    });
  appendReplyContext(row, entry, signal, privacy);
  row.append(postPreview(post.text, privacy ? gifUrls(post.text) : []));
  if (privacy) showPostExternalMedia(row, post.text, { privacy, signal });
  if (post.media?.length) showPublicPostMedia(row, post.media, signal);
  postTagLink(row, post);
  const actions = el('div', '', 'post-actions');
  actions.append(el('span', t('{0} votes', [post.score])));
  postComments(actions, post);
  row.append(actions);
  return row;
}
