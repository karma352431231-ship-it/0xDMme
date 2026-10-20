import { t } from '../../shared/i18n/index.ts';
import type { FeedEntry } from '../../shared/community-discovery/index.ts';
import { postState } from '../../shared/community-posts/index.ts';
import type {
  CommunityPost,
  PostState,
} from '../../shared/community-posts/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { gifUrls } from '../gif-search/index.ts';
import { showIdentityPhoto } from '../public-identity/index.ts';
import { showPublicPostMedia } from '../public-media/index.ts';
import { appendReplyContext, entryCard } from './activity-entry.ts';
import type { Communities } from './controller.ts';
import { preferenceControls, postVoting } from './discovery-controls.ts';
import { communityElement as el } from './elements.ts';
import { feedFollowControl } from './feed-follow.ts';
import type { FeedProfileFollows } from './feed-follow.ts';
import { feedReply } from './feed-reply.ts';
import { showPostExternalMedia } from './post-external-media.ts';
import { postManagementMenu } from './post-menu.ts';
import { postPreview } from './post-preview.ts';
import { postSharing } from './post-sharing.ts';
import { postViews } from './post-views.ts';
import { postHeader, postTagLink } from './presentation.ts';
import { highlightPostSearch } from './search-highlight.ts';

interface FeedCardOptions {
  search?: string;
  controller: Communities;
  profiles: FeedProfileFollows;
  privacy: ExternalMediaConsent;
  signal: AbortSignal;
  signedIn: boolean;
  chooseOnMobile: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  valid: () => boolean;
  changed: () => Promise<void>;
  followChanged: () => Promise<void>;
  addCleanup: (cleanup: () => void) => void;
}

/** A card owns its presentation/actions; discovery owns page state and disposal. */
export function renderFeedCard(
  entry: FeedEntry,
  options: FeedCardOptions,
): HTMLElement {
  const post = entry.post;
  const { controller, privacy, signal, signedIn, run, valid, changed } =
    options;
  const row = entryCard(post);
  const title = row.querySelector('h2');
  if (title && options.search) highlightPostSearch(title, options.search);
  const avatar = postHeader(row, post, entry.community);
  appendReplyContext(row, entry, signal, privacy);
  followControl(row, entry, options);
  options.addCleanup(showIdentityPhoto(avatar, post.author, signal));
  postContent(row, post, options);
  const toolbar = el('div', '', 'post-actions');
  row.append(toolbar);
  const actions = {
    controller,
    run,
    valid,
    changed,
  };
  postVoting(
    toolbar,
    post,
    signedIn
      ? {
          ...actions,
          position: entry.viewerVote,
          changed: async (state) => {
            if (!state || state.post.status !== 'visible') {
              await changed();
              return;
            }
            paintVote(toolbar, entry, state);
          },
        }
      : null,
  );
  options.addCleanup(
    feedReply(
      toolbar,
      post,
      signedIn
        ? {
            ...actions,
            canReply: async () =>
              (await controller.state(post.community)).canPost,
            media: {
              community: post.community,
              request: (op, data) => controller.request(op, data),
              valid: actions.valid,
              signal,
              privacy,
            },
          }
        : null,
    ),
  );
  postSharing(
    toolbar,
    post,
    signedIn ? { ...actions, shared: entry.viewerShared } : null,
  );
  options.addCleanup(postViews(row, post, toolbar));
  if (signedIn) {
    preferenceControls(toolbar, post, {
      ...actions,
      saved: entry.viewerSaved,
      options: (host) => managementMenu(host, post, options),
    });
  }
  return row;
}

/** A confirmed vote must not reload the page or discard its media/reply draft. */
function paintVote(
  toolbar: HTMLElement,
  entry: FeedEntry,
  state: PostState,
): void {
  entry.post.score = state.post.score;
  entry.viewerVote = state.vote.position;
  const controls = toolbar.querySelector('.post-votes');
  for (const node of controls?.querySelectorAll<HTMLButtonElement>('button') ??
    []) {
    const position = node.dataset['vote'];
    if (position !== undefined)
      node.setAttribute(
        'aria-pressed',
        String(Number(position) === state.vote.position),
      );
  }
  const score = controls?.querySelector('.post-score');
  if (score) score.textContent = String(state.post.score);
}

function followControl(
  row: HTMLElement,
  entry: FeedEntry,
  options: FeedCardOptions,
): void {
  const header = row.querySelector<HTMLElement>('.community-post-header');
  if (!header || !options.signedIn || entry.ownCommunity) return;
  feedFollowControl(
    header,
    { community: entry.community, author: entry.post.author },
    {
      controller: options.controller,
      profiles: options.profiles,
      run: options.run,
      valid: options.valid,
      changed: () => options.followChanged(),
      signal: options.signal,
      chooseOnMobile: options.chooseOnMobile,
    },
  );
}

function postContent(
  row: HTMLElement,
  post: CommunityPost,
  options: FeedCardOptions,
): void {
  if (post.status === 'visible') {
    row.append(postPreview(post.text, gifUrls(post.text), options.search));
    options.addCleanup(
      showPostExternalMedia(row, post.text, {
        privacy: options.privacy,
        signal: options.signal,
      }),
    );
    if (post.media?.length)
      options.addCleanup(showPublicPostMedia(row, post.media, options.signal));
    else if (!post.text) row.append(el('p', t('Media awaiting approval.')));
    postTagLink(row, post);
  } else
    row.append(
      el(
        'p',
        post.status === 'deleted'
          ? t('Content deleted by the author.')
          : t('Content hidden by moderation.'),
      ),
    );
}

function managementMenu(
  host: HTMLElement,
  post: CommunityPost,
  options: FeedCardOptions,
) {
  return postManagementMenu(host, post, {
    run: options.run,
    request: (op, data) => options.controller.request(op, data),
    media: {
      community: post.community,
      request: (op, data) => options.controller.request(op, data),
      valid: options.valid,
      signal: options.signal,
    },
    mutate: (op, data) =>
      options.run(async () => {
        const payload = typeof data === 'function' ? await data() : data;
        if (!options.valid()) return;
        postState(await options.controller.request(op, payload));
        if (options.valid()) await options.changed();
      }),
  });
}
