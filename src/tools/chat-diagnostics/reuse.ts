import {
  chatSyncControl,
  chatSyncEvent,
  readChatSyncTrace,
} from '../../shared/chat-sync-diagnostics/index.ts';
import type { RecordEvent } from './recording.ts';

/** New app builds acknowledge internal coverage; old builds remain explicit. */
export function observeReuseDecisions(
  record: RecordEvent,
  coverage?: (available: boolean) => void,
): () => void {
  const abort = new AbortController();
  let ready = false;
  window.addEventListener(
    chatSyncEvent,
    (event) => {
      if (!(event instanceof CustomEvent)) return;
      const trace = readChatSyncTrace(event.detail);
      if (!trace) return;
      if (trace.event === 'ready') ready = true;
      const { event: kind, ...data } = trace;
      record(`reuse-${kind}`, data);
    },
    { signal: abort.signal },
  );
  window.dispatchEvent(new CustomEvent(chatSyncControl, { detail: 'start' }));
  record('reuse-coverage', {
    available: ready,
    version: 1,
    history: 'since-installation-only',
    conversationSlots: 'stable-within-capture-up-to-128-recent-contacts',
  });
  coverage?.(ready);
  return () => {
    abort.abort();
    window.dispatchEvent(new CustomEvent(chatSyncControl, { detail: 'stop' }));
  };
}
