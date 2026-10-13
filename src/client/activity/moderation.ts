import { t } from '../../shared/i18n/index.ts';
import { noticeLink, bindNoticeRow } from './notice-link.ts';
export interface ModerationActivity {
  id: string;
  title: string;
  reason: string;
  review?: string;
  read?: boolean;
}
/** Refresh the bounded public notice sources; background tabs do no polling. */
export function watchModeration(
  refresh: () => Promise<void>,
  signal: AbortSignal,
): void {
  let timer: ReturnType<typeof setTimeout>;
  const cancel = () => clearTimeout(timer);
  const check = async () => {
    signal.removeEventListener('abort', cancel);
    if (signal.aborted) return;
    try {
      if (!document.hidden) await refresh();
    } finally {
      if (!signal.aborted) schedule();
    }
  };
  function schedule(): void {
    timer = setTimeout(() => {
      void check();
    }, 30_000);
    signal.addEventListener('abort', cancel, { once: true });
  }
  schedule();
}
export function moderationRows(
  items: readonly ModerationActivity[],
  actions: {
    acknowledge: (id: string) => Promise<void>;
    current: () => boolean;
  },
): HTMLElement[] {
  return items.map((item) => {
    const row = document.createElement('li'),
      title = document.createElement('strong'),
      reason = document.createElement('p'),
      copy = document.createElement('div'),
      controls = document.createElement('div');
    const link = noticeLink({
      label: t('Ver análise e contestar'),
      href: `#analise?id=${encodeURIComponent(item.review ?? item.id.split(':')[0] ?? '')}`,
      read: item.read === true,
      acknowledge: () => actions.acknowledge(item.id),
      current: actions.current,
      acknowledged: () => {
        item.read = true;
      },
    });
    row.className = 'activity-row';
    title.textContent = item.title;
    reason.textContent = item.reason;
    row.dataset['read'] = String(item.read === true);
    copy.className = 'activity-copy';
    controls.className = 'activity-actions';
    copy.append(title, reason);
    controls.append(link);
    row.append(copy, controls);
    bindNoticeRow(row, link);
    return row;
  });
}
