const transitionDeadline = 600;
function viewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}
function watchResize(update: () => void, signal: AbortSignal): void {
  window.addEventListener('resize', update, { signal });
  window.visualViewport?.addEventListener('resize', update, { signal });
  // WebView frame animations can advance between resize notifications.
  let frame: number | undefined;
  const sample = () => {
    if (signal.aborted) return;
    update();
    frame = window.requestAnimationFrame?.(sample);
  };
  frame = window.requestAnimationFrame?.(sample);
  signal.addEventListener(
    'abort',
    () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    },
    { once: true },
  );
}
/** The dock grows only into space actually released by the closing keyboard. */
export function replaceKeyboardWithDock(
  host: HTMLElement,
  input: HTMLTextAreaElement,
): () => void {
  if (document.activeElement !== input) return () => {};
  const before = viewportHeight(),
    events = new AbortController();
  let released = 0;
  const update = () => {
    released = Math.max(0, viewportHeight() - before);
    host.style.setProperty(
      '--emoji-replaced-height',
      `${Math.min(360, released)}px`,
    );
  };
  const timer = setTimeout(() => {
    events.abort();
    if (!released) host.style.removeProperty('--emoji-replaced-height');
  }, transitionDeadline);
  update();
  watchResize(update, events.signal);
  return () => {
    clearTimeout(timer);
    events.abort();
    host.style.removeProperty('--emoji-replaced-height');
  };
}
/** Consume the dock reservation progressively, rather than dropping it at the first keyboard frame. */
export function holdKeyboardSpace(host: HTMLElement): () => void {
  if (
    host.contains(document.activeElement) &&
    document.activeElement?.matches('input, textarea')
  )
    return () => {};
  const placeholder = document.createElement('div');
  const height = host.getBoundingClientRect().height,
    before = viewportHeight();
  placeholder.className = 'emoji-keyboard-handoff';
  placeholder.style.height = `${height}px`;
  host.after(placeholder);
  const events = new AbortController();
  const timer = setTimeout(stop, transitionDeadline);
  function stop(): void {
    clearTimeout(timer);
    events.abort();
    placeholder.remove();
  }
  function resized(): void {
    const remaining = Math.max(
      0,
      height - Math.max(0, before - viewportHeight()),
    );
    placeholder.style.height = `${remaining}px`;
    if (!remaining) stop();
  }
  watchResize(resized, events.signal);
  return stop;
}
