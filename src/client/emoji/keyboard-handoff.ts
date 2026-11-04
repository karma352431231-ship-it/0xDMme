/** Retain the dock's space until the keyboard resizes the viewport, avoiding an intermediate full-height chat. */
export function holdKeyboardSpace(host: HTMLElement): () => void {
  if (
    host.contains(document.activeElement) &&
    document.activeElement?.matches('input, textarea')
  )
    return () => {};
  const placeholder = document.createElement('div');
  placeholder.className = 'emoji-keyboard-handoff';
  placeholder.style.height = `${host.getBoundingClientRect().height}px`;
  host.after(placeholder);
  const before = window.visualViewport?.height ?? window.innerHeight;
  const events = new AbortController();
  const timer = setTimeout(stop, 500);
  function stop(): void {
    clearTimeout(timer);
    events.abort();
    placeholder.remove();
  }
  function resized(): void {
    const height = window.visualViewport?.height ?? window.innerHeight;
    if (height < before - 60) stop();
  }
  window.addEventListener('resize', resized, { signal: events.signal });
  window.visualViewport?.addEventListener('resize', resized, {
    signal: events.signal,
  });
  return stop;
}
