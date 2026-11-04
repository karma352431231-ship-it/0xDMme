/** Owns phone visual-viewport metrics; no keyboard guesses or routing state. */
export function startPhoneViewport(): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => undefined;
  const root = document.documentElement;
  const phone = matchMedia('(max-width: 700px)');
  const abort = new AbortController();
  function clear(): void {
    root.style.removeProperty('--phone-viewport-height');
    root.style.removeProperty('--phone-viewport-top');
  }
  function update(): void {
    // Do not fight deliberate pinch zoom or desktop display scaling.
    if (!phone.matches || Math.abs(viewport!.scale - 1) > 0.01) {
      clear();
      return;
    }
    root.style.setProperty('--phone-viewport-height', `${viewport!.height}px`);
    root.style.setProperty('--phone-viewport-top', `${viewport!.offsetTop}px`);
  }
  function close(): void {
    abort.abort();
    clear();
  }
  for (const event of ['resize', 'scroll'])
    viewport.addEventListener(event, update, { signal: abort.signal });
  phone.addEventListener('change', update, { signal: abort.signal });
  window.addEventListener('resize', update, { signal: abort.signal });
  window.addEventListener(
    'pagehide',
    (event) => {
      if (!event.persisted) close();
    },
    { signal: abort.signal },
  );
  update();
  return close;
}
