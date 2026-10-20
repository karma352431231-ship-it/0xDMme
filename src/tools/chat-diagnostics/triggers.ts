import type { RecordEvent } from './recording.ts';

/** Passive same-origin wakeups only. Listeners neither read arbitrary message
 * data nor post messages, request permission, fetch data or change app state. */
export function observeSyncTriggers(record: RecordEvent): () => void {
  const abort = new AbortController(),
    signal = abort.signal;
  for (const event of [
    '0xdmme-message-controls',
    '0xdmme-history-imported',
    '0xdmme-profile-preferences',
  ])
    window.addEventListener(event, () => record('local-trigger', { event }), {
      signal,
    });
  navigator.serviceWorker?.addEventListener(
    'message',
    (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (
        typeof data === 'object' &&
        data !== null &&
        'type' in data &&
        data.type === 'ACTIVITY_CHANGED'
      )
        record('push-wakeup');
    },
    { signal },
  );
  const channels =
    typeof BroadcastChannel === 'undefined'
      ? []
      : ['0xdmme-message-controls', '0xdmme-device-changes'].map((name) => {
          const channel = new BroadcastChannel(name);
          channel.addEventListener(
            'message',
            () => record('cross-tab-trigger', { category: name }),
            { signal },
          );
          return channel;
        });
  return () => {
    abort.abort();
    for (const channel of channels) channel.close();
  };
}
