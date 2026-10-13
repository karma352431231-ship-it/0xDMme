import type { MentionNotification } from '../../shared/mention-notifications/index.ts';
import { mentionNotificationHref } from '../../shared/mention-notifications/index.ts';
import { noticeLink, bindNoticeRow } from './notice-link.ts';
export function mentionRows(
  items: readonly MentionNotification[],
  actions: { open: (id: string) => Promise<void>; current: () => boolean },
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
    title.textContent = `@${item.actor.handle} mencionou você`;
    text.className = 'activity-quote';
    text.textContent = item.text;
    const labels = {
      post: 'em uma postagem',
      reply: 'em uma resposta',
      profile: 'na descrição do perfil',
      community: 'na descrição da comunidade',
    };
    detail.textContent = `${labels[item.source.kind]}${item.source.name ? ' ' + item.source.name : ''} · ${new Date(item.createdAt).toLocaleString('pt-BR')}`;
    copy.append(title, text, detail);
    const link = noticeLink({
      label: 'Abrir',
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
    row.append(copy, controls);
    return row;
  });
}
