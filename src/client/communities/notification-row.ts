import { t, currentLanguage } from '../../shared/i18n/index.ts';
import { noticeLink, bindNoticeRow } from '../activity/index.ts';
import type { ReplyNotification } from '../../shared/community-posts/index.ts';
import { communityElement as el } from './elements.ts';
/** The paginated community inbox uses the same individual-open contract as Atividade. */
export function publicationNotificationRow(
  item: ReplyNotification,
  actions: { open: (id: string) => Promise<void>; current: () => boolean },
): HTMLElement {
  const row = el('div', '', 'community-row community-notification-row');
  row.dataset['read'] = String(item.read);
  const link = noticeLink({
    label: item.read ? t('Publicação lida') : t('Nova publicação'),
    href: `#communities?id=${item.community}&post=${item.reply}`,
    read: item.read,
    acknowledge: () => actions.open(item.reply),
    current: actions.current,
    acknowledged: () => {
      item.read = true;
      row.dataset['read'] = 'true';
    },
  });
  row.append(
    link,
    el('small', new Date(item.createdAt).toLocaleString(currentLanguage())),
  );
  bindNoticeRow(row, link);
  return row;
}
