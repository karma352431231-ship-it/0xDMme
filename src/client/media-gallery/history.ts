import { t, translatedError } from '../../shared/i18n/index.ts';
import { networkOnlineEvent } from '../connectivity/index.ts';

export interface GalleryOlderHistory {
  available: () => boolean;
  /** True when the verified window moved further back. */
  load: () => Promise<boolean>;
}

/** Fill short lists and extend scrollable ones near the bottom. One older page
 * can be in flight. A stalled read retries on the next navigation or reconnect. */
export function watchGalleryHistory(input: {
  body: HTMLElement;
  notice: HTMLElement;
  older: GalleryOlderHistory;
  repaint: () => void;
  signal: AbortSignal;
}): () => void {
  const { body, notice, older, repaint, signal } = input;
  const document = body.ownerDocument;
  let frame: number | undefined;
  let reading = false;
  let stalled = false;
  const schedule = () => {
    if (signal.aborted || frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      void read();
    });
  };
  const resume = () => {
    stalled = false;
    schedule();
  };
  const ready = () =>
    !reading &&
    !stalled &&
    !signal.aborted &&
    document.visibilityState !== 'hidden' &&
    nearBottom(body) &&
    older.available();
  async function read(): Promise<void> {
    if (!ready()) return;
    reading = true;
    notice.textContent = t('Loading earlier messages…');
    try {
      stalled = !(await older.load());
      if (signal.aborted) return;
      repaint();
      notice.textContent =
        stalled && older.available()
          ? t('Could not complete the operation.')
          : '';
    } catch (error) {
      stalled = true;
      if (!signal.aborted)
        notice.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Could not complete the operation.');
    } finally {
      reading = false;
      if (!stalled) schedule();
    }
  }
  body.addEventListener('scroll', resume, { passive: true, signal });
  document.addEventListener('visibilitychange', resume, { signal });
  document.defaultView?.addEventListener(networkOnlineEvent, resume, {
    signal,
  });
  const resize =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  resize?.observe(body);
  signal.addEventListener(
    'abort',
    () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      resize?.disconnect();
    },
    { once: true },
  );
  schedule();
  return resume;
}

function nearBottom(body: HTMLElement): boolean {
  return (
    body.clientHeight > 0 &&
    body.scrollHeight - body.clientHeight - body.scrollTop <= 180
  );
}
