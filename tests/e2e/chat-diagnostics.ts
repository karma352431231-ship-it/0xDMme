import { readChatSyncTrace } from '../../src/shared/chat-sync-diagnostics/index.ts';
import type { ChatSyncTrace } from '../../src/shared/chat-sync-diagnostics/index.ts';
interface Observation {
  page: number;
  event: Record<string, unknown>;
}
interface Work {
  page: number;
  operation: string;
  count: number;
  queueMs: number[];
  runMs: number[];
  outcomes: Record<string, number>;
}
/** Report only the existing content-free protocol. Browser-local work spans
 * remain separate distributions; overlapping spans never become a fake total. */
export function diagnosticSummary(events: readonly Observation[]) {
  const work = new Map<string, Work>();
  const stages = new Map<
    string,
    { page: number; event: string; reason: string; count: number }
  >();
  for (const observation of events) {
    if (observation.event['event'] !== 'diagnostic') continue;
    const trace = readChatSyncTrace(observation.event['detail']);
    if (!trace) continue;
    if (trace.event === 'work') recordWork(work, observation.page, trace);
    if (trace.event !== 'group-send' && trace.event !== 'group-receive')
      continue;
    const key = `${observation.page}:${trace.event}:${trace.reason}`;
    const stage = stages.get(key) ?? {
      page: observation.page,
      event: trace.event,
      reason: trace.reason,
      count: 0,
    };
    stage.count++;
    stages.set(key, stage);
  }
  return { work: [...work.values()], stages: [...stages.values()] };
}
function recordWork(
  work: Map<string, Work>,
  page: number,
  trace: ChatSyncTrace,
): void {
  if (!trace.operation) return;
  const key = `${page}:${trace.operation}`;
  const value = work.get(key) ?? {
    page,
    operation: trace.operation,
    count: 0,
    queueMs: [],
    runMs: [],
    outcomes: {},
  };
  value.count++;
  if (trace.queueMs !== undefined) value.queueMs.push(trace.queueMs);
  if (trace.runMs !== undefined) value.runMs.push(trace.runMs);
  if (trace.outcome)
    value.outcomes[trace.outcome] = (value.outcomes[trace.outcome] ?? 0) + 1;
  work.set(key, value);
}
