import { appAddress } from '../app-navigation/index.ts';

const mountedEvent = '0xdmme-profile-shortcut-mounted';
/** Fired once a public profile exists, for features that set up after it. */
export const publicProfileCreatedEvent = '0xdmme-public-profile-created';
/** Direct public-profile setup/edit category shared by participation links. */
export const editPublicProfileHash = '#settings?section=profile';
// The page a setup link was followed from, kept in memory for this visit only.
let returnAddress: string | null = null;
/** A setup link remembers where it was clicked, so creation can lead back. */
export function rememberProfileReturn(link: HTMLAnchorElement): void {
  link.addEventListener('click', () => {
    returnAddress = appAddress();
  });
}
/** The remembered page, read once when the public profile is created. */
export function takeProfileReturn(): string | null {
  const address = returnAddress;
  returnAddress = null;
  return address;
}
/** Leaving setup without creating a profile ends the way back. */
export function forgetProfileReturn(): void {
  returnAddress = null;
}
/** A public action someone cannot take yet: it names the public-profile
 * prerequisite and opens its setup, which also asks to sign in when needed. */
export function participationLink(
  link: HTMLAnchorElement,
  label: string,
): void {
  link.href = editPublicProfileHash;
  link.setAttribute('aria-label', label);
  link.title = label;
  rememberProfileReturn(link);
}
/** Both community layouts request the same public identity presentation. */
export function appendOwnProfileShortcut(host: HTMLElement): void {
  const link = document.createElement('a');
  link.className = 'own-public-profile-shortcut community-own-profile-shortcut';
  link.dataset['ownPublicProfile'] = '';
  link.hidden = true;
  host.append(link);
  window.dispatchEvent(new Event(mountedEvent));
}
export function watchProfileShortcuts(paint: () => void): void {
  const lifetime = new AbortController();
  window.addEventListener(mountedEvent, paint, { signal: lifetime.signal });
  window.addEventListener('pagehide', () => lifetime.abort(), { once: true });
}
