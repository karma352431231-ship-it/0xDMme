import { t } from '../../shared/i18n/index.ts';

/** Counts come from the conversation models, independently of row filters. */
export function startConversationBadges(shell: HTMLElement) {
  const badges = new Map<string, HTMLElement>();
  for (const scope of ['private', 'public']) {
    const button = shell.querySelector(`[data-scope-choice="${scope}"]`);
    if (!button) continue;
    const badge = document.createElement('span');
    badge.className = 'conversation-scope-badge';
    badge.hidden = true;
    badge.setAttribute('aria-live', 'polite');
    button.append(badge);
    badges.set(scope, badge);
  }
  return (scope: 'private' | 'public', count: number): void => {
    const badge = badges.get(scope);
    if (!badge) return;
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.setAttribute('aria-label', t('{0} unread messages', [count]));
  };
}
