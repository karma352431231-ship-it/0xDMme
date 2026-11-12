import { currentLanguage, t } from '../../shared/i18n/index.ts';

interface TimedResult {
  sentAt?: number;
}

/**
 * Results found so far, newest first. Search reads the device index in
 * storage order, so each page is merged into one dated list; results whose
 * send time is unknown (indexed before times were kept) follow in found order.
 */
export function newestFirst<T extends TimedResult>(items: readonly T[]): T[] {
  const timed = items
    .filter((item) => item.sentAt !== undefined)
    .sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));
  return [...timed, ...items.filter((item) => item.sentAt === undefined)];
}

/** Pages may arrive in storage order; retain the latest match in each conversation. */
export function latestConversationMatches<
  T extends TimedResult & { peer: string; sequence: number },
>(items: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const item of items) {
    const previous = latest.get(item.peer);
    if (!previous || newerMatch(item, previous)) latest.set(item.peer, item);
  }
  return newestFirst([...latest.values()]).slice(0, 100);
}
/** Every distinct match in one conversation, newest first, bounded like the list above. */
export function conversationMatches<
  T extends TimedResult & { id: string; peer: string; sequence: number },
>(conversation: string, items: readonly T[]): T[] {
  const unique = new Map<string, T>();
  for (const item of items)
    if (item.peer === conversation && !unique.has(item.id))
      unique.set(item.id, item);
  return newestFirst(
    [...unique.values()].sort((a, b) => b.sequence - a.sequence),
  ).slice(0, 200);
}
function newerMatch(
  next: TimedResult & { sequence: number },
  current: TimedResult & { sequence: number },
): boolean {
  if (
    next.sentAt !== undefined &&
    current.sentAt !== undefined &&
    next.sentAt !== current.sentAt
  )
    return next.sentAt > current.sentAt;
  if (next.sequence !== current.sequence)
    return next.sequence > current.sequence;
  return next.sentAt !== undefined && current.sentAt === undefined;
}

/** Date and time of a result, since matches span days and conversations. */
export function searchResultTime(sentAt: number | undefined): HTMLElement {
  const time = document.createElement('time');
  time.className = 'search-result-time';
  if (sentAt === undefined) {
    time.textContent = t('Time unknown');
    return time;
  }
  const date = new Date(sentAt);
  time.dateTime = date.toISOString();
  time.textContent = date.toLocaleString(currentLanguage(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return time;
}
