import { t } from '../../shared/i18n/index.ts';
import { menuIcon } from '../menu-icons/index.ts';

/** The small star beside the time of a starred message (12/11/2026). */
export function starMark(): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'star-mark';
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', t('Starred'));
  mark.title = t('Starred');
  mark.append(menuIcon('star'));
  return mark;
}
