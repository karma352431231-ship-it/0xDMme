import { t } from '../../shared/i18n/index.ts';
import { layoutLength } from '../display-scale/index.ts';

interface HistoryMessage {
  own: boolean;
  sequence?: number;
  kind?: string;
  relation?: unknown;
  archived?: boolean;
  localOnly?: boolean;
}
interface ReadingPosition {
  top: number;
  follow: boolean;
  anchors: { row: Element; offset: number }[];
}
interface HistoryState {
  position: ReadingPosition;
  resetPending: boolean;
  latest: number | null;
  arrivals: number;
  button?: HTMLButtonElement;
  returnToLatest?: () => void;
  layout?: HistoryLayout;
}
interface HistoryLayout {
  width: number;
  height: number;
  signal: AbortSignal;
  stop: () => void;
}
const states = new WeakMap<HTMLElement, HistoryState>();
const bottom: ReadingPosition = { top: 0, follow: true, anchors: [] };

function historyState(history: HTMLElement): HistoryState {
  const existing = states.get(history);
  if (existing) return existing;
  const state = {
    position: bottom,
    resetPending: false,
    latest: null,
    arrivals: 0,
  };
  states.set(history, state);
  return state;
}

export function resetHistoryPosition(history: HTMLElement | null): void {
  if (!history) return;
  const state = historyState(history);
  state.position = bottom;
  state.resetPending = true;
  state.latest = null;
  clearArrivals(state);
}

/** Capture before painting; keep the visible rows in place if the reader is
 * above the bottom. Pass verified latest-window rows to count new arrivals. */
export function historyPosition(
  history: HTMLElement,
  rows?: readonly HistoryMessage[],
): () => void {
  const state = historyState(history);
  if (!state.resetPending && visible(history) && sameLayout(history, state))
    state.position = capture(history);
  state.resetPending = false;
  const position = state.position;
  return () => {
    if (rows) observeArrivals(state, rows, position.follow);
    if (!visible(history)) {
      updateShortcut(history, state);
      return;
    }
    restorePosition(history, position);
    state.position = capture(history);
    updateShortcut(history, state);
  };
}

/** Follow the latest messages when keyboard/composer/dock geometry changes.
 * The displayed history's owner supplies its existing cancellation lifetime. */
export function watchHistoryPosition(
  history: HTMLElement,
  signal: AbortSignal,
): void {
  const state = historyState(history);
  if (state.layout?.signal === signal) return;
  state.layout?.stop();
  if (signal.aborted) return;
  const abort = new AbortController();
  const layout: HistoryLayout = {
    width: history.clientWidth,
    height: history.clientHeight,
    signal,
    stop: () => abort.abort(),
  };
  state.layout = layout;
  if (!state.resetPending && visible(history))
    state.position = capture(history);
  const resized = () => {
    if (abort.signal.aborted || !visible(history)) return;
    layout.width = history.clientWidth;
    layout.height = history.clientHeight;
    restorePosition(history, state.position);
    state.position = capture(history);
    updateShortcut(history, state);
  };
  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resized);
  history.addEventListener('scroll', () => rememberPosition(history, state), {
    passive: true,
    signal: abort.signal,
  });
  signal.addEventListener('abort', layout.stop, {
    once: true,
    signal: abort.signal,
  });
  abort.signal.addEventListener(
    'abort',
    () => {
      observer?.disconnect();
      if (state.layout === layout) {
        delete state.layout;
        delete state.returnToLatest;
        if (state.button) state.button.hidden = true;
      }
    },
    { once: true },
  );
  observer?.observe(history);
  updateShortcut(history, state);
}

function rememberPosition(history: HTMLElement, state: HistoryState): void {
  // Native scroll events can precede ResizeObserver after a keyboard resize.
  // Keep the intent captured before that resize, rather than the new geometry.
  if (state.resetPending || !visible(history) || !sameLayout(history, state))
    return;
  state.position = capture(history);
  updateShortcut(history, state);
}
function sameLayout(history: HTMLElement, state: HistoryState): boolean {
  return (
    !state.layout ||
    typeof ResizeObserver === 'undefined' ||
    (state.layout.width === history.clientWidth &&
      state.layout.height === history.clientHeight)
  );
}

function visible(history: HTMLElement): boolean {
  return !history.hidden && history.clientHeight > 0;
}
function atBottom(history: HTMLElement): boolean {
  // scrollTop can be fractional while the scroll and client heights are rounded.
  return history.scrollHeight - history.clientHeight - history.scrollTop <= 2;
}
function capture(history: HTMLElement): ReadingPosition {
  const follow = history.childElementCount === 0 || atBottom(history);
  return {
    top: history.scrollTop,
    follow,
    anchors: follow ? [] : readingAnchors(history),
  };
}
function restorePosition(
  history: HTMLElement,
  position: ReadingPosition,
): void {
  if (position.follow) {
    history.scrollTop = history.scrollHeight;
    return;
  }
  history.scrollTop = position.top;
  const anchor = position.anchors.find(
    ({ row }) => row.isConnected && row.parentElement === history,
  );
  if (anchor)
    history.scrollTop += layoutLength(
      rowOffset(history, anchor.row) - anchor.offset,
      history,
    );
}
function readingAnchors(history: HTMLElement): ReadingPosition['anchors'] {
  if (typeof history.getBoundingClientRect !== 'function') return [];
  const top = history.getBoundingClientRect().top;
  const anchors: ReadingPosition['anchors'] = [];
  for (const row of history.children) {
    const bounds = row.getBoundingClientRect();
    if (bounds.bottom <= top) continue;
    anchors.push({ row, offset: bounds.top - top });
    if (anchors.length === 4) break;
  }
  return anchors;
}
function rowOffset(history: HTMLElement, row: Element): number {
  return row.getBoundingClientRect().top - history.getBoundingClientRect().top;
}
function messageSequence(row: HistoryMessage): number {
  return row.archived || row.localOnly || row.relation || row.kind === 'profile'
    ? 0
    : (row.sequence ?? 0);
}
function observeArrivals(
  state: HistoryState,
  rows: readonly HistoryMessage[],
  follow: boolean,
): void {
  const previous = state.latest;
  let latest = previous ?? 0;
  for (const row of rows) {
    const sequence = messageSequence(row);
    if (!follow && !row.own && previous !== null && sequence > previous)
      state.arrivals++;
    latest = Math.max(latest, sequence);
  }
  state.latest = latest;
}
function clearArrivals(state: HistoryState): void {
  state.arrivals = 0;
  if (state.button) state.button.hidden = true;
}
/** Search presentation supplies its reader's operation, rather than exposing
 * anchors or fetching historical/latest pages from the scroll owner. */
export function setHistoryWindowReturn(
  history: HTMLElement,
  latest: (() => void) | undefined,
): void {
  const state = historyState(history);
  if (latest) state.returnToLatest = latest;
  else delete state.returnToLatest;
  updateShortcut(history, state);
}
function updateShortcut(history: HTMLElement, state: HistoryState): void {
  if (!visible(history) || (atBottom(history) && !state.returnToLatest)) {
    if (visible(history)) clearArrivals(state);
    else if (state.button) state.button.hidden = true;
    return;
  }
  const button = (state.button ??= shortcutButton(history, state));
  paintShortcut(button, state.arrivals);
}
function paintShortcut(button: HTMLButtonElement, arrivals: number): void {
  const count = arrivals
    ? t(arrivals === 1 ? '{0} new message' : '{0} new messages', [arrivals])
    : '';
  if (button.textContent !== count) button.textContent = count;
  const label = count ? `${button.title} · ${count}` : button.title;
  if (button.getAttribute('aria-label') !== label)
    button.setAttribute('aria-label', label);
  if (button.hidden) button.hidden = false;
}
function shortcutButton(
  history: HTMLElement,
  state: HistoryState,
): HTMLButtonElement {
  const button = history.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'chat-new-messages';
  button.title = t('Return to latest messages');
  button.setAttribute('aria-live', 'polite');
  // Pointer activation must not blur the draft and dismiss the phone keyboard.
  // Keyboard activation still moves focus to the history after the jump.
  button.addEventListener('pointerdown', (event) => {
    if (event.button === 0) event.preventDefault();
  });
  button.addEventListener('click', (event) => {
    if (state.returnToLatest) {
      resetHistoryPosition(history);
      state.returnToLatest();
    } else {
      history.scrollTop = history.scrollHeight;
      state.position = capture(history);
      clearArrivals(state);
    }
    if (event.detail === 0) history.focus({ preventScroll: true });
  });
  history.after(button);
  return button;
}
