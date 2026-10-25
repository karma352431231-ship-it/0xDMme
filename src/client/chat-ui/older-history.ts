import { t } from '../../shared/i18n/index.ts';

/** Distance from the top, in the history's own pixels, that starts a read. */
const nearTop = 240;

export interface OlderHistory {
  /** Call after each render: a short window, or one still at the top, reads on. */
  check(): void;
}

/**
 * Reads older history when the reader scrolls near the top of a conversation
 * (owner request, 24/10/2026), one read at a time. `load` resolves true when
 * the window reached further back. The former "Earlier messages" button stays
 * as the progress line and, after a read that failed or found nothing new
 * while more may exist, as a manual retry. The signal ends the binding.
 */
export function watchOlderHistory(input: {
  history: HTMLElement;
  button: HTMLButtonElement | null;
  available: () => boolean;
  load: () => Promise<boolean>;
  signal: AbortSignal;
}): OlderHistory {
  const { history, button, signal } = input;
  let loading = false,
    stalled = false;
  const show = () => {
    if (!button) return;
    button.hidden = !loading && !(stalled && input.available());
    button.disabled = loading;
    button.textContent = loading
      ? t('Loading earlier messages…')
      : t('Earlier messages');
  };
  const read = () => {
    if (loading || signal.aborted || !input.available()) return;
    loading = true;
    show();
    void input
      .load()
      .catch(() => false)
      .then((progressed) => {
        loading = false;
        stalled = !progressed;
        show();
        if (progressed) requestAnimationFrame(check);
      });
  };
  const check = () => {
    if (
      !stalled &&
      !history.hidden &&
      history.isConnected &&
      history.scrollTop < nearTop
    )
      read();
    else show();
  };
  history.addEventListener('scroll', check, { passive: true, signal });
  button?.addEventListener(
    'click',
    () => {
      stalled = false;
      read();
    },
    { signal },
  );
  show();
  return { check };
}
