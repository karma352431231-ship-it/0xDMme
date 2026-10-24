import { readChatSyncTrace } from '../../src/shared/chat-sync-diagnostics/index.ts';
import type { ChatSyncTrace } from '../../src/shared/chat-sync-diagnostics/index.ts';
export interface DiagnosticObservation {
  page: number;
  at?: number;
  event: Record<string, unknown>;
}
const stages = [
  'admitted',
  'staged',
  'sending',
  'accepted',
  'settled',
] as const;
type Stage = (typeof stages)[number];
interface Slot {
  page: number;
  event: string;
  times: Partial<Record<Stage, number>>;
}
const intervals = [
  ['admitted', 'staged', 'admissionToStagedMs'],
  ['staged', 'sending', 'stagedToSendingMs'],
  ['staged', 'accepted', 'stagedToAcceptedMs'],
  ['sending', 'accepted', 'sendingToAcceptedMs'],
  ['accepted', 'settled', 'acceptedToSettledMs'],
] as const;
type Interval = (typeof intervals)[number];
interface Cohort {
  page: number;
  event: string;
  slots: number;
  incompleteSlots: number;
  invalidOrder: number;
  admissionToStagedMs: number[];
  stagedToSendingMs: number[];
  stagedToAcceptedMs: number[];
  sendingToAcceptedMs: number[];
  acceptedToSettledMs: number[];
}
type Point =
  | { clocked: false }
  | {
      clocked: true;
      at: number;
      event: string;
      message: number;
      stage: Stage;
    };
function senderPoint(
  observation: DiagnosticObservation,
  trace: ChatSyncTrace,
): Point | null {
  if (
    !['direct-send', 'group-send'].includes(trace.event) ||
    trace.message === undefined
  )
    return null;
  const stage = stages.find((candidate) => candidate === trace.reason);
  if (!stage) return null;
  if (typeof observation.at !== 'number' || !Number.isFinite(observation.at))
    return { clocked: false };
  return {
    clocked: true,
    at: observation.at,
    event: trace.event,
    message: trace.message,
    stage,
  };
}
/** Opaque slots belong to one page AND capture. They never join tabs/devices.
 * Durations use runner observation timestamps; unmatched steps stay missing. */
export function senderPhaseTimings(events: readonly DiagnosticObservation[]) {
  const epochs = new Map<number, number>(),
    slots = new Map<string, Slot>();
  let missingTimestamps = 0;
  for (const observation of events) {
    if (observation.event['event'] !== 'diagnostic') continue;
    const trace = readChatSyncTrace(observation.event['detail']);
    if (!trace) continue;
    if (trace.event === 'ready') {
      epochs.set(observation.page, (epochs.get(observation.page) ?? 0) + 1);
      continue;
    }
    const point = senderPoint(observation, trace);
    if (!point) continue;
    if (!point.clocked) {
      missingTimestamps++;
      continue;
    }
    recordPoint(
      slots,
      epochs.get(observation.page) ?? 0,
      observation.page,
      point,
    );
  }
  const cohorts = new Map<string, Cohort>();
  for (const slot of slots.values()) recordSlot(cohorts, slot);
  return { missingTimestamps, cohorts: [...cohorts.values()] };
}
function recordPoint(
  slots: Map<string, Slot>,
  epoch: number,
  page: number,
  point: Extract<Point, { clocked: true }>,
): void {
  const key = `${page}:${epoch}:${point.event}:${point.message}`;
  const slot = slots.get(key) ?? { page, event: point.event, times: {} };
  slot.times[point.stage] ??= point.at;
  slots.set(key, slot);
}
function recordSlot(cohorts: Map<string, Cohort>, slot: Slot): void {
  const key = `${slot.page}:${slot.event}`;
  const cohort = cohorts.get(key) ?? {
    page: slot.page,
    event: slot.event,
    slots: 0,
    incompleteSlots: 0,
    invalidOrder: 0,
    admissionToStagedMs: [],
    stagedToSendingMs: [],
    stagedToAcceptedMs: [],
    sendingToAcceptedMs: [],
    acceptedToSettledMs: [],
  };
  cohort.slots++;
  if (
    slot.times.admitted === undefined ||
    slot.times.staged === undefined ||
    slot.times.accepted === undefined
  )
    cohort.incompleteSlots++;
  for (const pair of intervals) recordInterval(cohort, slot, pair);
  cohorts.set(key, cohort);
}
function recordInterval(cohort: Cohort, slot: Slot, pair: Interval): void {
  const start = slot.times[pair[0]],
    end = slot.times[pair[1]];
  if (start === undefined || end === undefined) return;
  if (end < start) {
    cohort.invalidOrder++;
    return;
  }
  cohort[pair[2]].push(end - start);
}
