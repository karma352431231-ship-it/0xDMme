import type {
  LoadDiagnosticFields,
  LoadStage,
  LoadToken,
} from '../../shared/chat-sync-diagnostics/load.ts';

type Fields = Pick<
  LoadDiagnosticFields,
  | 'loadHistoryMode'
  | 'loadRows'
  | 'loadBytes'
  | 'loadReusedBytes'
  | 'loadOutcome'
  | 'loadPresentation'
  | 'loadStageMs'
  | 'loadInitial'
  | 'loadTransferBytes'
  | 'loadTransferBlocks'
  | 'loadTransferPlannedBytes'
  | 'loadTransferPlannedBlocks'
>;
/** One capture-local attempt. Its caller owns completion/cancellation. */
export interface LoadTrace {
  token?: LoadToken;
  point: (stage: LoadStage, fields?: Fields) => void;
  measure: <T>(stage: LoadStage, work: () => Promise<T>) => Promise<T>;
  frame: (host: HTMLElement, current: () => boolean) => void;
}
export function timedLoad<T>(
  trace: LoadTrace | undefined,
  stage: LoadStage,
  work: () => Promise<T>,
): Promise<T> {
  return trace ? trace.measure(stage, work) : work();
}
export function createLoadTrace(
  emit: (fields: LoadDiagnosticFields) => void,
  started = performance.now(),
): LoadTrace {
  let ended = false;
  let framePending = false;
  const point: LoadTrace['point'] = (stage, fields = {}) => {
    if (ended) return;
    const at = Math.round(performance.now());
    emit({
      loadStage: stage,
      loadClockMs: at,
      loadMs: Math.max(0, at - Math.round(started)),
      ...fields,
    });
    ended = ['complete', 'failed', 'cancelled'].includes(stage);
  };
  point('start');
  return {
    point,
    async measure(stage, work) {
      const start = performance.now();
      try {
        return await work();
      } finally {
        point(stage, {
          loadStageMs: Math.max(0, Math.round(performance.now() - start)),
        });
      }
    },
    frame(host, current) {
      if (ended || framePending || typeof requestAnimationFrame === 'undefined')
        return;
      framePending = true;
      const queued = performance.now();
      requestAnimationFrame(() => {
        framePending = false;
        if (!current()) {
          point('cancelled', { loadOutcome: 'cancelled' });
          return;
        }
        if (!loadHostVisible(host)) return;
        point('frame', {
          loadPresentation: 'dom-frame-opportunity',
          loadStageMs: Math.round(performance.now() - queued),
        });
        point('complete', { loadOutcome: 'complete' });
      });
    },
  };
}

export function loadHostVisible(host: HTMLElement): boolean {
  return (
    host.isConnected &&
    !host.closest('[hidden]') &&
    document.visibilityState === 'visible' &&
    host.getClientRects().length > 0
  );
}

export function endHistoryLoad(
  trace: LoadTrace | undefined,
  outcome: 'failed' | 'cancelled' | 'unavailable',
): void {
  trace?.point(outcome === 'failed' ? 'failed' : 'cancelled', {
    loadOutcome: outcome,
  });
}

/** Measure admission or scheduler delay at the first call, without timing idle work twice. */
export function historyWait(
  trace: LoadTrace | undefined,
  stage: 'queue' | 'vault',
): () => void {
  if (!trace) return () => {};
  const started = performance.now();
  let measured = false;
  return () => {
    if (measured) return;
    measured = true;
    trace.point(stage, {
      loadStageMs: Math.round(performance.now() - started),
    });
  };
}

/** Only call after the operation's own verified rows have reached this host. */
export function presentHistoryLoad(
  trace: LoadTrace | undefined,
  history: HTMLElement | null,
  rows: number,
  current: () => boolean,
): void {
  if (!trace) return;
  trace.point('published', { loadRows: rows });
  if (history && loadHostVisible(history))
    trace.frame(history, () => current() && loadHostVisible(history));
  else trace.point('cancelled', { loadOutcome: 'unavailable' });
}

export function timedLoadSync<T>(
  trace: LoadTrace | undefined,
  stage: LoadStage,
  work: () => T,
): T {
  if (!trace) return work();
  const start = performance.now();
  try {
    return work();
  } finally {
    trace.point(stage, { loadStageMs: Math.round(performance.now() - start) });
  }
}
