import { observeMessageControls } from '../message-controls/index.ts';

interface MessageLifecycle {
  offline: () => void;
  online: () => void;
  visibility: () => void;
  controls: () => void;
  devices: () => void;
  imported: () => void;
  preferences: () => void;
  tick: () => Promise<void>;
  progress: (progress: { done: number; total: number }) => void;
  beforeUnload: (event: BeforeUnloadEvent) => void;
  pageHide: (event: PageTransitionEvent) => void;
  pageShow: (event: PageTransitionEvent) => void;
}

/** One binding per chat coordinator, released on permanent page departure. */
export function bindMessageLifecycle(options: MessageLifecycle): () => void {
  const abort = new AbortController(),
    signal = abort.signal;
  const timer = setInterval(() => {
    void options.tick();
  }, 30000);
  const stopControls = observeMessageControls(options.controls);
  const channel =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel('0xdmme-device-changes');
  channel?.addEventListener('message', options.devices, { signal });
  window.addEventListener('offline', options.offline, { signal });
  window.addEventListener('online', options.online, { signal });
  document.addEventListener('visibilitychange', options.visibility, { signal });
  window.addEventListener('0xdmme-history-imported', options.imported, {
    signal,
  });
  window.addEventListener('0xdmme-profile-preferences', options.preferences, {
    signal,
  });
  window.addEventListener('beforeunload', options.beforeUnload, { signal });
  window.addEventListener(
    '0xdmme-attachment-progress',
    (event) => {
      options.progress(
        (event as CustomEvent<{ done: number; total: number }>).detail,
      );
    },
    { signal },
  );
  window.addEventListener(
    'pagehide',
    (event) => {
      options.pageHide(event);
      if (!event.persisted) close();
    },
    { signal },
  );
  window.addEventListener('pageshow', options.pageShow, { signal });
  function close(): void {
    if (signal.aborted) return;
    abort.abort();
    clearInterval(timer);
    stopControls();
    channel?.close();
  }
  return close;
}
