import { t } from '../../shared/i18n/index.ts';
/**
 * Small preview cards shown while a mouse rests on a profile or community
 * link. Each feature registers what it previews; touch screens keep the plain
 * tap that opens the page. Cards read public data only and close on leave,
 * scroll or Escape.
 */
export type HoverCardRender = (
  card: HTMLElement,
  signal: AbortSignal,
) => Promise<void>;
/** Returns how to fill a card for this link, or null when it is not previewed. */
export type HoverCardProvider = (
  link: HTMLAnchorElement,
) => HoverCardRender | null;

const openDelay = 450,
  closeDelay = 220;
const providers: HoverCardProvider[] = [];
let installed = false;

export function registerHoverCard(provider: HoverCardProvider): void {
  providers.push(provider);
  if (installed || typeof document === 'undefined') return;
  if (typeof window === 'undefined') return;
  if (typeof document.addEventListener !== 'function') return;
  installed = true;
  install();
}

function install(): void {
  let source: HTMLAnchorElement | null = null,
    card: HTMLElement | null = null,
    abort: AbortController | null = null,
    openTimer = 0,
    closeTimer = 0;
  const close = (): void => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    abort?.abort();
    abort = null;
    card?.remove();
    card = null;
    source = null;
  };
  const scheduleClose = (): void => {
    clearTimeout(closeTimer);
    closeTimer = window.setTimeout(close, closeDelay);
  };
  const open = (link: HTMLAnchorElement, render: HoverCardRender): void => {
    close();
    source = link;
    abort = new AbortController();
    const next = document.createElement('div');
    next.className = 'hover-card';
    next.setAttribute('role', 'dialog');
    next.setAttribute('aria-label', t('Preview'));
    next.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    next.addEventListener('pointerleave', scheduleClose);
    document.body.append(next);
    card = next;
    place(next, link);
    const signal = abort.signal;
    void render(next, signal)
      .then(() => {
        if (!signal.aborted) place(next, link);
      })
      .catch(() => {
        if (!signal.aborted) close();
      });
  };
  document.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse' || !(event.target instanceof Element))
      return;
    if (card?.contains(event.target)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href]');
    if (!link || link === source) {
      if (link) clearTimeout(closeTimer);
      return;
    }
    const render = providers.map((provider) => provider(link)).find(Boolean);
    if (!render) return;
    // A previous leave must not cancel the next link before its open delay.
    close();
    openTimer = window.setTimeout(() => open(link, render), openDelay);
    link.addEventListener(
      'pointerleave',
      () => {
        clearTimeout(openTimer);
        if (source === link) scheduleClose();
      },
      { once: true },
    );
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Node) || !card?.contains(event.target))
      close();
  });
  window.addEventListener('scroll', close, { capture: true, passive: true });
  window.addEventListener('hashchange', close);
}

/** Below the link when it fits, otherwise above; always inside the viewport. */
function place(card: HTMLElement, link: HTMLElement): void {
  const anchor = link.getBoundingClientRect(),
    width = card.offsetWidth,
    height = card.offsetHeight,
    gap = 8;
  const below = anchor.bottom + gap + height <= window.innerHeight;
  const top = below
    ? anchor.bottom + gap
    : Math.max(gap, anchor.top - gap - height);
  const left = Math.min(
    Math.max(gap, anchor.left),
    window.innerWidth - width - gap,
  );
  card.style.top = `${Math.round(top)}px`;
  card.style.left = `${Math.round(Math.max(gap, left))}px`;
}
