import type { FeedEntry } from '../../shared/community-discovery/index.ts';
import {
  communityCard as card,
  communityElement as el,
  communityLink as link,
} from './elements.ts';
import { postHeader, postTagLink, postComments } from './presentation.ts';
import { postText } from './post-text.ts';
import { showPublicPostMedia } from '../public-media/index.ts';

/** Replies always lead back to the public community and original discussion. */
export function appendReplyContext(row: HTMLElement, entry: FeedEntry): void {
  if (!entry.context) return;
  const { root, parent } = entry.context;
  const context = el('div', '', 'profile-reply-context');
  link(
    context,
    root.title || 'Postagem original',
    `#comunidades?id=${root.community}&post=${root.id}`,
  );
  context.append(
    el(
      'p',
      parent.author
        ? `Respondeu a @${parent.author.handle}`
        : 'Resposta na discussão',
    ),
  );
  if (parent.id !== root.id)
    context.append(
      el(
        'blockquote',
        parent.status === 'visible'
          ? parent.text.slice(0, 240)
          : 'Resposta anterior indisponível.',
      ),
    );
  row.append(context);
}
export function renderActivityEntry(
  entry: FeedEntry,
  signal: AbortSignal,
): HTMLElement {
  const { post, community } = entry;
  const row = card(post.parent ? 'Resposta' : post.title || 'Postagem');
  row.classList.add('community-post');
  row.dataset['postId'] = post.id;
  postHeader(row, post, community);
  appendReplyContext(row, entry);
  postTagLink(row, post);
  row.append(postText(post.text));
  if (post.media?.length) showPublicPostMedia(row, post.media, signal);
  const actions = el('div', '', 'post-actions');
  actions.append(el('span', `${post.score} votos`));
  postComments(actions, post);
  row.append(actions);
  return row;
}
