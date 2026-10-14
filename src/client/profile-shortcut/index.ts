const mountedEvent = '0xdmme-profile-shortcut-mounted';
/** Direct public-profile setup/edit category shared by participation links. */
export const editPublicProfileHash = '#perfil?secao=profile';
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
