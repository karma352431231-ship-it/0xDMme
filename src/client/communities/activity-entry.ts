import type { FeedEntry } from '../../shared/community-discovery/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { communityCard as card, communityElement as el } from './elements.ts';
import { postHeader, postTagLink, postComments } from './presentation.ts';
import { postPreview } from './post-preview.ts';
import { sharedEntry } from './shared-context.ts';
import { markReply, repliedPost } from './reply-context.ts';
import { showPublicPostMedia } from '../public-media/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { showExternalVideos } from '../external-video/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';

/** Posts lead with their title; replies have none and are marked as replies. */
export function entryCard(post: CommunityPost): HTMLElement {
  const row = post.parent
    ? el('article', '', 'card community-card')
    : card(post.title || 'Postagem');
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
): void {
  if (entry.post.parent) markReply(row);
  if (!entry.context) return;
  row.append(
    repliedPost({
      parent: entry.context.parent,
      root: entry.context.root,
      community: entry.community,
      signal,
    }),
  );
}
export function renderActivityEntry(
  entry: FeedEntry,
  signal: AbortSignal,
  privacy?: ExternalMediaConsent,
): HTMLElement {
  const { post, community } = entry;
  const row = entry.share ? sharedEntry(entry, signal) : entryCard(post);
  if (entry.share) return row;
  const avatar = postHeader(row, post, community);
  if (community.avatar)
    showPublicAvatar(avatar, {
      kind: 'community-photo',
      target: community.id,
      reference: community.avatar,
      signal,
    });
  appendReplyContext(row, entry, signal);
  row.append(postPreview(post.text));
  if (privacy) showExternalVideos(row, post.text, { privacy, signal });
  if (post.media?.length) showPublicPostMedia(row, post.media, signal);
  postTagLink(row, post);
  const actions = el('div', '', 'post-actions');
  actions.append(el('span', `${post.score} votos`));
  postComments(actions, post);
  row.append(actions);
  return row;
}
