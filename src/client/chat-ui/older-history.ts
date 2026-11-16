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
  /** Transient scheduling pressure is distinct from the end of history. */
  ready?: () => boolean;
  conversation?: () => string | null;
  oldest?: () => number | null;
  load: () => Promise<boolean>;
  signal: AbortSignal;
}): OlderHistory {
  const { history, button, signal } = input;
  let active: object | null = null;
  let stalled = false;
  let frame: number | null = null;
  let conversation = input.conversation?.();
  let oldest = input.oldest?.();
  const updateWindow = () => {
    const next = input.conversation?.();
    if (next !== conversation) {
      conversation = next;
      active = null;
      stalled = false;
    }
    const cursor = input.oldest?.();
    if (cursor !== oldest) {
      oldest = cursor;
      stalled = false;
    }
  };
  const visible = () =>
    !signal.aborted &&
    !history.hidden &&
    history.isConnected &&
    history.clientHeight > 0 &&
    history.ownerDocument.visibilityState === 'visible';
  const show = () => {
    if (!button) return;
    button.hidden = !active && !(stalled && input.available());
    button.disabled = active !== null;
    button.textContent = active
      ? t('Loading earlier messages…')
      : t('Earlier messages');
  };
  const read = () => {
    if (active || !visible() || !input.available() || input.ready?.() === false)
      return;
    const attempt = {};
    const before = oldest;
    active = attempt;
    show();
    void input
      .load()
      .catch(() => false)
      .then((progressed) => {
        if (signal.aborted || active !== attempt) return;
        active = null;
        const reached = input.oldest?.();
        stalled =
          !progressed &&
          (reached == null || (before != null && reached >= before));
        oldest = reached;
        show();
        if (!stalled)
          frame = requestAnimationFrame(() => {
            frame = null;
            check();
          });
      });
  };
  const nearHistoryTop = () => {
    if (signal.aborted) return;
    if (history.scrollTop >= nearTop) stalled = false;
    else if (!stalled) read();
    show();
  };
  const check = () => {
    if (signal.aborted) return;
    updateWindow();
    nearHistoryTop();
  };
  history.addEventListener('scroll', nearHistoryTop, { passive: true, signal });
  history.ownerDocument.addEventListener('visibilitychange', check, { signal });
  signal.addEventListener(
    'abort',
    () => {
      if (frame !== null) cancelAnimationFrame(frame);
    },
    { once: true },
  );
  button?.addEventListener(
    'click',
    () => {
      updateWindow();
      stalled = false;
      read();
    },
    { signal },
  );
  show();
  return { check };
}
