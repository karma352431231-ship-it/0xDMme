import { t, translatedError } from '../../shared/i18n/index.ts';
import { gifUrls } from '../gif-search/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { showPostExternalMedia } from './post-external-media.ts';
import { communityPost } from '../../shared/community-posts/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import {
  showPublicPostMedia,
  showPublicAvatar,
} from '../public-media/index.ts';
import { communityRead } from './controller.ts';
import { communityElement as el } from './elements.ts';
import { postPreview } from './post-preview.ts';
import { communityIcon, postHeader } from './presentation.ts';

interface Place {
  id: string;
  name: string;
}
const postHref = (post: CommunityPost) =>
  `#comunidades?id=${post.community}&post=${post.id}`;

/** “↩ Resposta” chip in a reply's header, so replies never pass for posts. */
export function markReply(card: HTMLElement): void {
  card.classList.add('community-post-is-reply');
  const chip = el('span', t('Resposta'), 'post-kind-reply');
  chip.prepend(communityIcon('reply'));
  // Right after the author's @, before badges and the byline.
  const author = card.querySelector('.community-post-author');
  if (author) author.after(chip);
  else card.querySelector('.community-post-identity')?.append(chip);
}

/**
 * The post a reply answers, shown whole (title, text with Ver tudo, media)
 * above the reply. Public content only; the card opens that post's discussion.
 */
export function repliedPost(input: {
  parent: CommunityPost;
  community: Place;
  /** The thread's first post, linked when the reply answers another reply. */
  root?: CommunityPost;
  signal: AbortSignal;
  kind?: 'reply' | 'share';
  privacy?: ExternalMediaConsent;
}): HTMLElement {
  const { parent, root } = input;
  const section = el('section', '', 'replied-post');
  section.setAttribute(
    'aria-label',
    input.kind === 'share'
      ? t('Postagem compartilhada')
      : t('Postagem respondida'),
  );
  if (input.kind !== 'share')
    section.append(
      el(
        'p',
        parent.author
          ? t('Em resposta a @{0}', [parent.author.handle])
          : t('Em resposta a uma conta removida'),
        'replied-post-label',
      ),
    );
  const quoted = el('article', '', 'replied-post-card');
  section.append(quoted);
  if (parent.status !== 'visible') {
    quoted.append(
      el(
        'p',
        input.kind === 'share'
          ? t('Postagem compartilhada indisponível.')
          : t('Postagem respondida indisponível.'),
      ),
    );
    return section;
  }
  quotedContent(quoted, input);
  if (root && root.id !== parent.id) {
    const original = anchor(
      t('Postagem original: {0}', [root.title || t('sem título')]),
      postHref(root),
    );
    original.className = 'replied-post-root';
    section.append(original);
  }
  return section;
}
function quotedContent(
  quoted: HTMLElement,
  input: Parameters<typeof repliedPost>[0],
): void {
  const { parent, community, signal, privacy } = input;
  const avatar = postHeader(quoted, parent, community, 'community');
  if (parent.author?.avatar)
    showPublicAvatar(avatar, {
      kind: 'avatar',
      target: parent.author.id,
      reference: parent.author.avatar,
      signal,
    });
  if (!parent.parent && parent.title) quoted.append(el('h3', parent.title));
  if (parent.text)
    quoted.append(
      postPreview(parent.text, privacy ? gifUrls(parent.text) : []),
    );
  if (privacy) showPostExternalMedia(quoted, parent.text, { privacy, signal });
  if (parent.media?.length) showPublicPostMedia(quoted, parent.media, signal);
  const open = anchor(t('Ver postagem completa'), postHref(parent));
  open.className = 'replied-post-open';
  quoted.append(open);
  quoted.addEventListener('click', (event) => openFromCard(event, open));
}
function anchor(text: string, href: string): HTMLAnchorElement {
  const node = el('a', text);
  node.href = href;
  return node;
}

/**
 * Above an opened reply: reads the answered post the same way the reply was
 * read (members through their signed access, visitors through the public
 * read) and inserts it before the reply.
 */
export async function showRepliedAbove(input: {
  reply: Element | null;
  post: CommunityPost;
  community: Place | null;
  member: boolean;
  privacy: ExternalMediaConsent;
  request: (
    operation: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
  valid: () => boolean;
  signal: AbortSignal;
}): Promise<void> {
  const { reply, post } = input;
  if (!post.parent || !(reply instanceof HTMLElement)) return;
  let parent: CommunityPost;
  try {
    parent = communityPost(
      input.member
        ? await input.request('post-public', {
            id: post.community,
            post: post.parent,
          })
        : await communityRead(
            `/api/communities/${post.community}/posts/${post.parent}`,
            input.signal,
          ),
    );
  } catch (error: unknown) {
    if (!input.valid()) return;
    // The reply stays readable; only its context failed to load.
    const fallback = el('section', '', 'replied-post');
    fallback.append(
      el(
        'p',
        error instanceof Error
          ? t('Postagem respondida indisponível: {0}', [
              translatedError(error.message),
            ])
          : t('Postagem respondida indisponível.'),
        'replied-post-label',
      ),
    );
    reply.before(fallback);
    return;
  }
  if (!input.valid() || !reply.isConnected) return;
  reply.before(
    repliedPost({
      parent,
      community: input.community ?? { id: post.community, name: '' },
      signal: input.signal,
      privacy: input.privacy,
    }),
  );
}

function openFromCard(event: MouseEvent, open: HTMLAnchorElement): void {
  if (!(event.target instanceof Element)) return;
  if (
    event.target.closest(
      'a, button, summary, details, video, audio, img, input, textarea',
    ) ||
    window.getSelection()?.toString()
  )
    return;
  // The reply card around it would otherwise open the reply instead.
  event.preventDefault();
  open.click();
}
