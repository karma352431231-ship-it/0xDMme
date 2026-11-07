import { t } from '../../shared/i18n/index.ts';
import { pingChipMarkup } from '../ping/index.ts';
import { chatIcon } from '../chat-ui/index.ts';

const preference = '0xdmme:dm-safety-dismissed';
let dismissed = false;
function hidden(): boolean {
  try {
    return dismissed || localStorage.getItem(preference) === 'true';
  } catch {
    return dismissed;
  }
}
/** A device-local presentation preference; no account, conversation or message data. */
export function dmSafetyNotice(): HTMLElement | null {
  if (hidden()) return null;
  const container = document.createElement('div');
  container.innerHTML = pingChipMarkup(
    'alert',
    t('dm.private-info-warning'),
    'warn',
  );
  const notice = container.firstElementChild as HTMLElement;
  notice.classList.add('dm-safety-notice');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'dm-safety-close';
  close.setAttribute('aria-label', t('Hide safety notice'));
  close.innerHTML = chatIcon('close');
  close.addEventListener('click', () => {
    dismissed = true;
    try {
      localStorage.setItem(preference, 'true');
    } catch {
      /* This session still honors dismissal. */
    }
    document
      .querySelectorAll('.dm-safety-notice')
      .forEach((item) => item.remove());
  });
  notice.append(close);
  return notice;
}
