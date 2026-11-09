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
  if (!state.resetPending && visible(history))
    state.position = capture(history);
  state.resetPending = false;
  const position = state.position;
  return () => {
    if (rows) observeArrivals(state, rows, position.follow);
    if (!visible(history)) return;
    restorePosition(history, position);
    if (atBottom(history)) clearArrivals(state);
    if (state.arrivals) showArrivals(history, state);
  };
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
function showArrivals(history: HTMLElement, state: HistoryState): void {
  const button = (state.button ??= arrivalButton(history, state));
  button.textContent = t(
    state.arrivals === 1 ? '{0} new message' : '{0} new messages',
    [state.arrivals],
  );
  button.hidden = false;
}
function arrivalButton(
  history: HTMLElement,
  state: HistoryState,
): HTMLButtonElement {
  const button = history.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'chat-new-messages';
  button.title = t('Return to latest messages');
  button.setAttribute('aria-live', 'polite');
  button.addEventListener('click', (event) => {
    history.scrollTop = history.scrollHeight;
    clearArrivals(state);
    if (event.detail === 0) history.focus({ preventScroll: true });
  });
  history.addEventListener(
    'scroll',
    () => {
      if (visible(history) && atBottom(history)) clearArrivals(state);
    },
    { passive: true },
  );
  history.after(button);
  return button;
}
