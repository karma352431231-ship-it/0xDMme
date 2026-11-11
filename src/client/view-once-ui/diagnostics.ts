import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import type { ProtectedDisplay } from './display.ts';

/** Missing diagnostic support must never interrupt a protected viewing. */
export async function protectedPresentation(input: {
  display: ProtectedDisplay;
  id: string;
  signal: AbortSignal;
  trace: LoadTrace | undefined;
}): Promise<void> {
  if (!input.trace) return;
  try {
    const frame = await input.display.presented?.({
      id: input.id,
      signal: input.signal,
    });
    const fields = presentationFields(frame);
    input.trace.point('native-frame', {
      loadStageMs: fields.elapsedMs,
      loadPresentation: fields.presentation,
    });
    input.trace.point('complete', {
      loadOutcome: fields.outcome,
    });
  } catch {
    input.trace.point('complete', {
      loadOutcome: input.signal.aborted ? 'cancelled' : 'unavailable',
    });
  }
}
function presentationFields(
  frame:
    Awaited<ReturnType<NonNullable<ProtectedDisplay['presented']>>> | undefined,
) {
  const state = frame?.state ?? 'unavailable';
  const ready = state === 'native-draw' || state === 'video-frame';
  return {
    elapsedMs: frame?.elapsedMs ?? 0,
    presentation: ready ? state : ('unavailable' as const),
    outcome: ready
      ? ('complete' as const)
      : state === 'timeout'
        ? ('timeout' as const)
        : ('unavailable' as const),
  };
}
export function failedProtectedLoad(
  trace: LoadTrace | undefined,
  signal: AbortSignal,
): void {
  trace?.point('failed', {
    loadOutcome: signal.aborted ? 'cancelled' : 'failed',
  });
}
