import { t } from '../../shared/i18n/index.ts';
import type { RankingScope } from '../communities/index.ts';

export type RightColumn = 'chat' | RankingScope;

/**
 * Split screen (16/10/2026): the right column shows the conversation or the
 * communities ranking; since 19/10/2026 the user ranking is a third choice
 * beside Communities. It starts on Chat; opening a conversation returns to
 * Chat; a new message never switches the view, it only adds to the badge on
 * Chat. The badge sums the unread counters the conversation list shows.
 */
export function startRightColumn(options: {
  shell: HTMLElement;
  showRanking: (scope: RankingScope) => void;
}): {
  showChat: () => void;
  /** Follows a scope picked inside the ranking itself (full Communities page). */
  followRanking: (scope: RankingScope) => void;
} {
  // The outer cell continues the column's border and background; the track
  // inside holds the two choices.
  const bar = document.createElement('div');
  bar.className = 'right-switch';
  const track = document.createElement('div');
  track.className = 'right-switch-track';
  track.setAttribute('role', 'group');
  track.setAttribute('aria-label', t('right-column.label'));
  bar.append(track);
  const chat = choice(t('right-column.chat'));
  const choices: Record<RightColumn, HTMLButtonElement> = {
    chat,
    communities: choice(t('right-column.communities')),
    users: choice(t('right-column.users')),
  };
  const badge = document.createElement('span');
  badge.className = 'right-switch-badge';
  badge.hidden = true;
  chat.append(badge);
  track.append(...Object.values(choices));
  options.shell.append(bar);
  let current: RightColumn = 'chat';
  const show = (column: RightColumn) => {
    current = column;
    options.shell.dataset['right'] = column;
    for (const [id, button] of Object.entries(choices))
      button.setAttribute('aria-pressed', String(id === column));
    if (column !== 'chat') options.showRanking(column);
  };
  for (const [id, button] of Object.entries(choices))
    button.addEventListener('click', () => show(id as RightColumn));
  show('chat');
  watchUnread(badge);
  return {
    showChat: () => show('chat'),
    followRanking: (scope) => {
      if (current !== 'chat') show(scope);
    },
  };
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
