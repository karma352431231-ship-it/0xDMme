import { communityHref } from '../../shared/app-routes/index.ts';
import { navigateApp } from '../app-navigation/index.ts';
import { upvoteNoticePage } from '../../shared/public-upvotes/index.ts';
import { InteractionQueue } from '../interaction-queue/index.ts';
import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
import { publicationNotificationRow } from './notification-row.ts';
import { communityAbout, communityCreationDate } from './community-about.ts';
import {
  mountMentionInput,
  mentionValue,
  renderMentions,
} from '../public-mentions/index.ts';
import {
  mountCommunityFollowerPage,
  mountCommunityFollowerPreview,
} from './followers.ts';
import { communityPresentationEditor } from './presentation-editor.ts';
import { mountCommunityCreation } from './community-create.ts';
import {
  classificationBadges,
  classificationSettings,
} from './classification.ts';
import type { AccountSession } from '../../shared/account/index.ts';
export { renderActivityEntry } from './activity-entry.ts';
export { ActivityPosts } from './activity-posts.ts';
export { communityAvatar, communityIcon } from './presentation.ts';
export { startRankingSide } from './ranking-side.ts';
export type { RankingScope } from './ranking-side.ts';
import { uuid } from '../../shared/account/index.ts';
import { communityState } from '../../shared/communities/index.ts';
import type {
  Community,
  CommunityPage,
  CommunityState,
} from '../../shared/communities/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { Communities } from './controller.ts';
import { readCommunityDetail } from './detail-refresh.ts';
import { CommunityDirectory } from './directory-refresh.ts';
import { clearCommunityProfileInvitation } from './directory-notice.ts';
import {
  communityButton,
  communityCard,
  communityElement,
  communityField,
  communityLink,
} from './elements.ts';
import { mountCommunityGovernance } from './governance.ts';
import { mountCommunityBadges } from './badges.ts';
import { manageGroups } from './manage-tabs.ts';
import { communityHoverProvider } from './community-hover.ts';
import { registerHoverCard } from '../hover-card/index.ts';
import { startCommunityPosts } from './posts.ts';
import { PostComposer } from './post-composer.ts';
import { FeedReturn } from './feed-return.ts';
import type { FeedBookmark } from './feed-return.ts';
import { previewModeratedMedia } from './moderation-preview.ts';
import type { PublicModerationDetails } from '../../shared/moderation-details/index.ts';
import { replyNotificationPage } from '../../shared/community-posts/index.ts';
import type { ReplyNotification } from '../../shared/community-posts/index.ts';
import { startCommunityDiscovery } from './discovery.ts';
import type { FeedProfileFollows } from './feed-follow.ts';
import { startSocialDmUi } from './dms.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { communityAvatar, openPostFromCard } from './presentation.ts';
import {
  communityDirectoryNavigation,
  communityNavigation,
  communityView,
  communitySelection,
  postReturnTarget,
} from './navigation.ts';

export function startCommunities(
  access: VaultAccess,
  sync: VaultSync,
  privacy: ExternalMediaConsent,
  profiles: FeedProfileFollows,
) {
  const dms = startSocialDmUi(access, sync, privacy);
  const controller = new Communities(access);
  registerHoverCard(
    communityHoverProvider({ controller, signedIn: () => session !== null }),
  );
  const composer = new PostComposer(controller, privacy);
  const feedReturn = new FeedReturn();
  let returnBookmark: FeedBookmark | null = null;
  const posts = startCommunityPosts(controller, privacy, (id) =>
    composer.open(id),
  );
  const discovery = startCommunityDiscovery(controller, privacy, profiles);
  const followedDirectory = new CommunityDirectory({
    load: (after) => controller.list('following', after),
    rows,
    release: clearPublicPhotos,
    run,
  });
  document.addEventListener('click', openPostFromCard);
  feedReturn.bind({
    container: () => mounted,
    bookmark: () => discovery.bookmark(),
    reset: () => discovery.tabAgain(),
    keep: (bookmark) => discovery.keep(bookmark),
  });
  composer.bind(() => session !== null);
  let mounted: HTMLElement | null = null,
    sidebar: HTMLElement | null = null,
    session: AccountSession | null = null;
  let state: CommunityState | null = null,
    current: Community | null = null,
    generation = 0,
    busy = false;
  let abort = new AbortController(),
    presentation: ReturnType<typeof communityPresentationEditor> | null = null;
  // Query of the last list shown (feed, ranking, community…), for the post arrow.
  let lastList: string | null = null;
  let view = 'feed',
    selectedDm: string | null = null,
    localDm = false,
    selected: string | null = null,
    selectedSlug: string | null = null,
    selectedPost: string | null = null,
    selectedTag: string | null = null,
    cursor: string | null = null;
  let output: HTMLElement | null = null;
  let discoveryMounted = false;
  let creationMounted = false;
  // The DM view is shared: the communities page owns it for view=dms, the workspace for its chat column.
  let dmOwner: 'page' | 'panel' | null = null;
  const publicPhotos = new Map<() => void, HTMLElement>();
  function clearPublicPhotos(container?: HTMLElement | null): void {
    for (const [cleanup, node] of publicPhotos) {
      if (container && !container.contains(node)) continue;
      cleanup();
      publicPhotos.delete(cleanup);
    }
  }
  function publicPhoto(container: HTMLElement, item: Community): void {
    if (!item.avatar) return;
    publicPhotos.set(
      showPublicAvatar(container, {
        kind: 'community-photo',
        target: item.id,
        reference: item.avatar,
        signal: abort.signal,
      }),
      container,
    );
  }
  function controls(options: { background?: boolean }): void {
    if (options.background) return;
    mounted
      ?.querySelectorAll<
        | HTMLButtonElement
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
      >('button,input,textarea,select')
      .forEach((button) => {
        button.disabled = busy;
      });
  }
  const operations = new InteractionQueue({
    generation: () => generation,
    changed: (value, background) => {
      busy = value;
      controls({ background });
    },
    failed: (error) => {
      if (output)
        output.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Community unavailable.');
    },
    settled: (old) => {
      if (old !== generation && mounted) ready();
    },
  });
  function run(
    work: () => Promise<void>,
    options: { background?: boolean; quiet?: boolean } = {},
  ): Promise<void> {
    return operations.run(work, options);
  }
  function signal(): AbortSignal {
    return AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]);
  }
  function navigation(): void {
    if (!mounted) return;
    discoveryMounted = false;
    creationMounted = false;
    presentation?.dispose();
    presentation = null;
    clearPublicPhotos(mounted);
    mounted.replaceChildren();
    delete mounted.dataset['communityLayout'];
    communityNavigation(mounted, {
      view,
      selected,
      signedIn: session !== null,
      manage:
        selected &&
        state?.community.id === selected &&
        state.role !== 'participant'
          ? selected
          : null,
    });
    output = communityElement('p', '', 'community-feedback');
    output.setAttribute('role', 'status');
    mounted.append(output);
  }
  function rows(container: HTMLElement, page: CommunityPage): void {
    for (const item of page.items) {
      const row = communityElement('div', '', 'community-row');
      const a = communityElement('a', '', 'community-row-link'),
        avatar = communityAvatar(item.name),
        copy = communityElement('span', '', 'community-row-copy');
      a.href = communityHref(item);
      if (item.id === selected) a.setAttribute('aria-current', 'page');
      copy.append(
        communityElement('strong', item.name),
        communityElement('small', followerLabel(item)),
      );
      a.append(avatar, copy);
      row.append(a);
      container.append(row);
      publicPhoto(avatar, item);
    }
    if (!page.items.length)
      container.append(
        communityElement('p', t('No communities in this list.')),
      );
  }
  function followerLabel(value: Community): string {
    return t('{0} {1}{2}', [
      value.followers,
      value.followers === 1 ? t('follower') : t('followers'),
      value.archived ? t(' · Archived') : '',
    ]);
  }
  async function dmSidebar(): Promise<void> {
    if (!sidebar) return;
    const old = generation;
    await dms.directory(sidebar, () => old === generation && view === 'dms');
  }
  async function directory(): Promise<void> {
    if (!sidebar) return;
    if (view === 'dms') {
      clearCommunityProfileInvitation();
      clearPublicPhotos(sidebar);
      sidebar.replaceChildren();
      communityDirectoryNavigation(sidebar, view, selected);
      await dmSidebar();
      return;
    }
    const old = generation;
    await followedDirectory.refresh({
      host: sidebar,
      view,
      selected,
      signedIn: session !== null,
      valid: () => old === generation,
    });
  }

  async function notifications(): Promise<void> {
    const old = generation,
      page = replyNotificationPage(
        await controller.request('post-notifications', { after: cursor }),
      );
    if (old !== generation || !mounted) return;
    navigation();
    const card = communityCard(t('Notifications'));
    mounted.append(card);
    card.append(
      communityElement(
        'p',
        t(
          'Replies to your content and posts/replies from accounts with notifications enabled.',
        ),
      ),
    );
    for (const item of page.items)
      card.append(
        publicationNotificationRow(item, {
          open: async (reply) => {
            await controller.request('post-notifications-read', {
              replies: [reply],
            });
          },
          current: () => old === generation && mounted !== null,
        }),
      );
    if (!page.items.length)
      card.append(communityElement('p', t('No notifications on this page.')));
    cursor = page.next;
    if (page.next)
      communityButton(card, t('Earlier notifications'), () =>
        run(notifications),
      );
    communityButton(card, t('Reload notifications'), () =>
      run(async () => {
        cursor = null;
        await notifications();
      }),
    );
  }
  async function listing(): Promise<void> {
    const old = generation;
    const page = await controller.list(
      view === 'communities' ? 'following' : view,
      cursor,
    );
    if (old !== generation || !mounted) return;
    navigation();
    const card = communityCard(
      view === 'invitations' ? t('Community transfers') : t('My communities'),
    );
    mounted.append(card);
    if (view === 'communities') {
      const links = communityElement('nav', '', 'community-personal-links');
      links.setAttribute('aria-label', t('Your lists'));
      for (const [key, label] of [
        ['following', t('Following feed')],
        ['saved', t('Saved')],
        ['replies', t('Replies')],
        ['create', t('Create community')],
      ] as const)
        communityLink(links, label, `#communities?view=${key}`);
      card.append(links);
    }
    rows(card, page);
    cursor = page.next;
    if (page.next) communityButton(card, t('Next page'), () => run(listing));
    communityButton(card, t('Reload list'), () => {
      cursor = null;
      return run(listing);
    });
  }
  function metaForm(
    card: HTMLElement,
    value: { name: string; description: string; rules: string },
  ) {
    const name = communityField(card, t('Community name'), {
      value: value.name,
      maximum: 100,
    });
    const description = communityField(card, t('Description'), {
      value: value.description,
      maximum: 1000,
      multiline: true,
    });
    const rules = communityField(card, t('Local rules'), {
      value: value.rules,
      maximum: 4000,
      multiline: true,
    });
    mountMentionInput(description, abort.signal);
    return () => ({
      name: name.value,
      description: mentionValue(description),
      rules: rules.value,
    });
  }
  function creation(): void {
    if (!mounted || creationMounted) return;
    navigation();
    creationMounted = true;
    const old = generation;
    mountCommunityCreation(mounted, {
      signal: abort.signal,
      run,
      fields: (host) =>
        metaForm(host, { name: '', description: '', rules: '' }),
      request: (operation, data) => controller.request(operation, data),
      current: () => old === generation,
      open: (id) => {
        navigateApp(`#communities?id=${id}`);
      },
    });
  }
  /**
   * The first thing a visitor sees: banner in the community's tone, a large
   * photo, the name, followers and the description; follow and manage at hand.
   */
  function summary(value: Community): void {
    if (!mounted) return;
    const hero = communityElement('section', '', 'community-hero');
    hero.setAttribute('aria-label', t('Community {0}', [value.name]));
    mounted.append(hero);
    const avatar = communityAvatar(value.name);
    const banner = communityElement('div', '', 'community-banner');
    banner.dataset['tone'] = avatar.dataset['tone'] ?? '0';
    if (value.banner)
      publicPhotos.set(
        showPublicAvatar(banner, {
          kind: 'community-banner',
          target: value.id,
          reference: value.banner,
          signal: abort.signal,
        }),
        banner,
      );
    const head = communityElement('div', '', 'community-hero-head');
    const title = communityElement('div', '', 'community-hero-title');
    title.append(
      communityElement('h1', value.name),
      ...(value.archived
        ? [communityElement('p', t('Archived'), 'community-hero-meta')]
        : []),
    );
    head.append(avatar, title);
    hero.append(banner, head);
    publicPhoto(avatar, value);
    // The follower line sits under the name, aligned with it.
    mountCommunityFollowerPreview(title, {
      id: value.id,
      total: value.followers,
      signedIn: state !== null,
      controller,
      signal: abort.signal,
    });
    title.append(
      communityCreationDate(value),
      classificationBadges(value.classification),
    );
    if (value.description) {
      const description = communityElement(
        'p',
        '',
        'community-hero-description',
      );
      renderMentions(description, value.description);
      hero.append(description);
    }
    const about = communityAbout(value);
    if (about) hero.append(about);
    if (!state) {
      communityLink(
        head,
        t('Sign in through Profile to participate'),
        '#settings',
      );
      return;
    }
    participant(head, state);
  }
  function communityFollowControl(
    card: HTMLElement,
    own: CommunityState,
  ): void {
    if (own.role !== 'owner') {
      communityButton(
        card,
        own.following ? t('follow.following') : t('Follow'),
        () =>
          mutate('follow', { id: own.community.id, following: !own.following }),
      );
      const follow = card.lastElementChild;
      follow?.classList.add('community-follow');
      follow?.setAttribute('aria-pressed', String(own.following));
    }
  }
  function participant(card: HTMLElement, own: CommunityState): void {
    communityFollowControl(card, own);
    if (!own.canPost)
      card.after(
        communityElement(
          'p',
          own.community.archived
            ? t('Participation ended: community archived.')
            : t('Your participation is suspended.'),
          'community-hero-notice',
        ),
      );
    if (own.sanction) {
      const s = own.sanction;
      card.append(
        communityElement('p', t('Reason: {0}', [s.reason])),
        communityElement(
          'p',
          s.until
            ? t('Until {0}', [
                new Date(s.until).toLocaleString(currentLanguage()),
              ])
            : t('Reversible ban'),
        ),
      );
      if (s.appeal)
        card.append(communityElement('p', t('Appeal: {0}', [s.appeal])));
      if (s.decision)
        card.append(communityElement('p', t('Reply: {0}', [s.decision])));
    }
  }
  /**
   * The arrow returns to `href`; the community photo and name enter the
   * community. Both are links, so the feed panel keeps them in place.
   */
  function backHeader(value: Community, href: string): HTMLElement {
    const header = communityElement('div', '', 'community-post-back'),
      arrow = communityElement('a', '←', 'community-post-back-arrow'),
      identity = communityElement('a', '', 'community-post-back-identity'),
      avatar = communityAvatar(value.name);
    arrow.href = href;
    arrow.title = t('Back');
    arrow.setAttribute('aria-label', t('Back'));
    identity.href = communityHref(value);
    identity.append(avatar, communityElement('span', value.name));
    header.append(arrow, identity);
    publicPhoto(avatar, value);
    return header;
  }
  /** A post takes the whole timeline: way back, the post, then its replies. */
  function postFocus(value: Community, post: string): void {
    if (!mounted) return;
    mounted.dataset['communityLayout'] = 'post';
    mounted.append(
      backHeader(
        value,
        feedReturn.target() ?? postReturnTarget(lastList, value.id),
      ),
    );
    const postContainer = communityElement('section', '', 'community-posts');
    mounted.append(postContainer);
    posts.mount(postContainer, {
      community: value.id,
      identity: value,
      state,
      post,
      tag: selectedTag,
    });
  }
  function details(): void {
    if (!mounted || !current) return;
    navigation();
    if (view === 'followers') {
      mounted.dataset['communityLayout'] = 'followers';
      mountCommunityFollowerPage(mounted, {
        id: current.id,
        name: current.name,
        signedIn: session !== null,
        controller,
        signal: abort.signal,
      });
      return;
    }
    if (selectedPost) {
      postFocus(current, selectedPost);
      return;
    }
    if (view === 'manage' && state && state.role !== 'participant') {
      manageScreen(current, state);
      return;
    }
    // Wide communities page: posts on the left, about and management on the right.
    mounted.dataset['communityLayout'] = 'detail';
    summary(current);
    const postContainer = communityElement('section', '', 'community-posts');
    mounted.append(postContainer);
    posts.mount(postContainer, {
      community: current.id,
      identity: current,
      state,
      post: selectedPost,
      tag: selectedTag,
    });
    // Owners and moderators manage from the isolated screen (top-right link);
    // participants keep their sanctions, appeals and reports here.
    if (state?.role === 'participant') {
      const management = communityElement(
        'details',
        '',
        'community-management',
      );
      management.append(
        communityElement('summary', t('Participation and reports')),
      );
      mounted.append(management);
      governance(management, state);
    }
    communityButton(mounted, t('Reload community'), () => run(refresh));
  }
  /** Isolated settings screen for owners and moderators. */
  function manageScreen(value: Community, own: CommunityState): void {
    if (!mounted) return;
    mounted.dataset['communityLayout'] = 'manage';
    const back = backHeader(value, communityHref(value));
    const management = communityElement('section', '', 'community-manage');
    management.append(communityElement('h1', t('Manage community')));
    mounted.append(back, management);
    const groups = manageGroups(
      management,
      own.role === 'owner'
        ? ['general', 'tags', 'moderation', 'ownership']
        : ['general', 'tags', 'moderation'],
    );
    presentation = communityPresentationEditor(groups.general, own, {
      signal: abort.signal,
      run,
      prepare: (work) => run(work, { quiet: true }),
      save: (data) => mutateWork('presentation', data),
    });
    mountCommunityBadges(groups.general, own.community.id, {
      mutate,
      query: run,
      request: (op, data) => controller.request(op, data),
    });
    classificationSettings(groups.general, own, (nsfw) =>
      mutate('nsfw', {
        id: own.community.id,
        revision: own.community.revision,
        nsfw,
      }),
    );
    posts.manageTags(groups.tags, own.community.id);
    governance(groups.moderation, own, groups.ownership);
  }
  function governance(
    container: HTMLElement,
    own: CommunityState,
    ownership: HTMLElement = container,
  ): void {
    mountCommunityGovernance({ container, ownership }, own, {
      mutate,
      query: run,
      request: (operation, data) => controller.request(operation, data),
    });
  }
  async function mutateWork(
    operation: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const old = generation,
      result = communityState(await controller.request(operation, data));
    if (old !== generation) return;
    current = result.community;
    if (operation === 'presentation' && presentation && state) {
      Object.assign(state, result);
      presentation.accept(result);
      const header = mounted?.querySelector<HTMLElement>(
        '.community-post-back',
      );
      if (header) {
        clearPublicPhotos(header);
        header.replaceWith(
          backHeader(result.community, communityHref(result.community)),
        );
      }
    } else {
      state = result;
      details();
    }
    if (output) output.textContent = t('Change saved.');
    followedDirectory.reset();
    await directory();
  }
  function mutate(
    operation: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    return run(() => mutateWork(operation, data));
  }
  async function refreshDiscovery(container: HTMLElement): Promise<void> {
    if (discoveryMounted) {
      await discovery.refresh();
      return;
    }
    navigation();
    discoveryMounted = true;
    discovery.mount(container, {
      view,
      signedIn: session !== null,
      bookmark: returnBookmark,
      followChanged: async () => {
        followedDirectory.reset();
        await directory();
      },
    });
    returnBookmark = null;
  }
  async function refresh(): Promise<void> {
    if (!mounted) return;
    if (view === 'dms') {
      navigation();
      dms.mount(mounted, selectedDm, localDm);
      dmOwner = 'page';
      return;
    }
    if (view === 'create') {
      creation();
      return;
    }
    if (!selected) {
      if (['feed', 'explore', 'following', 'saved', 'hidden'].includes(view)) {
        await refreshDiscovery(mounted);
        return;
      }
      if (view === 'replies') {
        await notifications();
        return;
      }
      await listing();
      return;
    }
    await refreshDetail();
  }
  async function refreshDetail(): Promise<void> {
    if (!selected) return;
    const old = generation;
    posts.invalidatePrivate();
    try {
      const next = await readCommunityDetail({
        id: selected,
        slug: selectedSlug,
        signedIn: session !== null,
        signal: signal(),
        valid: () => old === generation,
        state: (id) => controller.state(id),
        previous: { community: current, state },
      });
      if (!next) return;
      current = next.community;
      selected = current.id;
      selectedSlug = null;
      state = next.state;
      if (view === 'manage' && presentation?.retainDraft(next.state)) return;
      if (next.changed || view === 'followers') details();
      else await posts.refresh();
    } catch (error: unknown) {
      if (old === generation) {
        posts.leave();
        current = null;
        state = null;
        navigation();
      }
      throw error;
    }
  }
  function ready(): void {
    if (mounted)
      void run(
        async () => {
          await refresh();
          await directory();
        },
        { background: true },
      );
  }
  function leave(): void {
    posts.leave();
    discovery.leave();
    discoveryMounted = false;
    creationMounted = false;
    followedDirectory.reset();
    if (dmOwner === 'page') {
      dms.leave();
      dmOwner = null;
    }
    generation++;
    abort.abort();
    mounted = null;
    state = null;
    current = null;
    presentation?.dispose();
    presentation = null;
    clearPublicPhotos();
  }
  return {
    /** `directoryNode` is null when the feed is a workspace panel without the followed list. */
    mount(
      container: HTMLElement,
      directoryNode: HTMLElement | null,
      params: URLSearchParams,
    ): void {
      returnBookmark = feedReturn.take(params);
      leave();
      mounted = container;
      sidebar = directoryNode;
      abort = new AbortController();
      view = params.get('view') ?? 'feed';
      cursor = null;
      try {
        selectedDm = params.has('dm') ? uuid(params.get('dm')) : null;
        localDm = params.get('history') === 'local';
        ({ selected, slug: selectedSlug } = communitySelection(params));
        selectedPost = params.has('post') ? uuid(params.get('post')) : null;
        selectedTag = params.has('tag') ? uuid(params.get('tag')) : null;
        // A post opened from a list returns to that list, not to its community.
        if (!selectedPost) lastList = params.toString();
      } catch {
        selected = null;
        navigation();
        if (output) output.textContent = t('Invalid community link.');
        return;
      }
      view = communityView(view, selected);

      navigation();
      ready();
    },
    leave,
    /** Way back to the feed a profile was opened from, if any. */
    feedReturnTarget: (): string | null => feedReturn.target(),
    /** Another app page opened: a post reached from there returns to its community. */
    forgetReturn(): void {
      lastList = null;
    },
    ready,
    /** Public @ conversations in the workspace chat column, independent of the mounted feed. */
    openDm(container: HTMLElement, id: string | null, local: boolean): void {
      dms.mount(container, id, local);
      dmOwner = 'panel';
    },
    closeDm(): void {
      if (dmOwner !== 'panel') return;
      dms.leave();
      dmOwner = null;
    },
    dmDirectory: (node: HTMLElement, valid: () => boolean) =>
      dms.directory(node, valid),
    /** Bounded inbox history for Atividade, including durable read state. */
    async publicationNotifications(): Promise<readonly ReplyNotification[]> {
      const page = replyNotificationPage(
        await controller.request('post-notifications', {
          after: null,
          authors: true,
        }),
      );
      return page.items;
    },
    async upvoteNotifications() {
      return upvoteNoticePage(
        await controller.request('post-upvote-notifications', { after: null }),
      ).items;
    },
    async markUpvotesRead(ids: readonly string[]): Promise<void> {
      await controller.request('post-upvote-notifications-read', { ids });
    },
    previewModeration(
      host: HTMLElement,
      detail: PublicModerationDetails,
      signal: AbortSignal,
    ): void {
      previewModeratedMedia(controller, { host, detail, signal });
    },
    async markRepliesRead(replies: readonly string[]): Promise<void> {
      await controller.request('post-notifications-read', { replies });
    },
    /** Pending community transfers, as listed in Comunidades → Transferências. */
    async pendingTransfers(): Promise<readonly Community[]> {
      return (await controller.list('invitations', null)).items;
    },
    canActivate: () =>
      !busy &&
      !presentation?.dirty() &&
      composer.canActivate() &&
      posts.canActivate() &&
      discovery.canActivate() &&
      dms.canActivate(),
    setSession(value: AccountSession | null): void {
      session = value;
      dms.setSession(value);
      if (!controller.setSession(value)) return;
      composer.close();
      feedReturn.clear();
      returnBookmark = null;
      generation++;
      posts.leave();
      discovery.discard();
      discovery.leave();
      discoveryMounted = false;
      state = null;
      current = null;
      followedDirectory.reset();
      presentation?.dispose();
      presentation = null;
      clearPublicPhotos();
      sidebar?.replaceChildren();
      if (mounted) {
        navigation();
        ready();
      }
    },
  };
}
