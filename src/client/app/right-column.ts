import { t } from '../../shared/i18n/index.ts';

export type RightColumn = 'chat' | 'communities';

/**
 * Split screen (16/10/2026): the right column shows the conversation or the
 * communities ranking. It starts on Chat; opening a conversation returns to
 * Chat; a new message never switches the view, it only adds to the badge on
 * Chat. The badge sums the unread counters the conversation list shows.
 */
export function startRightColumn(options: {
  shell: HTMLElement;
  showCommunities: () => void;
}): { showChat: () => void } {
  const bar = document.createElement('div');
  bar.className = 'right-switch';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', t('right-column.label'));
  const chat = choice(t('right-column.chat'));
  const communities = choice(t('right-column.communities'));
  const badge = document.createElement('span');
  badge.className = 'right-switch-badge';
  badge.hidden = true;
  chat.append(badge);
  bar.append(chat, communities);
  options.shell.append(bar);
  const show = (column: RightColumn) => {
    options.shell.dataset['right'] = column;
    chat.setAttribute('aria-pressed', String(column === 'chat'));
    communities.setAttribute('aria-pressed', String(column === 'communities'));
    if (column === 'communities') options.showCommunities();
  };
  chat.addEventListener('click', () => show('chat'));
  communities.addEventListener('click', () => show('communities'));
  show('chat');
  watchUnread(badge);
  return { showChat: () => show('chat') };
}

function choice(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  return button;
}

/** Presentation only: reads the counters already rendered in the list. */
function watchUnread(badge: HTMLElement): void {
  const list = document.querySelector<HTMLElement>('[data-message-contacts]');
  if (!list) return;
  let queued = false;
  const paint = () => {
    queued = false;
    let total = 0;
    list.querySelectorAll('.conversation-unread').forEach((node) => {
      total += Number.parseInt(node.textContent ?? '', 10) || 0;
    });
    badge.hidden = total === 0;
    badge.textContent = total > 99 ? '99+' : String(total);
  };
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  }).observe(list, { subtree: true, childList: true, characterData: true });
  paint();
}
