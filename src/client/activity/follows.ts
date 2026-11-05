import { t, currentLanguage } from '../../shared/i18n/index.ts';
import type { FollowNotice } from '../../shared/follow-notices/index.ts';
import { publicIdentityAvatar } from '../public-identity/index.ts';
import { noticeLink, bindNoticeRow } from './notice-link.ts';

/** One row per new follower; opening it shows their profile and marks it read. */
export function followRows(
  items: readonly FollowNotice[],
  actions: {
    open: (id: string) => Promise<void>;
    current: () => boolean;
    signal: AbortSignal;
    changed: () => void;
  },
): HTMLElement[] {
  return items.map((item) => {
    const row = document.createElement('li'),
      copy = document.createElement('div'),
      title = document.createElement('strong'),
      time = document.createElement('small'),
      controls = document.createElement('div');
    row.className = 'activity-row';
    row.dataset['read'] = String(item.read);
    copy.className = 'activity-copy';
    controls.className = 'activity-actions';
    title.textContent = t('@{0} started following you', [item.actor.handle]);
    time.textContent = new Date(item.createdAt).toLocaleString(
      currentLanguage(),
    );
    copy.append(title, time);
    const link = noticeLink({
      label: t('Open'),
      href: `#users?handle=${encodeURIComponent(item.actor.handle)}`,
      read: item.read,
      acknowledge: () => actions.open(item.id),
      current: actions.current,
      acknowledged: () => {
        item.read = true;
        row.dataset['read'] = 'true';
        actions.changed();
      },
    });
    controls.append(link);
    bindNoticeRow(row, link);
    row.append(
      publicIdentityAvatar(item.actor, actions.signal),
      copy,
      controls,
    );
    return row;
  });
}
