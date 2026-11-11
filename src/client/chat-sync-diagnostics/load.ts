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
  started = performance.now(),
): LoadTrace {
  let ended = false;
  let framePending = false;
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
      if (ended || framePending || typeof requestAnimationFrame === 'undefined')
        return;
      framePending = true;
      requestAnimationFrame(() => {
        framePending = false;
        if (!current()) {
          point('cancelled', { loadOutcome: 'cancelled' });
          return;
        }
        if (!loadHostVisible(host)) return;
        point('frame', { loadPresentation: 'dom-frame-opportunity' });
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
