import { t } from '../../shared/i18n/index.ts';
import type { CommunityTopic } from '../../shared/community-classification/index.ts';
import { communityElement as el } from './elements.ts';
import { rankingTopicMenu } from './ranking-topic-menu.ts';

/** Pointer travel, in pixels, before a press on the row becomes a drag. */
const dragThreshold = 5;

/**
 * Community filters of the ranking sidebar on a single row (31/10/2026): the
 * orders, then the topic pill. Filters that do not fit scroll sideways; the
 * app-wide scrollbar fade shows the bar only while the row moves, and holding
 * the mouse button down drags the row, and a fade on the right edge tells
 * that more filters follow. The topic window is placed below the row, outside
 * its scrolling area.
 */
export function rankingSideFilters<Tab extends string>(options: {
  tabs: readonly (readonly [Tab, string])[];
  tab: Tab;
  selectTab: (tab: Tab) => void;
  topicsChanged: (topics: CommunityTopic[]) => void;
  signal: AbortSignal;
}): HTMLElement {
  const host = el('div', '', 'ranking-side-filters');
  const row = el('div', '', 'ranking-side-tabs');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', t('ranking.filters'));
  const buttons: [Tab, HTMLButtonElement][] = [];
  for (const [id, label] of options.tabs) {
    const button = el('button', t(label));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(id === options.tab));
    button.addEventListener('click', () => {
      for (const [other, node] of buttons)
        node.setAttribute('aria-pressed', String(other === id));
      options.selectTab(id);
    });
    buttons.push([id, button]);
    row.append(button);
  }
  const topics = rankingTopicMenu({
    signal: options.signal,
    change: options.topicsChanged,
  });
  row.append(topics.toggle);
  dragToScroll(row, options.signal);
  host.append(row, topics.panel);
  markHiddenFilters(host, row, options.signal);
  return host;
}

/** `data-more` on the host while filters remain beyond the row's right edge. */
function markHiddenFilters(
  host: HTMLElement,
  row: HTMLElement,
  signal: AbortSignal,
): void {
  const update = () =>
    host.toggleAttribute(
      'data-more',
      row.scrollLeft + row.clientWidth < row.scrollWidth - 1,
    );
  row.addEventListener('scroll', update, { passive: true, signal });
  const resize = new ResizeObserver(update);
  resize.observe(row);
  signal.addEventListener('abort', () => resize.disconnect(), { once: true });
}

/**
 * Mouse drag scrolls the row sideways. A press that stays under the threshold
 * is an ordinary click; after a drag the click that ends it is swallowed so
 * no filter changes by accident. Touch and pens keep native scrolling.
 */
function dragToScroll(row: HTMLElement, signal: AbortSignal): void {
  let start: { x: number; left: number; pointer: number } | null = null;
  let dragged = false;
  row.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      start = {
        x: event.clientX,
        left: row.scrollLeft,
        pointer: event.pointerId,
      };
      dragged = false;
    },
    { signal },
  );
  row.addEventListener(
    'pointermove',
    (event) => {
      if (!start || event.pointerId !== start.pointer) return;
      const distance = event.clientX - start.x;
      if (!dragged && Math.abs(distance) < dragThreshold) return;
      if (!dragged) {
        dragged = true;
        row.setPointerCapture(event.pointerId);
        row.setAttribute('data-dragging', '');
      }
      row.scrollLeft = start.left - distance;
    },
    { signal },
  );
  const end = () => {
    start = null;
    row.removeAttribute('data-dragging');
  };
  row.addEventListener('pointerup', end, { signal });
  row.addEventListener('pointercancel', end, { signal });
  row.addEventListener(
    'click',
    (event) => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true, signal },
  );
}
