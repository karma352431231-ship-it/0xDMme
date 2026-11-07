import { publicProfileGuidanceButton } from '../public-action-guidance/index.ts';
import {
  t,
  currentLanguage,
  translatedError,
} from '../../shared/i18n/index.ts';
import { uuid } from '../../shared/account/index.ts';
import { publicProfile } from '../../shared/public-profile/index.ts';
import { mountMutualFollowers } from './mutuals.ts';
import { profileSocialControls } from './social-controls.ts';
import { publicBlockState } from '../../shared/profile-social/index.ts';
import type { PublicBlockState } from '../../shared/profile-social/index.ts';
import {
  ApiResponseError,
  fetchApi,
  readApiJson,
} from '../api-response/index.ts';
import { publicHandle } from '../../shared/public-profile/index.ts';
import { profileSummary } from '../../shared/profile-social/index.ts';
import type { ProfileSummary } from '../../shared/profile-social/index.ts';
import { feedPage } from '../../shared/community-discovery/index.ts';
import type { FeedEntry } from '../../shared/community-discovery/index.ts';
import { profileBar, profileHeader } from './header.ts';
import type { ProfileHeader } from './header.ts';
import { profileCommunities } from './communities-panel.ts';
import { renderActivityEntry } from '../communities/index.ts';
import type { PublicProfiles } from './controller.ts';
import { editPublicProfileHash } from '../profile-shortcut/index.ts';
import { communityIcon } from '../communities/index.ts';

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
) {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
function link(host: HTMLElement, text: string, href: string) {
  const node = element('a', text);
  node.href = href;
  host.append(node);
  return node;
}

type ActivityTab = 'posts' | 'replies' | 'shared';
type ProfileTab = ActivityTab | 'communities';

/** The numbers of a profile live on the tabs that list them. */
function profileTabs(
  summary: ProfileSummary,
): { value: ProfileTab; label: string; count: number | null }[] {
  return [
    { value: 'posts', label: t('Posts'), count: summary.posts },
    { value: 'replies', label: t('Replies'), count: summary.replies },
    { value: 'shared', label: t('Shared'), count: null },
    {
      value: 'communities',
      label: t('Communities'),
      count: summary.communities,
    },
  ];
}

/** Activity reads omit cookies; explicit social actions use signed account access. */
export function showProfilePage(
  container: HTMLElement,
  handle: unknown,
  options: {
    controller?: PublicProfiles;
    renderEntry?: (entry: FeedEntry, signal: AbortSignal) => HTMLElement;
    back?: string | null;
  } = {},
): () => void {
  const lifetime = new AbortController();
  let contentAbort = new AbortController(),
    tab: ProfileTab = 'posts',
    generation = 0;
  const page = element('section', '', 'public-profile-page'),
    status = element('p', t('Loading public profile…'), 'community-feedback');
  status.setAttribute('role', 'status');
  // Stays above every redraw of the profile below it.
  const bar = profileBar(options.back ?? null);
  page.append(bar.node, status);
  container.replaceChildren(page);
  async function read(path: string, signal = lifetime.signal) {
    const response = await fetchApi('public-profile/read', path, {
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    });
    return readApiJson(response, 'public-profile/read');
  }
  function error(message: unknown): void {
    if (message instanceof ApiResponseError && message.failure === 'cancelled')
      return;
    if (
      !lifetime.signal.aborted &&
      !(message instanceof DOMException && message.name === 'AbortError')
    )
      status.textContent =
        message instanceof Error
          ? translatedError(message.message)
          : t('Public profile unavailable.');
  }
  async function currentHandle(): Promise<string> {
    if (typeof handle === 'string' && handle.length === 36) {
      const identity = publicProfile(
        await read(`/api/public-profiles/id/${uuid(handle)}`),
      );
      return identity.handle;
    }
    return publicHandle(handle);
  }
  async function load(): Promise<void> {
    const name = await currentHandle(),
      base = `/api/public-profiles/${encodeURIComponent(name)}`;
    const summary = profileSummary(await read(`${base}/page`));
    if (
      typeof handle === 'string' &&
      handle.length === 36 &&
      summary.profile.id !== handle
    )
      throw new Error('Public profile unavailable.');
    if (lifetime.signal.aborted) return;
    let block: PublicBlockState = { blocked: false, revision: 0 };
    const controller = options.controller;
    if (controller?.hasSession()) {
      await controller.refresh();
      if (
        controller.profile &&
        controller.profile.profile.id !== summary.profile.id
      )
        block = publicBlockState(
          await controller.perform('block-state', {
            target: summary.profile.id,
          }),
        );
    }
    if (!lifetime.signal.aborted) render(summary, base, block);
  }
  function render(
    summary: ProfileSummary,
    base: string,
    block: PublicBlockState,
  ): void {
    bar.show(summary.profile.handle);
    const header = profileHeader(summary, lifetime.signal),
      tabs = element('nav', '', 'public-profile-tabs'),
      items = element('section', '', 'public-profile-activity community-scope'),
      paging = element('div', '', 'post-toolbar'),
      communities = element('section', '', 'public-profile-communities');
    let communitiesLoaded = false;
    tabs.setAttribute('aria-label', t('Public profile activity'));
    for (const { value, label, count } of profileTabs(summary)) {
      const button = element('button', label);
      button.type = 'button';
      button.dataset['tab'] = value;
      if (count !== null)
        button.append(
          ' ',
          element(
            'span',
            count.toLocaleString(currentLanguage()),
            'public-profile-tab-count',
          ),
        );
      button.addEventListener('click', () => {
        select(value);
      });
      tabs.append(button);
    }
    page.replaceChildren(
      bar.node,
      header.node,
      tabs,
      status,
      items,
      paging,
      communities,
    );
    if (!block.blocked)
      mountMutualFollowers(header.social, {
        target: summary.profile.id,
        controller: options.controller,
        signal: lifetime.signal,
      });
    status.textContent = '';
    // Your own profile has no "Message"; editing sits in the round pencil.
    const own = options.controller?.profile?.profile.id === summary.profile.id;
    if (!block.blocked && !own) {
      const message = link(
        header.actions,
        t('Message'),
        `#communities?view=dms&dm=${summary.profile.id}`,
      );
      message.className = 'profile-message';
      message.prepend(communityIcon('comment'));
    }
    void follow(header, summary, block).catch(error);
    select(tab);
    function select(value: ProfileTab): void {
      tab = value;
      tabs
        .querySelectorAll('button')
        .forEach((button) =>
          button.setAttribute(
            'aria-current',
            String(button.dataset['tab'] === value),
          ),
        );
      contentAbort.abort();
      generation++;
      status.textContent = '';
      paging.replaceChildren();
      const showingCommunities = value === 'communities' && !block.blocked;
      communities.hidden = !showingCommunities;
      items.hidden = showingCommunities;
      if (block.blocked) {
        items.replaceChildren(
          element(
            'p',
            t(
              'This user is blocked. Their posts and replies are hidden from you.',
            ),
          ),
        );
        return;
      }
      if (value === 'communities') {
        if (!communitiesLoaded)
          profileCommunities(communities, {
            read: (after) =>
              read(
                `${base}/communities${after ? `?after=${encodeURIComponent(after)}` : ''}`,
              ),
            signal: lifetime.signal,
            error,
          });
        communitiesLoaded = true;
        return;
      }
      void activity(null, value).catch(error);
    }
    async function activity(
      after: string | null,
      activityTab: ActivityTab,
    ): Promise<void> {
      contentAbort.abort();
      contentAbort = new AbortController();
      const signal = AbortSignal.any([lifetime.signal, contentAbort.signal]),
        old = ++generation;
      status.textContent = t('Loading activity…');
      const query = new URLSearchParams({ tab: activityTab });
      if (after) query.set('after', after);
      const response = feedPage(
        options.controller?.profile
          ? await options.controller.perform('activity', {
              target: summary.profile.id,
              tab: activityTab,
              after,
            })
          : await read(`${base}/activity?${query}`, signal),
      );
      if (signal.aborted || old !== generation) return;
      items.replaceChildren(
        ...response.items.map((entry) =>
          (options.renderEntry ?? renderActivityEntry)(entry, signal),
        ),
      );
      if (!response.items.length)
        items.append(
          element(
            'p',
            t('No public publications in this tab.'),
            'public-profile-empty',
          ),
        );
      paging.replaceChildren();
      if (response.next)
        control(paging, t('Next page'), () =>
          activity(response.next, activityTab),
        );
      if (after)
        control(paging, t('Back to start'), () => activity(null, activityTab));
      status.textContent = '';
    }
  }
  function control(
    host: HTMLElement,
    label: string,
    work: () => Promise<void>,
  ): HTMLButtonElement {
    const button = element('button', label);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (button.disabled) return;
      button.disabled = true;
      void work()
        .catch(error)
        .finally(() => {
          if (!lifetime.signal.aborted) button.disabled = false;
        });
    });
    host.append(button);
    return button;
  }
  async function follow(
    header: ProfileHeader,
    summary: ProfileSummary,
    block: PublicBlockState,
  ): Promise<void> {
    const host = header.actions;
    const controller = options.controller;
    if (!controller?.hasSession()) {
      publicProfileGuidanceButton(
        host,
        'follow-profile',
        lifetime.signal,
      ).className = 'profile-follow';
      return;
    }
    if (!controller.profile) await controller.refresh();
    if (lifetime.signal.aborted) return;
    if (!controller.profile) {
      publicProfileGuidanceButton(
        host,
        'follow-profile',
        lifetime.signal,
      ).className = 'profile-follow';
      return;
    }
    if (controller.profile.profile.id === summary.profile.id) {
      const edit = link(header.name, '', editPublicProfileHash);
      edit.className = 'profile-edit';
      edit.setAttribute('aria-label', t('Edit public profile'));
      edit.title = t('Edit public profile');
      edit.append(communityIcon('pencil'));
      return;
    }
    await profileSocialControls(host, summary, {
      menuHost: bar.menu,
      controller,
      signal: lifetime.signal,
      error,
      block,
      changed: load,
    });
  }
  void load().catch(error);
  return () => {
    lifetime.abort();
    contentAbort.abort();
    page.replaceChildren();
  };
}
