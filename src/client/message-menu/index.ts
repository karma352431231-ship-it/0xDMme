import { t } from '../../shared/i18n/index.ts';
import { layoutBox, layoutViewport } from '../display-scale/index.ts';
interface MessageMenuOptions {
  signal: AbortSignal;
}
/** Compact anchored menu; native popover stays above scrolling chat without a modal backdrop. */
export function anchoredMessageMenu(options: MessageMenuOptions): {
  host: HTMLElement;
  panel: HTMLElement;
  trigger: HTMLButtonElement;
  stop: () => void;
} {
  const host = document.createElement('div'),
    panel = document.createElement('div'),
    trigger = document.createElement('button');
  host.className = 'message-actions';
  trigger.type = 'button';
  trigger.className = 'chat-icon';
  trigger.setAttribute('aria-label', t('Message options'));
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  panel.className = 'message-menu';
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', t('Message options'));
  panel.popover = 'auto';
  panel.hidden = true;
  let opened = false,
    active: AbortController | null = null;
  const close = (): void => {
    if (!opened) return;
    opened = false;
    if (typeof panel.hidePopover === 'function') panel.hidePopover();
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    active?.abort();
    active = null;
  };
  const open = (): void => {
    if (opened) {
      close();
      return;
    }
    if (options.signal.aborted) return;
    panel.hidden = false;
    if (typeof panel.showPopover === 'function') panel.showPopover();
    opened = true;
    trigger.setAttribute('aria-expanded', 'true');
    placeMessageMenu(panel, trigger);
    active = new AbortController();
    const signal = AbortSignal.any([active.signal, options.signal]);
    document.addEventListener(
      'click',
      (event) => {
        if (event.target instanceof Node && !host.contains(event.target))
          close();
      },
      { signal },
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') {
          close();
          trigger.focus();
        }
      },
      { signal },
    );
    window.addEventListener(
      'scroll',
      (event) => {
        if (event.target instanceof Node && panel.contains(event.target))
          return;
        close();
      },
      { signal, capture: true, passive: true },
    );
    window.addEventListener('resize', close, { signal });
    panel.querySelector<HTMLElement>('button, select')?.focus();
  };
  trigger.addEventListener('click', open);
  panel.addEventListener('toggle', () => {
    if (!panel.matches(':popover-open')) close();
  });
  panel.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof Element && event.target.closest('button'))
        close();
    },
    { capture: true },
  );
  const stop = (): void => {
    close();
    options.signal.removeEventListener('abort', stop);
  };
  options.signal.addEventListener('abort', stop, { once: true });
  host.append(trigger, panel);
  return { host, panel, trigger, stop };
}
/** Keep the menu inside the chat's visible intersection with the viewport. */
function placeMessageMenu(panel: HTMLElement, trigger: HTMLElement): void {
  const anchor = layoutBox(trigger.getBoundingClientRect(), panel),
    bounds = visibleChatBounds(trigger, panel);
  panel.style.width = `${Math.min(272, bounds.right - bounds.left)}px`;
  panel.style.maxHeight = `${Math.max(80, bounds.bottom - bounds.top)}px`;
  const height = panel.offsetHeight,
    width = panel.offsetWidth;
  const top =
    anchor.bottom + height <= bounds.bottom
      ? anchor.bottom
      : Math.max(bounds.top, anchor.top - height);
  panel.style.top = `${top}px`;
  panel.style.left = `${Math.min(Math.max(bounds.left, anchor.right - width), bounds.right - width)}px`;
}

function visibleChatBounds(trigger: HTMLElement, panel: HTMLElement) {
  const view = layoutViewport(panel),
    rect = trigger.closest('.chat-panel')?.getBoundingClientRect(),
    chat = rect
      ? layoutBox(rect, panel)
      : { left: 8, right: view.width - 8, top: 8, bottom: view.height - 8 };
  return {
    left: Math.max(8, chat.left),
    right: Math.min(view.width - 8, chat.right),
    top: Math.max(8, chat.top),
    bottom: Math.min(view.height - 8, chat.bottom),
  };
}
