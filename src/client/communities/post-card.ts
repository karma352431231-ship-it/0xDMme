import type { CommunityState } from '../../shared/communities/index.ts';
import type {
  CommunityPost,
  PostState,
} from '../../shared/community-posts/index.ts';
import { postState } from '../../shared/community-posts/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { restrictedMedia } from '../community-media/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { gifUrls } from '../gif-search/index.ts';
import {
  showPublicAvatar,
  showPublicPostMedia,
} from '../public-media/index.ts';
import { Communities } from './controller.ts';
import { postVoting, preferenceControls } from './discovery-controls.ts';
import {
  communityCard as card,
  communityElement as el,
  communityLink as link,
} from './elements.ts';
import { inlinePostReply } from './inline-post-reply.ts';
import { showPostExternalMedia } from './post-external-media.ts';
import type { PostActions, PostTags } from './post-forms.ts';
import { postActions } from './post-forms.ts';
import { postInteractionSelection } from './post-interactions.ts';
import { postPreview } from './post-preview.ts';
import { postSharing } from './post-sharing.ts';
import { postText } from './post-text.ts';
import { postViews } from './post-views.ts';
import {
  postComments,
  postHeader,
  postPendingMedia,
  postTagLink,
} from './presentation.ts';
import { publicUpvoteScore } from './upvoters.ts';

export interface PostCardContext {
  community: string;
  identity: { id: string; name: string; avatar: string | null } | null;
  own: CommunityState | null;
  selected: string | null;
  privacy: ExternalMediaConsent;
  signal: AbortSignal;
}
export interface PostCardOperations {
  controller: Pick<Communities, 'request'>;
  run: PostActions['run'];
  mutate: PostActions['mutate'];
  tags: () => PostTags;
  changed: () => Promise<void>;
  notice: (text: string) => void;
}
/** Owns card nodes, observers, media and the lifetime of restricted options. */
export function createPostCards(
  context: PostCardContext,
  operations: PostCardOperations,
) {
  const { community, identity, own, selected, privacy, signal } = context;
  const { controller, run, mutate, changed, notice } = operations;
  let active = true,
    privateGeneration = 0;
  const cards = new Set<HTMLElement>();
  const mediaCleanup = new Map<() => void, HTMLElement>();
  const valid = () => active && !signal.aborted;
  const abort = { signal };
  function clearMedia(container?: HTMLElement): void {
    for (const [cleanup, node] of mediaCleanup) {
      if (container && !container.contains(node)) continue;
      cleanup();
      mediaCleanup.delete(cleanup);
    }
    for (const node of cards) {
      if (!container || container.contains(node)) cards.delete(node);
    }
  }
  function mediaAccess() {
    return {
      community,
      request: (operation: string, payload: Record<string, unknown>) =>
        controller.request(operation, payload),
      valid,
      signal,
      privacy,
    };
  }
  function actions(): PostActions {
    return {
      run,
      request: (op, data) => controller.request(op, data),
      mutate,
      media: mediaAccess(),
    };
  }
  function tagSource(): PostTags {
    return operations.tags();
  }
  function row(
    value: CommunityPost,
    privateState: PostState | null = null,
    container: HTMLElement | null = null,
  ): HTMLElement | null {
    if (!container) return null;
    const node = postCard(value);
    cards.add(node);
    node.dataset['postId'] = value.id;
    container.append(node);
    rowHeader(node, value);
    rowContent(node, value, privateState);
    rowMeta(node, value);
    const toolbar = el('div', '', 'post-actions');
    node.append(toolbar);
    voting(toolbar, value, privateState);
    if (selected) replyToggle(toolbar, value);
    else postComments(toolbar, value);

    postSharing(
      toolbar,
      value,
      own
        ? {
            controller,
            run,
            valid: valid,
            shared: postInteractionSelection(value, privateState).shared,
          }
        : null,
    );
    mediaCleanup.set(postViews(node, value, toolbar), node);
    if (!own) return node;

    preferenceControls(toolbar, value, {
      controller,
      run,
      valid: valid,
      changed: async () => {
        await changed();
      },
      options: async (options) => {
        const privateVersion = privateGeneration,
          state = postState(
            await controller.request('post-state', {
              id: community,
              post: value.id,
            }),
          );
        if (!valid() || privateVersion !== privateGeneration) return;
        clearMedia(options);
        options.replaceChildren();
        restrictedContent(options, state);
        if (state.own && state.content?.media?.length) {
          const disposeMedia = restrictedMedia(
            options,
            state.content.media,
            mediaAccess(),
          );
          mediaCleanup.set(disposeMedia, options);
        }
        postActions(options, state, tagSource(), actions());
        return state;
      },
    });
    return node;
  }
  /** Author first, with their public photo when they have one. */
  function rowHeader(node: HTMLElement, value: CommunityPost): void {
    if (!identity) return;
    const avatar = postHeader(node, value, identity, 'community');
    if (!value.author?.avatar) return;
    mediaCleanup.set(
      showPublicAvatar(avatar, {
        kind: 'avatar',
        target: value.author.id,
        reference: value.author.avatar,
        signal: abort.signal,
      }),
      node,
    );
  }
  /**
   * Replies have no title of their own: their text is the content. The opened
   * post is the focus of the page; replies under it read as a thread.
   */
  function postCard(value: CommunityPost): HTMLElement {
    const node = value.parent
      ? el('article', '', 'card community-card')
      : card(value.title || t('Post'));
    if (value.parent && value.title) node.append(el('h2', value.title));
    node.classList.add('community-post');
    if (value.parent) node.classList.add('community-post-is-reply');
    if (value.id === selected) node.classList.add('community-post-focus');
    else if (value.parent) node.classList.add('community-reply');
    return node;
  }
  function voting(
    node: HTMLElement,
    value: CommunityPost,
    state: PostState | null,
  ): void {
    if (own && !own.canPost && value.status === 'visible') {
      const score = publicUpvoteScore(value);
      score.title = t('Voting unavailable in this community.');
      node.append(score);
      return;
    }

    postVoting(
      node,
      value,
      own?.canPost
        ? {
            controller,
            run,
            position: postInteractionSelection(value, state).vote,
            valid: valid,
            changed: (state) => {
              const score = node.querySelector('.post-score');
              if (score && state) score.textContent = String(state.post.score);
              notice(t('Change saved.'));
              return Promise.resolve();
            },
          }
        : null,
    );
  }
  function replyToggle(toolbar: HTMLElement, parent: CommunityPost): void {
    const closeReply = inlinePostReply(
      toolbar,
      parent,
      own?.canPost
        ? {
            controller,
            run,
            valid: valid,
            canReply: () => Promise.resolve(own?.canPost ?? false),
            media: mediaAccess(),
            replied: async () => {
              await changed();
              notice(t('Reply published.'));
            },
          }
        : null,
    );
    mediaCleanup.set(closeReply, toolbar);
  }
  function restrictedContent(node: HTMLElement, state: PostState): void {
    if (state.content && state.post.status === 'removed')
      node.append(
        el('p', t('Content restricted to the author and managers.')),
        el('h3', state.content.title),
        postText(state.content.text),
      );
  }
  function rowContent(
    node: HTMLElement,
    value: CommunityPost,
    state: PostState | null,
  ): void {
    if (value.status !== 'visible')
      node.append(
        el(
          'p',
          value.status === 'deleted'
            ? t('Post deleted by the author.')
            : t('Post hidden by moderation.'),
        ),
      );
    if (state) restrictedContent(node, state);
    if (value.status !== 'visible') return;
    if (value.text)
      node.append(
        value.id === selected
          ? postText(value.text, gifUrls(value.text))
          : postPreview(value.text, gifUrls(value.text)),
      );
    mediaCleanup.set(
      showPostExternalMedia(node, value.text, {
        privacy,
        signal: abort.signal,
      }),
      node,
    );
    if (value.media?.length)
      mediaCleanup.set(
        showPublicPostMedia(node, value.media, abort.signal),
        node,
      );
    postPendingMedia(node, value);
    postTagLink(node, value);
  }
  function rowMeta(node: HTMLElement, value: CommunityPost): void {
    if (!value.parent) return;
    const nav = el('nav', '', 'post-context');
    nav.setAttribute('aria-label', t('Reply navigation'));
    const post = (id: string | null) =>
      `#communities?id=${community}&post=${id}`;
    if (value.id === selected) {
      // An opened reply has the answered post above it (reply-context.ts);
      // a deeper reply also links to the thread's first post.
      if (value.root !== value.parent) {
        link(nav, t('Original post'), post(value.root));
        node.prepend(nav);
      }
      return;
    }
    if (selected) return;
    link(nav, t('Open reply and its thread'), post(value.id));
    node.append(nav);
  }

  function closePrivate(): void {
    privateGeneration++;
    for (const card of cards)
      for (const node of card.querySelectorAll<HTMLElement>('.post-options')) {
        clearMedia(node);
        node.replaceChildren();
      }
  }
  return {
    render: row,
    clear: clearMedia,
    closePrivate,
    privateGuard: () => {
      const version = privateGeneration;
      return () => valid() && version === privateGeneration;
    },
    dispose(): void {
      active = false;
      closePrivate();
      clearMedia();
    },
  };
}
