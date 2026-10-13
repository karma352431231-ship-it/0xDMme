import { t } from '../../shared/i18n/index.ts';
import { anchoredMessageMenu } from '../message-menu/index.ts';
/** Actions available to public-identity DMs, without borrowing private-message consent or wallet. */
export function dmMessageMenu(
  row: HTMLElement,
  input: {
    text: string;
    signal: AbortSignal;
  },
): () => void {
  const menu = anchoredMessageMenu({ signal: input.signal });
  const copy = document.createElement('button'),
    status = document.createElement('p');
  copy.type = 'button';
  copy.textContent = t('Copiar texto');
  status.setAttribute('role', 'status');
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(input.text).catch(() => {
      if (!input.signal.aborted)
        status.textContent = t('Não foi possível copiar o texto.');
    });
  });
  menu.panel.append(copy);
  row.append(menu.host, status);
  return menu.stop;
}
