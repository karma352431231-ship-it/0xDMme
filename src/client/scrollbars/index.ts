/** How long a scrollbar stays visible after its element stops scrolling. */
export const scrollbarIdleMs = 2000;
const started = new WeakSet<Document>();

/**
 * Scrollbars show only while their element scrolls (17/10/2026): one
 * delegated, passive listener marks the scrolled element and clears the mark
 * once it has been still for scrollbarIdleMs. scrollbars.css draws the thumb
 * only on marked elements, without a track.
 */
export function startScrollbarFade(root: Document = document): void {
  if (started.has(root)) return;
  started.add(root);
  const timers = new WeakMap<Element, number>();
  root.addEventListener(
    'scroll',
    (event) => {
      const target =
        event.target instanceof Element ? event.target : root.scrollingElement;
      if (!target) return;
      window.clearTimeout(timers.get(target));
      if (!target.hasAttribute('data-scrolling'))
        target.setAttribute('data-scrolling', '');
      timers.set(
        target,
        window.setTimeout(() => {
          timers.delete(target);
          target.removeAttribute('data-scrolling');
        }, scrollbarIdleMs),
      );
    },
    { capture: true, passive: true },
  );
}
