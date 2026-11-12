import {
  chatSyncControl,
  chatSyncEvent,
  readChatSyncTrace,
} from '../../shared/chat-sync-diagnostics/index.ts';
import type { RecordEvent } from './recording.ts';

/** New app builds acknowledge internal coverage; old builds remain explicit. */
export function observeReuseDecisions(
  record: RecordEvent,
  coverage?: (
    available: boolean,
    sendTimings: boolean,
    handleTimings: boolean,
    revision: number,
  ) => void,
): () => void {
  const abort = new AbortController();
  let early = false;
  let revision = 0;
  let ready = false,
    sendTimings = false,
    handleTimings = false;
  window.addEventListener(
    chatSyncEvent,
    (event) => {
      if (!(event instanceof CustomEvent)) return;
      const trace = readChatSyncTrace(event.detail);
      if (!trace) return;
      if (trace.event === 'ready') {
        ready = true;
        early = trace.earlyTimings === true;
        handleTimings = trace.handleTimings === true;
        revision = trace.handleRevision ?? 0;
        coverage?.(true, trace.sendTimings === true, handleTimings, revision);
      }
      if (trace.event === 'ready') sendTimings = trace.sendTimings === true;
      const { event: kind, ...data } = trace;
      record(`reuse-${kind}`, data);
      recordBootTask(trace, record);
      if (kind === 'native-request') recordNativeRequest(trace, record);
    },
    { signal: abort.signal },
  );
  window.dispatchEvent(new CustomEvent(chatSyncControl, { detail: 'start' }));
  record('reuse-coverage', {
    available: ready,
    sendTimings,
    handleTimings,
    handleRevision: revision,
    version: 1,
    history: early
      ? 'diagnostic-launch-and-current-document'
      : 'since-installation-only',
    conversationSlots: 'stable-within-capture-up-to-128-recent-contacts',
  });
  coverage?.(ready, sendTimings, handleTimings, revision);
  return () => {
    abort.abort();
    window.dispatchEvent(new CustomEvent(chatSyncControl, { detail: 'stop' }));
  };
}

function recordNativeRequest(
  trace: import('../../shared/chat-sync-diagnostics/index.ts').ChatSyncTrace,
  record: RecordEvent,
): void {
  if (trace.nativeRequest === undefined || !trace.nativeCategory) return;
  const kind = {
    start: 'request-start',
    headers: 'response-headers',
    body: 'response-body',
    failed: 'request-failed',
    cancelled: 'response-body-failed',
    transfer: 'native-transfer',
    json: 'native-json',
  }[trace.nativePhase ?? 'failed'];
  record(kind, {
    id: `native-${trace.nativeRequest}`,
    category: trace.nativeCategory,
    transport: 'native',
    ...(trace.nativeStatus === undefined ? {} : { status: trace.nativeStatus }),
    ...(trace.nativeBytes === undefined ? {} : { bytes: trace.nativeBytes }),
    durationMs: trace.nativeMs ?? 0,
    serverUnixMs: trace.nativeServerUnixMs ?? 0,
    ...(trace.beforeCaptureMs === undefined
      ? {}
      : { beforeCaptureMs: trace.beforeCaptureMs }),
  });
}

function recordBootTask(
  trace: import('../../shared/chat-sync-diagnostics/index.ts').ChatSyncTrace,
  record: RecordEvent,
): void {
  const kind = trace.event;
  if (kind === 'boot-task' && typeof trace.bootTaskMs === 'number')
    record('long-task', {
      durationMs: trace.bootTaskMs,
      ...(trace.beforeCaptureMs === undefined
        ? {}
        : { beforeCaptureMs: trace.beforeCaptureMs }),
    });
}
