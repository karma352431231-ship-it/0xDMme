/** Each row owns its avatar work until replacement, search close or navigation. */
const lifetimes = new WeakMap<HTMLElement, AbortController>();

export function paintConversationAvatar(
  row: HTMLElement,
  host: HTMLElement,
  render: ((host: HTMLElement, signal: AbortSignal) => void) | undefined,
): void {
  if (!render) return;
  const stop = new AbortController();
  lifetimes.set(row, stop);
  render(host, stop.signal);
}

export function releaseConversationAvatars(host: HTMLElement): void {
  for (const row of host.querySelectorAll<HTMLElement>('.conversation-row')) {
    lifetimes.get(row)?.abort();
    lifetimes.delete(row);
  }
}
