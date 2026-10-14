import { t } from '../../shared/i18n/index.ts';
import { pingElement } from './art.ts';

/**
 * A small line above the conversation list while the browser is offline.
 * One pair of window listeners serves every notice for the app's lifetime.
 */
let listening = false;

function paint(): void {
  document
    .querySelectorAll<HTMLElement>('[data-offline-notice]')
    .forEach((notice) => {
      notice.hidden = navigator.onLine;
    });
}

export function mountOfflineNotice(before: HTMLElement): void {
  if (!before.previousElementSibling?.hasAttribute('data-offline-notice')) {
    const notice = document.createElement('p');
    notice.className = 'ping-chip offline-notice';
    notice.dataset['offlineNotice'] = '';
    notice.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = t(
      'Sem conexão · histórico salvo disponível neste aparelho',
    );
    notice.append(pingElement('offline', 'sm'), text);
    before.before(notice);
  }
  if (!listening) {
    listening = true;
    window.addEventListener('online', paint);
    window.addEventListener('offline', paint);
  }
  paint();
}
