import type {
  LoadDiagnosticFields,
  LoadStage,
} from '../../shared/chat-sync-diagnostics/load.ts';

type Fields = Pick<
  LoadDiagnosticFields,
  'loadRows' | 'loadBytes' | 'loadOutcome' | 'loadPresentation' | 'loadStageMs'
>;
/** One capture-local attempt. Its caller owns completion/cancellation. */
export interface LoadTrace {
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
): LoadTrace {
  const started = performance.now();
  let ended = false;
  const point: LoadTrace['point'] = (stage, fields = {}) => {
    if (ended) return;
    emit({
      loadStage: stage,
      loadMs: Math.max(0, Math.round(performance.now() - started)),
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
      if (typeof requestAnimationFrame === 'undefined') return;
      requestAnimationFrame(() => {
        if (!current()) {
          point('cancelled', { loadOutcome: 'cancelled' });
          return;
        }
        if (
          !host.isConnected ||
          host.closest('[hidden]') ||
          document.visibilityState !== 'visible' ||
          !host.getClientRects().length
        )
          return;
        point('frame', { loadPresentation: 'dom-frame-opportunity' });
        point('complete', { loadOutcome: 'complete' });
      });
    },
  };
}
