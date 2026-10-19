/** Each row owns its avatar work until replacement, search close or navigation. */
const lifetimes = new WeakMap<
  HTMLElement,
  { stop: AbortController; version: string | undefined }
>();

export function paintConversationAvatar(
  row: HTMLElement,
  host: HTMLElement,
  render: ((host: HTMLElement, signal: AbortSignal) => void) | undefined,
  version?: string,
): void {
  if (!render) return;
  const current = lifetimes.get(row);
  if (current && !current.stop.signal.aborted && current.version === version) {
    if (version === undefined) render(host, current.stop.signal);
    return;
  }
  releaseConversationAvatar(row);
  const stop = new AbortController();
  lifetimes.set(row, { stop, version });
  render(host, stop.signal);
}

export function releaseConversationAvatar(row: HTMLElement): void {
  lifetimes.get(row)?.stop.abort();
  lifetimes.delete(row);
}

export function releaseConversationAvatars(host: HTMLElement): void {
  for (const row of host.querySelectorAll<HTMLElement>('.conversation-row')) {
    releaseConversationAvatar(row);
  }
}
