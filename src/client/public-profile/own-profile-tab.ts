import { t, currentLanguage } from '../../shared/i18n/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { appRoute } from '../../shared/app-routes/index.ts';
import { appAddress } from '../app-navigation/index.ts';
import { editPublicProfileHash } from '../profile-shortcut/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';

/**
 * The phone bottom bar's last tab is the viewer's own public profile
 * (13/11/2026). Without one it leads to the public profile setup, which
 * also asks to sign in when needed.
 */
const tabSelector = '[data-own-profile-tab]';
const personIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

export function paintOwnProfileTabs(
  own: PublicProfile | null,
  signal: AbortSignal,
): void {
  document.querySelectorAll<HTMLAnchorElement>(tabSelector).forEach((tab) => {
    const avatar = tab.querySelector<HTMLElement>('[data-own-profile-avatar]');
    tab.href = own
      ? `#users?handle=${encodeURIComponent(own.handle)}`
      : editPublicProfileHash;
    const label = own
      ? t('Open my public profile')
      : t('Create public profile');
    tab.setAttribute('aria-label', label);
    tab.title = own ? `@${own.handle}` : label;
    if (!avatar) return;
    avatar.replaceChildren();
    if (!own) avatar.innerHTML = personIcon;
    else if (own.avatar)
      showPublicAvatar(avatar, {
        kind: 'avatar',
        target: own.id,
        reference: own.avatar,
        signal,
      });
    else
      avatar.textContent = own.handle
        .slice(0, 2)
        .toLocaleUpperCase(currentLanguage());
  });
  markOwnProfileTabs(own);
}

/** Whether the current page is the viewer's own profile or its setup. */
export function ownProfileOpen(own: PublicProfile | null): boolean {
  const route = appRoute(appAddress());
  if (!route) return false;
  if (route.page === 'settings')
    return !own && route.params.get('section') === 'profile';
  return (
    route.page === 'users' &&
    own !== null &&
    route.params.get('handle')?.toLocaleLowerCase() ===
      own.handle.toLocaleLowerCase()
  );
}

export function markOwnProfileTabs(own: PublicProfile | null): void {
  const tabs = document.querySelectorAll<HTMLAnchorElement>(tabSelector);
  if (!tabs.length) return;
  const open = ownProfileOpen(own);
  tabs.forEach((tab) => {
    if (open) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}
