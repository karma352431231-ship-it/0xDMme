import type { RecordEvent } from './recording.ts';
import { ConversationInteractions } from './interactions.ts';

function chatState() {
  const status = document.querySelector('[data-message-status]');
  const history = document.querySelector<HTMLElement>('[data-message-history]');
  return {
    syncing: ['Syncing…', 'Syncing…', '正在同步…'].includes(
      status?.textContent ?? '',
    ),
    historyPresent: history !== null,
    historyHidden: !!history?.closest('[hidden]'),
    renderedMessages: history?.querySelectorAll('[data-message]').length ?? 0,
    visible: document.visibilityState === 'visible',
  };
}

/** Fixed status flags, node counts and action categories only. Never capture
 * bubble contents, identities, input, screenshots or arbitrary attributes. */
export function observePage(record: RecordEvent): () => void {
  const abort = new AbortController();
  const interactions = new ConversationInteractions();
  const signal = abort.signal;
  for (const type of [
    'focus',
    'blur',
    'online',
    'offline',
    'pageshow',
    'pagehide',
  ])
    window.addEventListener(type, () => record('page-event', { event: type }), {
      signal,
    });
  for (const type of ['visibilitychange', 'freeze', 'resume'])
    document.addEventListener(
      type,
      () =>
        record('page-event', {
          event: type,
          visible: document.visibilityState === 'visible',
        }),
      { signal },
    );
  document.addEventListener(
    'click',
    (event) => {
      const action = interactions.read(event.target);
      if (action) record('user-action', action);
    },
    { signal, capture: true },
  );
  let previous = '',
    pending: ReturnType<typeof setTimeout> | null = null;
  const changed = () => {
    pending = null;
    const state = chatState(),
      serialized = JSON.stringify(state);
    if (serialized === previous) return;
    previous = serialized;
    record('chat-ui', state);
  };
  const observer = new MutationObserver(() => {
    if (pending === null) pending = setTimeout(changed, 50);
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden'],
  });
  changed();
  return () => {
    abort.abort();
    observer.disconnect();
    if (pending !== null) clearTimeout(pending);
  };
}

export function observeLag(record: RecordEvent): () => void {
  let expected = performance.now() + 250;
  const timer = setInterval(() => {
    const now = performance.now(),
      delay = Math.round(now - expected);
    expected = now + 250;
    if (delay >= 100)
      record(
        document.visibilityState === 'visible'
          ? 'event-loop-lag'
          : 'background-timer-delay',
        { delayMs: delay },
      );
  }, 250);
  let observer: PerformanceObserver | null = null;
  const supported =
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes.includes('longtask');
  record('lag-coverage', { longTasks: supported, timerIntervalMs: 250 });
  if (supported) {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries().slice(0, 32))
        record('long-task', { durationMs: Math.round(entry.duration) });
    });
    observer.observe({ type: 'longtask' });
  }
  return () => {
    clearInterval(timer);
    observer?.disconnect();
  };
}
