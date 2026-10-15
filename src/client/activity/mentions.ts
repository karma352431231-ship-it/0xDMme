import { publicIdentityAvatar } from '../public-identity/index.ts';
import { t, currentLanguage } from '../../shared/i18n/index.ts';
import type { MentionNotification } from '../../shared/mention-notifications/index.ts';
import { mentionNotificationHref } from '../../shared/mention-notifications/index.ts';
import { noticeLink, bindNoticeRow } from './notice-link.ts';
export function mentionRows(
  items: readonly MentionNotification[],
  actions: {
    open: (id: string) => Promise<void>;
    current: () => boolean;
    signal: AbortSignal;
  },
): HTMLElement[] {
  return items.map((item) => {
    const row = document.createElement('li'),
      copy = document.createElement('div'),
      title = document.createElement('strong'),
      text = document.createElement('p'),
      detail = document.createElement('small'),
      controls = document.createElement('div');
    row.className = 'activity-row';
    row.dataset['read'] = String(item.read);
    copy.className = 'activity-copy';
    controls.className = 'activity-actions';
    title.textContent = t('@{0} mencionou você', [item.actor.handle]);
    text.className = 'activity-quote';
    text.textContent = item.text;
    const labels = {
      post: t('em uma postagem'),
      reply: t('em uma resposta'),
      profile: t('na descrição do perfil'),
      community: t('na descrição da comunidade'),
    };
    detail.textContent = t('{0}{1} · {2}', [
      labels[item.source.kind],
      item.source.name ? ' ' + item.source.name : '',
      new Date(item.createdAt).toLocaleString(currentLanguage()),
    ]);
    copy.append(title, text, detail);
    const link = noticeLink({
      label: t('Abrir'),
      href: mentionNotificationHref(item),
      read: item.read,
      acknowledge: () => actions.open(item.id),
      current: actions.current,
      acknowledged: () => {
        item.read = true;
        row.dataset['read'] = 'true';
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
