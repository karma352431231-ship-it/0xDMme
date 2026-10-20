/** Foreground rechecks follow the private chat: hiding a healthy tab keeps
 * continuity; loss of the stream or actual suspension closes the history. */
export function bindDmLifecycle(options: {
  current: () => boolean;
  pause: () => void;
  refresh: () => void;
  reconnect: () => void;
  visible?: () => void;
}): () => void {
  const abort = new AbortController(),
    signal = abort.signal;
  let suspended = false;
  const resume = () => {
    if (!suspended && options.current()) return;
    suspended = false;
    options.pause();
    if (navigator.onLine) {
      options.reconnect();
      options.refresh();
    }
  };
  const pause = () => {
    suspended = true;
    options.pause();
  };
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'visible') {
        resume();
        options.visible?.();
      }
    },
    { signal },
  );
  document.addEventListener('freeze', pause, { signal });
  document.addEventListener('resume', resume, { signal });
  window.addEventListener('offline', pause, { signal });
  window.addEventListener('online', resume, { signal });
  window.addEventListener('pagehide', pause, { signal });
  window.addEventListener('pageshow', resume, { signal });
  return () => abort.abort();
}
