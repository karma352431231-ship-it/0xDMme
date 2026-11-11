import { t } from '../../shared/i18n/index.ts';
import { setHistoryWindowReturn } from './history-position.ts';

/** Presentation of a bounded historical search window; its reader owns the anchor. */
export function renderSearchReturn(
  history: HTMLElement,
  focus?: { active: () => boolean; latest: () => void },
): void {
  history.parentElement?.querySelector('.chat-search-latest')?.remove();
  const active = focus?.active() ?? false;
  setHistoryWindowReturn(history, active ? focus?.latest : undefined);
  if (!active || !focus) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chat-search-latest';
  button.textContent = t('Return to latest messages');
  button.addEventListener('click', focus.latest);
  history.before(button);
}
