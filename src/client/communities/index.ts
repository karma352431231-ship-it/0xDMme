import { PublicActionGate } from '../public-action-guidance/index.ts';
import { bindCommunityCreationEntry } from './creation-entry.ts';
import { showToast } from '../toast/index.ts';
import { communityHref } from '../../shared/app-routes/index.ts';
import { InteractionQueue } from '../interaction-queue/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { mountCommunityFollowerPage } from './followers.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { LiveEvent } from '../message-live/index.ts';
export { renderActivityEntry } from './activity-entry.ts';
export { ActivityPosts } from './activity-posts.ts';
export { communityAvatar, communityIcon } from './presentation.ts';
export { startRankingSide } from './ranking-side.ts';
export type { RankingScope } from './ranking-side.ts';
import { uuid } from '../../shared/account/index.ts';
import { communityState } from '../../shared/communities/index.ts';
import type {
  Community,
  CommunityState,
} from '../../shared/communities/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { Communities } from './controller.ts';
import { readCommunityDetail } from './detail-refresh.ts';
import { CommunityDirectoryView } from './community-directory.ts';
import { CommunityNotifications } from './reply-notifications.ts';
import { CommunityEditor } from './community-editor.ts';
import { CommunityDetailView } from './community-detail.ts';
import type { CommunityScreen } from './screen.ts';
import { clearCommunityProfileInvitation } from './directory-notice.ts';
import { communityButton, communityElement } from './elements.ts';
import { communityHoverProvider } from './community-hover.ts';
import { registerHoverCard } from '../hover-card/index.ts';
import { startCommunityPosts } from './posts.ts';
import { PostComposer } from './post-composer.ts';
import { FeedReturn } from './feed-return.ts';
import type { FeedBookmark } from './feed-return.ts';
import { previewModeratedMedia } from './moderation-preview.ts';
import type { PublicModerationDetails } from '../../shared/moderation-details/index.ts';
import { startCommunityDiscovery } from './discovery.ts';
import type { FeedProfileFollows } from './feed-follow.ts';
import { startSocialDmUi } from './dms.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { openPostFromCard } from './presentation.ts';
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
  options: {
    profiles: FeedProfileFollows;
    publicProfile: () => Promise<boolean>;
    unreadChanged?: (count: number) => void;
    /** When the app coordinates session warmups, a mounted feed still loads
     * on session change (its requests use the signing lane), while public DMs,
     * which share the exclusive account turn, wait for sessionReady(). */
    coordinatedStartup?: boolean;
  },
) {
  const { profiles } = options;
  const dms = startSocialDmUi(access, sync, privacy, options.unreadChanged);
  const controller = new Communities(access);
  const participation = new PublicActionGate({
    session: () => session,
    profile: options.publicProfile,
  });
  registerHoverCard(
    communityHoverProvider({
      controller,
      signedIn: () => session !== null,
      participation,
    }),
  );
  const composer = new PostComposer(controller, privacy, participation);
  const feedReturn = new FeedReturn();
  let returnBookmark: FeedBookmark | null = null;
  const posts = startCommunityPosts(controller, privacy, (id) =>
    composer.open(id),
  );
  const discovery = startCommunityDiscovery(
    controller,
    privacy,
    profiles,
    participation,
  );
  const directoryView = new CommunityDirectoryView({
    controller,
    signal: () => abort.signal,
    run,
  });
  const notifications = new CommunityNotifications({ controller, run });
  const editor = new CommunityEditor({
    controller,
    participation,
    run,
    save: mutateWork,
    tags: (host, id) => posts.manageTags(host, id),
  });
  const detail = new CommunityDetailView({
    controller,
    participation,
    screen,
    run,
    saveFollow: (data) => mutateWork('follow', data),
  });
  document.addEventListener('click', openPostFromCard);
  feedReturn.bind({
    container: () => mounted,
    bookmark: () => discovery.bookmark(),
    reset: () => discovery.tabAgain(),
    keep: (bookmark) => discovery.keep(bookmark),
  });
  composer.bind();
  bindCommunityCreationEntry({
    access: participation,
    signal: () => abort.signal,
    signedIn: () => session !== null,
    failed: (error) =>
      showToast(
        error instanceof Error
          ? translatedError(error.message)
          : t('Community unavailable.'),
      ),
  });
  let mounted: HTMLElement | null = null,
    sidebar: HTMLElement | null = null,
    session: AccountSession | null = null;
  let state: CommunityState | null = null,
    current: Community | null = null,
    generation = 0,
    busy = false;
  let abort = new AbortController();
  // Query of the last list shown (feed, ranking, community…), for the post arrow.
  let lastList: string | null = null;
  let view = 'feed',
    selectedDm: string | null = null,
    localDm = false,
    selected: string | null = null,
    selectedSlug: string | null = null,
    selectedPost: string | null = null,
    selectedTag: string | null = null;
  let output: HTMLElement | null = null;
  let discoveryMounted = false;
  // The DM view is shared: the communities page owns it for view=dms, the workspace for its chat column.
  let dmOwner: 'page' | 'panel' | null = null;
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
  function screen(): CommunityScreen | null {
    if (!mounted) return null;
    const old = generation;
    return {
      host: mounted,
      signal: abort.signal,
      current: () => old === generation && mounted !== null,
      present: navigation,
    };
  }
  function signal(): AbortSignal {
    return AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]);
  }
  function navigation(): void {
    if (!mounted) return;
    discoveryMounted = false;
    editor.reset();
    directoryView.release(mounted);
    detail.release(mounted);
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
  async function dmSidebar(): Promise<void> {
    if (!sidebar) return;
    const old = generation;
    await dms.directory(sidebar, () => old === generation && view === 'dms');
  }
  async function directory(): Promise<void> {
    if (!sidebar) return;
    if (view === 'dms') {
      clearCommunityProfileInvitation();
      directoryView.release(sidebar);
      sidebar.replaceChildren();
      communityDirectoryNavigation(sidebar, view, selected);
      await dmSidebar();
      return;
    }
    const old = generation;
    await directoryView.sidebar({
      host: sidebar,
      view,
      selected,
      signedIn: session !== null,
      valid: () => old === generation,
    });
  }

  /** A post takes the whole timeline: way back, the post, then its replies. */
  function postFocus(value: Community, post: string): void {
    if (!mounted) return;
    mounted.dataset['communityLayout'] = 'post';
    mounted.append(
      detail.backHeader(
        value,
        feedReturn.target() ?? postReturnTarget(lastList, value.id),
        abort.signal,
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
    detail.summary(screen()!, current, state);
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
      editor.governance(management, state);
    }
    communityButton(mounted, t('Reload community'), () => run(refresh));
  }
  /** Isolated settings screen for owners and moderators. */
  function manageScreen(value: Community, own: CommunityState): void {
    if (!mounted) return;
    mounted.dataset['communityLayout'] = 'manage';
    const back = detail.backHeader(value, communityHref(value), abort.signal);
    const management = communityElement('section', '', 'community-manage');
    management.append(communityElement('h1', t('Manage community')));
    mounted.append(back, management);
    editor.manage(management, own, abort.signal);
  }
  async function mutateWork(
    operation: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const old = generation,
      result = communityState(await controller.request(operation, data));
    if (old !== generation) return;
    current = result.community;
    if (operation === 'presentation' && state && editor.accept(result)) {
      Object.assign(state, result);
      const page = screen();
      if (page) detail.replaceHeader(page, result.community);
    } else {
      state = result;
      details();
    }
    if (output) output.textContent = t('Change saved.');
    directoryView.resetSidebar();
    await directory();
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
      search:
        returnBookmark?.search ??
        new URLSearchParams(lastList ?? '').get('q') ??
        '',
      signedIn: session !== null,
      bookmark: returnBookmark,
      followChanged: async () => {
        directoryView.resetSidebar();
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
      await editor.create(screen()!);
      return;
    }
    if (!selected) {
      if (['feed', 'explore', 'following', 'saved', 'hidden'].includes(view)) {
        await refreshDiscovery(mounted);
        return;
      }
      if (view === 'replies') {
        await notifications.show(screen()!);
        return;
      }
      await directoryView.listing(screen()!, view);
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
      if (view === 'manage' && editor.retainDraft(next.state)) return;
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
    dms.ready();
    loadFeed();
  }
  function loadFeed(): void {
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
    directoryView.resetSidebar();
    if (dmOwner === 'page') {
      dms.leave();
      dmOwner = null;
    }
    generation++;
    abort.abort();
    mounted = null;
    state = null;
    current = null;
    editor.reset();
    directoryView.release();
    detail.release();
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
      view = params.get('view') ?? discovery.visitView();
      directoryView.resetPage();
      notifications.resetPage();
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
    pause(): void {
      discovery.pause();
      leave();
    },
    /** Way back to the feed a profile was opened from, if any. */
    feedReturnTarget: (): string | null => feedReturn.target(),
    /** Another app page opened: a post reached from there returns to its community. */
    forgetReturn(): void {
      lastList = null;
    },
    ready,
    /** The app's coordinated session start: public DM work, plus the feed
     * when it did not already start on session change. */
    sessionReady(): void {
      if (options.coordinatedStartup) dms.ready();
      else ready();
    },
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
    dmEvent: (event: LiveEvent) => dms.event(event),
    dmDirectory: (node: HTMLElement, valid: () => boolean) =>
      dms.directory(node, valid),
    /** Bounded publication history and read acknowledgements for Activity. */
    publicationNotifications: () => notifications.publications(),
    upvoteNotifications: () => notifications.upvotes(),
    markUpvotesRead: (ids: readonly string[]) =>
      notifications.markUpvotesRead(ids),
    previewModeration(
      host: HTMLElement,
      detail: PublicModerationDetails,
      signal: AbortSignal,
    ): void {
      previewModeratedMedia(controller, { host, detail, signal });
    },
    markRepliesRead: (replies: readonly string[]) =>
      notifications.markRepliesRead(replies),
    /** Pending community transfers, as listed in Communities → Transfers. */
    async pendingTransfers(): Promise<readonly Community[]> {
      return (await controller.list('invitations', null)).items;
    },
    canActivate: () =>
      !busy &&
      !editor.dirty() &&
      composer.canActivate() &&
      posts.canActivate() &&
      discovery.canActivate() &&
      dms.canActivate(),
    setSession(value: AccountSession | null): void {
      session = value;
      dms.setSession(value);
      if (!controller.setSession(value)) return;
      participation.reset();
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
      directoryView.resetSidebar();
      editor.reset();
      directoryView.release();
      detail.release();
      sidebar?.replaceChildren();
      if (mounted) {
        navigation();
        if (!value || !options.coordinatedStartup) ready();
        else loadFeed();
      }
    },
  };
}
