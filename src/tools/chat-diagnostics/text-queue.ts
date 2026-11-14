import {
  queueGates,
  queuePhases,
  queueWakeups,
} from '../../shared/chat-sync-diagnostics/text-queue.ts';
import type {
  QueueGate,
  TextQueueObservation,
} from '../../shared/chat-sync-diagnostics/text-queue.ts';
import type { TraceEvent } from './events.ts';
import { clip, duration, subtract } from './send-intervals.ts';
import type { Interval } from './send-intervals.ts';

interface QueuePoint extends TextQueueObservation {
  ms: number;
}
function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : undefined;
}
function point(event: TraceEvent, ms: number): QueuePoint | undefined {
  const phase = queuePhases.find((key) => key === event['queuePhase']);
  const trigger = queueWakeups.find((key) => key === event['queueTrigger']);
  const generation = integer(event['queueGeneration']);
  if (!phase || !trigger || generation === undefined) return;
  const gate = queueGates.find((key) => key === event['queueGate']);
  const batch = integer(event['queueBatch']);
  return {
    phase,
    trigger,
    generation,
    ms,
    ...(gate ? { gate } : {}),
    ...(batch === undefined ? {} : { batch }),
  };
}

const limit = 48;
export class TextQueueObservations {
  private readonly points: QueuePoint[] = [];
  private dropped = 0;
  private readonly dispatches: {
    batch: number | null;
    attempt: number | null;
    ms: number;
  }[] = [];
  private droppedDispatches = 0;
  dispatched(ms: number, batch: number | null, attempt: number | null): void {
    if (this.dispatches.some((p) => p.batch === batch && p.attempt === attempt))
      return;
    if (this.dispatches.length >= 8) {
      this.droppedDispatches++;
      return;
    }
    this.dispatches.push({ batch, attempt, ms });
  }
  observe(event: TraceEvent, ms: number): void {
    const entry = point(event, ms);
    if (!entry) return;
    if (this.points.length >= limit) this.dropped++;
    else this.points.push(entry);
  }
  report(bounds: QueueBounds) {
    const points = admissionPoints(this.points, bounds);
    const times = queueTimes(points, bounds);
    const range =
      times.start === null || times.end === null
        ? null
        : { startMs: times.start, endMs: times.end };
    const intervals = range
      ? queueIntervals(closedAtDispatch(points, bounds), range)
      : [];
    const blocked = intervals.filter((p) => blockingGate(p.gate));
    const available = intervals.filter((p) => p.gate === 'available');
    const known = [...blocked, ...available];
    return {
      observed: this.points.length > 0,
      emitterTruncated: this.points.some((p) => p.phase === 'truncated'),
      limit,
      dropped: this.dropped,
      points: points.map((p) => ({ ...p })),
      retryPoints: retryPoints(this.points, bounds).map((p) => ({ ...p })),
      executingBatch: bounds.executing ?? null,
      dispatches: this.dispatches.map((p) => ({ ...p })),
      droppedDispatches: this.droppedDispatches,
      joinMs: bounds.dispatch,
      admission: admissionKind(times, bounds),
      ...boundaryReport(times, bounds),
      blocked,
      blockedMs: duration(blocked),
      available,
      availableWithoutFlushMs: duration(available),
      unknown: range ? subtract([range], known) : [],
      missingBegin: !this.points.some((p) => p.phase === 'durable'),
    };
  }
}
interface QueueBounds {
  durable: number | null;
  dispatch: number | null;
  accepted: number | null;
  captureEnd: number | null;
  executing?: {
    batch: number;
    attempt: number | null;
    startMs: number | null;
  } | null;
}
function queueTimes(points: readonly QueuePoint[], bounds: QueueBounds) {
  const at = (phase: QueuePoint['phase']) =>
    points.find((p) => p.phase === phase)?.ms ?? null;
  const cancelled = at('cancelled');
  const terminal = bounds.dispatch ?? bounds.accepted ?? bounds.captureEnd;
  const flush = at('flush');
  const end = flush ?? terminal;
  return {
    start: at('durable') ?? bounds.durable,
    end: cancelled === null ? end : Math.min(cancelled, end ?? cancelled),
    cancelled,
    firstDecision: at('decision'),
    firstFlush: flush,
  };
}
function boundaryReport(
  times: ReturnType<typeof queueTimes>,
  bounds: QueueBounds,
) {
  return {
    durableReadyMs: times.start,
    firstDecisionMs: times.firstDecision,
    firstFlushMs: times.firstFlush,
    dispatchMs: bounds.dispatch,
    preparationAfterFlushMs: difference(bounds.dispatch, times.firstFlush),
    dispatchToAcceptanceMs: difference(bounds.accepted, bounds.dispatch),
    durableToDecisionMs: difference(times.firstDecision, times.start),
    missingDispatch: bounds.dispatch === null,
    cancelledMs: times.cancelled,
    openAtStop:
      bounds.dispatch === null &&
      times.cancelled === null &&
      bounds.captureEnd !== null,
    endBasis:
      times.firstFlush === null
        ? endBasis(bounds, times.cancelled)
        : 'queue-flush',
  };
}
function difference(end: number | null, start: number | null): number | null {
  return end === null || start === null ? null : end - start;
}
function endBasis(bounds: QueueBounds, cancelled: number | null): string {
  if (cancelled !== null) return 'cancelled';
  if (bounds.dispatch !== null) return 'dispatch';
  if (bounds.accepted !== null) return 'acceptance';
  return bounds.captureEnd === null ? 'missing' : 'capture-stop';
}

function blockingGate(gate: QueueGate): boolean {
  return !['available', 'unknown', 'no-dirty-work'].includes(gate);
}
function queueIntervals(points: readonly QueuePoint[], range: Interval) {
  return points.flatMap((entry, index) =>
    gateInterval(entry, points[index + 1], range),
  );
}
function gateInterval(
  entry: QueuePoint,
  next: QueuePoint | undefined,
  range: Interval,
) {
  // A request marker is emitted at the same timestamp as its processed decision.
  // An open observation has no verified end and remains unknown.
  if (entry.phase !== 'decision' || !entry.gate || !next) return [];
  const gate = entry.gate;
  return clip([{ startMs: entry.ms, endMs: next.ms }], range).map(
    (interval) => ({ ...interval, gate, batch: entry.batch ?? null }),
  );
}

function admissionPoints(
  points: readonly QueuePoint[],
  bounds: QueueBounds,
): readonly QueuePoint[] {
  const end = bounds.dispatch ?? bounds.accepted;
  return end === null ? points : points.filter((p) => p.ms <= end);
}
function closedAtDispatch(
  points: readonly QueuePoint[],
  bounds: QueueBounds,
): readonly QueuePoint[] {
  if (bounds.dispatch === null) return points;
  return [
    ...points,
    {
      ms: bounds.dispatch,
      phase: 'admitted',
      generation: 0,
      trigger: 'status',
    },
  ];
}
function admissionKind(
  times: ReturnType<typeof queueTimes>,
  bounds: QueueBounds,
): string {
  if (times.firstFlush !== null) return 'own-flush';
  if (bounds.dispatch === null) return 'not-observed';
  return bounds.executing ? 'joined-existing-batch' : 'no-own-flush-observed';
}

function retryPoints(
  points: readonly QueuePoint[],
  bounds: QueueBounds,
): readonly QueuePoint[] {
  const dispatch = bounds.dispatch,
    accepted = bounds.accepted;
  if (dispatch === null) return [];
  return points.filter(
    (p) => p.ms > dispatch && (accepted === null || p.ms <= accepted),
  );
}
