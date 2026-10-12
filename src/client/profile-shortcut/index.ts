const mountedEvent = '0xdmme-profile-shortcut-mounted';
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
