import type { CommunityState } from '../../shared/communities/index.ts';
import { communityState } from '../../shared/communities/index.ts';
import type {
  DiscoveryPeriod,
  FeedOrder,
} from '../../shared/community-discovery/index.ts';
import {
  feedFilter,
  feedPage,
} from '../../shared/community-discovery/index.ts';
import type {
  CommunityPost,
  PostState,
  TagPage,
} from '../../shared/community-posts/index.ts';
import {
  communityPost,
  postState,
  privatePostPage,
  tagPage,
} from '../../shared/community-posts/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { emptyCommunity } from './community-empty.ts';
import { Communities, communityRead } from './controller.ts';
import {
  discoveryMenu,
  discoveryPeriods,
  feedOrders,
} from './discovery-menu.ts';
import {
  communityButton as button,
  communityElement as el,
} from './elements.ts';
import { feedScroller } from './feed-return.ts';
import { createPostCards } from './post-card.ts';
import { replaceEditedPost } from './post-edit-update.ts';
import { PostSnapshot } from './post-snapshot.ts';
import { PostThread } from './post-thread.ts';
import { iconLabel, postTagName } from './presentation.ts';
import { showRepliedAbove } from './reply-context.ts';
/** Tags offered by the filter; a page holds many, so this bounds the requests. */
const tagMenuPages = 5;

export function startCommunityPostList(
  controller: Communities,
  privacy: ExternalMediaConsent,
  openComposer: (id: string) => void,
) {
  let mounted: HTMLElement | null = null,
    community = '',
    identity: { id: string; name: string; avatar: string | null } | null = null,
    own: CommunityState | null = null,
    selected: string | null = null;
  let generation = 0,
    busy = false,
    abort = new AbortController(),
    tags: TagPage = { items: [], next: null },
    after: string | null = null,
    tag: string | null = null,
    scope = 'public';
  let threadView: PostThread | null = null;
  const postSnapshot = new PostSnapshot(),
    pageSnapshot = new PostSnapshot();
  let pageAfter: string | null = null,
    refreshPending = false;
  let cards: ReturnType<typeof createPostCards> | null = null;
  function clearMedia(container?: HTMLElement): void {
    cards?.clear(container);
  }
  function row(
    value: CommunityPost,
    state: PostState | null = null,
    container: HTMLElement | null = list,
  ): HTMLElement | null {
    return cards?.render(value, state, container) ?? null;
  }
  let order: FeedOrder = 'recent',
    period: DiscoveryPeriod = 'all';
  let feedback: HTMLElement | null = null,
    list: HTMLElement | null = null,
    controls: HTMLElement | null = null,
    filterBar: HTMLElement | null = null;
  function disabled(): void {
    for (const node of [mounted])
      node
        ?.querySelectorAll<
          | HTMLButtonElement
          | HTMLSelectElement
          | HTMLInputElement
          | HTMLTextAreaElement
        >('button,select,input,textarea')
        .forEach((item) => {
          item.disabled = busy;
        });
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    const old = generation;
    busy = true;
    disabled();
    try {
      await work();
    } catch (error: unknown) {
      if (old === generation && feedback)
        feedback.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Posts unavailable.');
    } finally {
      busy = false;
      disabled();
      if ((old !== generation || refreshPending) && mounted) {
        refreshPending = false;
        void ready();
      }
    }
  }
  const signal = () =>
    AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]);
  function tagSource() {
    return {
      page: tags,
      run,
      load: async (cursor: string | null) => {
        const old = generation,
          query = cursor ? `?after=${cursor}` : '',
          page = tagPage(
            await communityRead(
              `/api/communities/${community}/tags${query}`,
              signal(),
            ),
          );
        if (old !== generation) throw new Error('The community has changed.');
        return page;
      },
    };
  }
  async function mutate(
    op: string,
    data: Record<string, unknown> | (() => Promise<Record<string, unknown>>),
  ): Promise<void> {
    await run(async () => {
      const old = generation,
        result = await controller.request(
          op,
          typeof data === 'function' ? await data() : data,
        );
      if (old !== generation) return;
      if (op === 'post-edit' && list) {
        const state = postState(result);
        if (
          replaceEditedPost({
            host: list,
            state,
            cleanup: clearMedia,
            render: (container, accepted) =>
              row(accepted.post, accepted, container),
          })
        ) {
          postSnapshot.accept(state.post);
          pageSnapshot.accept(state.post);
          threadView?.accept(state.post);
          if (feedback) feedback.textContent = t('Change saved.');
          return;
        }
      }
      if (op === 'report') communityState(result);
      else postState(result);
      after = null;
      await load();
      if (feedback) feedback.textContent = t('Change saved.');
    });
  }
  async function thread(value: CommunityPost): Promise<void> {
    if (!list) return;
    const old = generation;
    if (threadView && list.querySelector('.post-thread')) {
      await threadView.refresh(value);
      return;
    }
    threadView?.dispose();
    threadView = new PostThread({
      community,
      signal: abort.signal,
      valid: () => old === generation,
      run,
      cleanup: clearMedia,
      render: (container, post) => row(post, null, container),
      ...(own
        ? {
            request: (payload: Record<string, unknown>) =>
              controller.request('post-replies', { id: community, ...payload }),
          }
        : {}),
    });
    await threadView.mount(list, value);
  }
  async function load(): Promise<void> {
    const old = generation;
    try {
      await loadCurrentPage();
    } catch (error: unknown) {
      if (old === generation) {
        clearMedia();
        postSnapshot.clear();
        pageSnapshot.clear();
        list?.replaceChildren();
      }
      throw error;
    }
  }
  async function loadCurrentPage(): Promise<void> {
    closePrivateContent();
    const old = generation;
    if (selected) {
      const result = communityPost(
        own
          ? await controller.request('post-public', {
              id: community,
              post: selected,
            })
          : await communityRead(
              `/api/communities/${community}/posts/${selected}`,
              signal(),
            ),
      );
      if (old !== generation || !list) return;
      if (postSnapshot.changed(selected, result)) {
        clearMedia();
        list.replaceChildren();
        row(result);
        pageSnapshot.clear();
        void showRepliedAbove({
          reply: list.lastElementChild,
          post: result,
          community: identity,
          member: own !== null,
          privacy,
          request: (operation, data) => controller.request(operation, data),
          valid: () => old === generation,
          signal: signal(),
        });
      }
      await thread(result);
      return;
    }
    if (scope !== 'public') await loadPrivate();
    else await loadPublic();
    if (old !== generation || !list) return;
    settleList(list);
  }
  /** After a page loads: the empty message, the first-post state and paging. */
  function settleList(host: HTMLElement): void {
    const first = !host.children.length && unfiltered();
    if (!host.children.length) empty(host, first);
    awaitFirstPost(first);
    paging(first);
  }
  function unfiltered(): boolean {
    return scope === 'public' && !tag && period === 'all';
  }
  /** A filtered list says so; an empty community waits for its first post. */
  function empty(host: HTMLElement, first: boolean): void {
    if (first) firstPostInvitation(host);
    else host.append(el('p', t('No posts in this list.')));
  }
  function firstPostInvitation(host: HTMLElement): void {
    emptyCommunity(host);
    if (!own?.canPost || !identity) return;
    const invite = button(
      host,
      t('community.composer.first {0}', [identity.name]),
      () => {
        openComposer(community);
        return Promise.resolve();
      },
    );
    invite.classList.add('community-first-post');
  }
  /**
   * Without any post there is nothing to sort, so the filters step aside.
   * Staff keep them, as they also lead to hidden posts and replies.
   */
  function awaitFirstPost(first: boolean): void {
    if (!filterBar) return;
    filterBar.hidden = first && (!own || own.role === 'participant');
    filterBar.toggleAttribute('data-first-post', first);
  }
  async function loadPrivate(): Promise<void> {
    pageSnapshot.clear();
    const old = generation,
      validPrivate = cards?.privateGuard();
    const page = privatePostPage(
      await controller.request('post-page', {
        id: community,
        scope,
        after,
        tag,
      }),
    );
    if (old !== generation || !validPrivate?.() || !list) return;
    pageAfter = after;
    clearMedia();
    list.replaceChildren();
    for (const state of page.items) row(state.post, state);
    after = page.next;
  }
  async function loadPublic(): Promise<void> {
    const old = generation;
    const query = new URLSearchParams({ order, period, community });
    if (after) query.set('after', after);
    if (tag) query.set('tag', tag);
    const filter = { scope: 'all', order, period, community, tag };
    const page = feedPage(
      own
        ? await controller.request('discovery-feed', { filter, after })
        : await communityRead(
            `/api/communities/feed?${query.toString()}`,
            signal(),
          ),
    );
    if (old !== generation || !list) return;
    pageAfter = after;
    if (pageSnapshot.changed(query.toString(), page)) {
      clearMedia();
      list.replaceChildren();
      for (const value of page.items)
        row({
          ...value.post,
          viewer: {
            vote: value.viewerVote ?? 0,
            shared: value.viewerShared ?? false,
          },
        });
    }
    after = page.next;
  }
  /**
   * Nothing to page through or reload before the first post. At the end of
   * a page one button returns to the top with fresh posts (owner request,
   * 01/11/2026).
   */
  function paging(first: boolean): void {
    if (!controls) return;
    controls.replaceChildren();
    if (first) return;
    if (after)
      button(
        controls,
        selected ? t('Earlier replies') : t('Earlier posts'),
        () => run(load),
      );
    const top = button(controls, t('Back to top'), () =>
      run(async () => {
        if (list) feedScroller(list).scrollTo({ top: 0, behavior: 'smooth' });
        after = null;
        await load();
      }),
    );
    iconLabel(top, 'up');
    top.classList.add('community-back-to-top');
  }
  /**
   * Order, period and tag as the same compact menus as the feed. "My posts"
   * and, for staff, hidden posts are further choices of the order menu.
   */
  function filters(): void {
    if (!mounted) return;
    const bar = el('div', '', 'community-post-filters'),
      row = el('div', '', 'community-feed-filter-row');
    filterBar = bar;
    bar.append(row);
    mounted.append(bar);
    orderMenu(row);
    discoveryMenu(
      row,
      t('Published in this period'),
      { value: period, options: discoveryPeriods },
      (value) => {
        period = feedFilter({
          scope: 'all',
          order,
          period: value,
          community,
          tag,
        }).period;
        after = null;
        void run(load);
      },
    );
    void tagMenu(row).catch((error: unknown) => {
      // A newer list replaced this one; only a current failure is reported.
      if (signal().aborted || !row.isConnected || !feedback) return;
      feedback.textContent =
        error instanceof Error
          ? translatedError(error.message)
          : t('Operation unavailable. Check the state before retrying.');
    });
  }
  function orderMenu(row: HTMLElement): void {
    const choices: (readonly [string, string])[] = [
      ...feedOrders,
      ...(own ? ([['own', t('My posts')]] as const) : []),
      ...(own && own.role !== 'participant'
        ? ([['removed', t('Hidden posts and replies')]] as const)
        : []),
    ];
    discoveryMenu(
      row,
      t('Sort posts'),
      { value: scope === 'public' ? order : scope, options: choices },
      (value) => {
        if (value === 'own' || value === 'removed') scope = value;
        else {
          scope = 'public';
          order = feedFilter({
            scope: 'all',
            order: value,
            period,
            community,
            tag,
          }).order;
        }
        after = null;
        void run(load);
      },
    );
  }
  /** Shown once the community's tags are known; without tags there is no filter. */
  async function tagMenu(row: HTMLElement): Promise<void> {
    const source = tagSource(),
      options: [string, string][] = [];
    let cursor: string | null = null;
    for (let pages = 0; pages < tagMenuPages; pages++) {
      const page: TagPage = await source.load(cursor);
      for (const item of page.items)
        options.push([item.id, postTagName(item.label)]);
      cursor = page.next;
      if (!cursor) break;
    }
    if (!options.length || !row.isConnected || signal().aborted) return;
    if (tag && !options.some(([id]) => id === tag))
      options.push([tag, t('Previous tag or from link')]);
    discoveryMenu(
      row,
      t('Filter by tag'),
      { value: tag ?? '', options: [['', t('All tags')], ...options] },
      (value) => {
        tag = value || null;
        after = null;
        void run(load);
      },
    );
  }
  function shell(): void {
    if (!mounted) return;
    clearMedia();
    postSnapshot.clear();
    pageSnapshot.clear();
    mounted.replaceChildren();
    feedback = el('p', '', 'community-feedback');
    feedback.setAttribute('role', 'status');
    mounted.append(feedback);
    filterBar = null;
    if (!selected) filters();
    list = el('div', '', 'community-post-list');
    controls = el('div', '', 'post-toolbar');
    mounted.append(list, controls);
  }
  function closePrivateContent(): void {
    cards?.closePrivate();
    if (scope === 'public') return;
    clearMedia();
    pageSnapshot.clear();
    list?.replaceChildren();
  }
  async function ready(): Promise<void> {
    if (!mounted) return;
    if (busy) {
      refreshPending = true;
      return;
    }
    closePrivateContent();
    await run(async () => {
      const old = generation,
        page = tagPage(
          await communityRead(`/api/communities/${community}/tags`, signal()),
        );
      if (old !== generation) return;
      const changed = JSON.stringify(tags) !== JSON.stringify(page);
      tags = page;
      if (changed) shell();
      const nextAfter = after;
      after = pageAfter;
      try {
        await load();
      } catch (error: unknown) {
        after = nextAfter;
        throw error;
      }
    });
  }
  function leave(): void {
    threadView?.dispose();
    threadView = null;
    cards?.dispose();
    cards = null;
    postSnapshot.clear();
    pageSnapshot.clear();
    pageAfter = null;
    refreshPending = false;
    generation++;
    abort.abort();
    mounted = null;
    own = null;
    identity = null;
    list = null;
    feedback = null;
    filterBar = null;
  }
  return {
    mount(
      container: HTMLElement,
      options: {
        community: string;
        identity: { id: string; name: string; avatar: string | null };
        state: CommunityState | null;
        post: string | null;
        tag: string | null;
      },
    ): void {
      leave();
      mounted = container;
      community = options.community;
      identity = options.identity;
      own = options.state;
      selected = options.post;
      scope = 'public';
      order = 'recent';
      period = 'all';
      after = null;
      tag = options.tag;
      tags = { items: [], next: null };
      abort = new AbortController();
      cards = createPostCards(
        { community, identity, own, selected, privacy, signal: abort.signal },
        {
          controller,
          run,
          mutate,
          tags: tagSource,
          changed: async () => {
            after = null;
            await load();
          },
          notice: (text) => {
            if (feedback) feedback.textContent = text;
          },
        },
      );
      shell();
      void ready();
    },
    leave,
    refresh: ready,
    /** Shows a just-published post when its community's list is open. */
    published: (id: string): Promise<void> =>
      mounted && community === id ? ready() : Promise.resolve(),
    invalidatePrivate: closePrivateContent,
    canActivate: () => !busy,
  };
}
