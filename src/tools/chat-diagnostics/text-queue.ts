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
  observe(event: TraceEvent, ms: number): void {
    const entry = point(event, ms);
    if (!entry) return;
    if (this.points.length >= limit) this.dropped++;
    else this.points.push(entry);
  }
  report(bounds: QueueBounds) {
    const times = queueTimes(this.points, bounds);
    const range =
      times.start === null || times.end === null
        ? null
        : { startMs: times.start, endMs: times.end };
    const intervals = range ? queueIntervals(this.points, range) : [];
    const blocked = intervals.filter((p) => blockingGate(p.gate));
    const available = intervals.filter((p) => p.gate === 'available');
    const known = [...blocked, ...available];
    return {
      observed: this.points.length > 0,
      emitterTruncated: this.points.some((p) => p.phase === 'truncated'),
      limit,
      dropped: this.dropped,
      points: this.points.map((p) => ({ ...p })),
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
}
function queueTimes(points: readonly QueuePoint[], bounds: QueueBounds) {
  const at = (phase: QueuePoint['phase']) =>
    points.find((p) => p.phase === phase)?.ms ?? null;
  const cancelled = at('cancelled');
  const end = bounds.dispatch ?? bounds.accepted ?? bounds.captureEnd;
  return {
    start: at('durable') ?? bounds.durable,
    end: cancelled === null ? end : Math.min(cancelled, end ?? cancelled),
    cancelled,
    firstDecision: at('decision'),
    firstFlush: at('flush'),
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
    dispatchToAcceptanceMs: difference(bounds.accepted, bounds.dispatch),
    durableToDecisionMs: difference(times.firstDecision, times.start),
    missingDispatch: bounds.dispatch === null,
    cancelledMs: times.cancelled,
    openAtStop:
      bounds.dispatch === null &&
      times.cancelled === null &&
      bounds.captureEnd !== null,
    endBasis: endBasis(bounds, times.cancelled),
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
