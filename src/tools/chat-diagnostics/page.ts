import type { RecordEvent } from './recording.ts';

function chatState() {
  const status = document.querySelector('[data-message-status]');
  const history = document.querySelector<HTMLElement>('[data-message-history]');
  return {
    syncing: ['Sincronizando…', 'Syncing…', '正在同步…'].includes(
      status?.textContent ?? '',
    ),
    historyPresent: history !== null,
    historyHidden: !!history?.closest('[hidden]'),
    visible: document.visibilityState === 'visible',
  };
}

function actionCategory(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  if (target.closest('.conversation-row')) return 'conversation-open';
  if (target.closest('[data-message-refresh]')) return 'manual-sync';
  if (target.closest('[data-chat-back]')) return 'conversation-back';
  if (target.closest('[data-message-older], [data-group-older]'))
    return 'older-messages';
  if (target.closest('[data-call-start], .call-actions button'))
    return 'call-control';
  return null;
}

/** Static UI labels only; never enumerate bubbles, read identities or capture
 * input/keystrokes, private text, attributes, screenshots or error messages. */
export function observePage(record: RecordEvent): () => void {
  const abort = new AbortController();
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
      const category = actionCategory(event.target);
      if (category) record('user-action', { category });
    },
    { signal, capture: true },
  );
  document.addEventListener(
    'submit',
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.matches('[data-message-compose], [data-group-compose]')
      )
        record('user-action', { category: 'message-submit' });
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
