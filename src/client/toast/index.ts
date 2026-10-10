/**
 * One short notice at the bottom center of the screen (limits, refusals),
 * announced to screen readers. A new notice replaces the previous one.
 */
let notice: HTMLElement | null = null;
let timer = 0;

export function showToast(message: string): void {
  if (!notice) {
    notice = document.createElement('div');
    notice.className = 'app-toast';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
  }
  if (!notice.isConnected) document.body.append(notice);
  notice.textContent = message;
  notice.hidden = false;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (notice) notice.hidden = true;
  }, 6000);
}
