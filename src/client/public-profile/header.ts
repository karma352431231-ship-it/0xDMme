import { t, currentLanguage } from '../../shared/i18n/index.ts';
import type { ProfileSummary } from '../../shared/profile-social/index.ts';
import { communityIcon } from '../communities/index.ts';
import { renderMentions } from '../public-mentions/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';

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

export interface ProfileBar {
  node: HTMLElement;
  /** Shows the loaded handle and clears the options of the previous render. */
  show: (handle: string) => void;
  /** Receives the "..." menu of another person's profile. */
  menu: HTMLElement;
}

/**
 * The top row of a profile: the way back, the handle and the options. `back`
 * is the exact feed position the profile was opened from; without one the
 * browser history decides, and a directly opened link falls back to the feed.
 */
export function profileBar(back: string | null): ProfileBar {
  const node = element('div', '', 'public-profile-bar'),
    link = element('a', '', 'public-profile-back'),
    title = element('span', '', 'public-profile-bar-title'),
    menu = element('div', '', 'public-profile-bar-menu');
  link.href = back ?? '#communities';
  link.setAttribute('aria-label', back ? t('Back to feed') : t('Back'));
  link.append(communityIcon('back'));
  if (!back && history.length > 1)
    link.addEventListener('click', (event) => {
      event.preventDefault();
      history.back();
    });
  node.append(link, title, menu);
  return {
    node,
    menu,
    show(handle) {
      title.textContent = `@${handle}`;
      menu.replaceChildren();
    },
  };
}

function followerCount(count: number): HTMLElement {
  const node = element('span');
  node.append(
    element('strong', count.toLocaleString(currentLanguage())),
    ` ${count === 1 ? t('follower') : t('followers')}`,
  );
  return node;
}
function profileMeta(summary: ProfileSummary): HTMLElement {
  const meta = element('p', '', 'public-profile-meta');
  meta.append(followerCount(summary.followers));
  if (summary.createdAt)
    meta.append(
      element(
        'span',
        t('Since {0}', [
          new Date(summary.createdAt).toLocaleDateString(currentLanguage(), {
            month: 'long',
            year: 'numeric',
          }),
        ]),
      ),
    );
  return meta;
}

export interface ProfileHeader {
  node: HTMLElement;
  /** Holds the edit pencil of one's own profile, beside the name. */
  name: HTMLElement;
  /** Holds Message, Follow and the notification bell. */
  actions: HTMLElement;
  /** Holds the mutual followers line. */
  social: HTMLElement;
}

/** Who this profile is: banner, photo, name, description and summary line. */
export function profileHeader(
  summary: ProfileSummary,
  signal: AbortSignal,
): ProfileHeader {
  const node = element('header', '', 'public-profile-header'),
    banner = element('div', '', 'public-profile-banner'),
    identity = element('div', '', 'public-profile-identity'),
    avatar = element('div', '@', 'public-profile-avatar'),
    name = element('div', '', 'public-profile-name'),
    social = element('div', '', 'public-profile-social'),
    actions = element('div', '', 'public-profile-actions');
  if (summary.banner)
    showPublicAvatar(banner, {
      kind: 'profile-banner',
      target: summary.profile.id,
      reference: summary.banner,
      signal,
    });
  if (summary.profile.avatar) {
    avatar.textContent = '';
    showPublicAvatar(avatar, {
      kind: 'avatar',
      target: summary.profile.id,
      reference: summary.profile.avatar,
      signal,
    });
  }
  name.append(element('h1', `@${summary.profile.handle}`));
  identity.append(avatar, name);
  if (summary.description) {
    const description = element('p', '', 'public-profile-description');
    renderMentions(description, summary.description);
    identity.append(description);
  }
  identity.append(profileMeta(summary), social, actions);
  node.append(banner, identity);
  return { node, name, actions, social };
}
