import { t } from '../../shared/i18n/index.ts';
import type { RankingScope } from '../communities/index.ts';

export type RightColumn = 'chat' | RankingScope;

/**
 * Split screen (16/10/2026): the right column shows the conversation or the
 * communities ranking; since 19/10/2026 the user ranking is a third choice
 * beside Communities. It starts on Chat; opening a conversation returns to
 * Chat; a new message never switches the view. Unread badges belong to the
 * Private/Public directory choices.
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
