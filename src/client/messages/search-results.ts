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
