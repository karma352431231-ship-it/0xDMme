import { pingElement } from '../ping/index.ts';

/**
 * One short notice at the bottom center of the screen (limits, refusals),
 * announced to screen readers. A new notice replaces the previous one.
 * Confirmations pass `success` to show Ping's happy face beside the text.
 */
let notice: HTMLElement | null = null;
let timer = 0;

export function showToast(
  message: string,
  options: { success?: boolean } = {},
): void {
  if (!notice) {
    notice = document.createElement('div');
    notice.className = 'app-toast';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
  }
  if (!notice.isConnected) document.body.append(notice);
  if (options.success) {
    const text = document.createElement('span');
    text.textContent = message;
    notice.replaceChildren(pingElement('happy', 'sm'), text);
  } else notice.textContent = message;
  notice.hidden = false;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (notice) notice.hidden = true;
  }, 6000);
}
