import { AccountError } from '../../shared/account/index.ts';
import { ApiResponseError } from '../api-response/index.ts';
import { traceChatSync } from '../chat-sync-diagnostics/index.ts';
import { workInterruption } from '../synchronization-work/index.ts';
import type { WorkDiagnosticFields } from '../../shared/chat-sync-diagnostics/index.ts';

const now = () => globalThis.performance?.now() ?? Date.now();

function outcome(error: unknown): NonNullable<WorkDiagnosticFields['outcome']> {
  const interruption = workInterruption(error);
  if (interruption)
    return interruption.expected ? 'interrupted' : 'authorization';
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  return apiOutcome(error);
}
function apiOutcome(
  error: unknown,
): NonNullable<WorkDiagnosticFields['outcome']> {
  if (error instanceof AccountError) {
    if ([401, 403].includes(error.status)) return 'authorization';
    if (error.status === 409) return 'conflict';
  }
  if (!(error instanceof ApiResponseError)) return 'failed';
  if (error.failure === 'timeout') return 'timeout';
  return error.failure === 'cancelled' ? 'cancelled' : 'failed';
}
/** Local opt-in trace only. Callers use fixed operation names, never account IDs,
 * payloads, error messages, decrypted content or secrets. No retained telemetry. */
export async function measureWork<T>(
  owner: object,
  operation: string,
  work: () => Promise<T>,
  queuedAt = now(),
): Promise<T> {
  const started = now();
  let result: NonNullable<WorkDiagnosticFields['outcome']> = 'complete';
  let origin: WorkDiagnosticFields['origin'];
  try {
    return await work();
  } catch (error: unknown) {
    result = outcome(error);
    origin = workInterruption(error)?.origin;
    throw error;
  } finally {
    traceChatSync(owner, null, {
      event: 'work',
      reason: 'settled',
      operation,
      outcome: result,
      ...(origin ? { origin } : {}),
      queueMs: Math.max(0, Math.round(started - queuedAt)),
      runMs: Math.max(0, Math.round(now() - started)),
    });
  }
}
