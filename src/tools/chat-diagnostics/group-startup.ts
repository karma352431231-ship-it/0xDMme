import { groupStartupStages } from '../../shared/chat-sync-diagnostics/load.ts';
import type { GroupStartupStage } from '../../shared/chat-sync-diagnostics/load.ts';
import { authorityKinds } from '../../shared/chat-sync-diagnostics/flow.ts';
import type { AuthorityKind } from '../../shared/chat-sync-diagnostics/flow.ts';
import type { TraceEvent } from './events.ts';
import type { AuthorityWorkSummary } from './flow.ts';

interface Span {
  startMs: number;
  endMs: number;
}
interface Work {
  slot: number;
  queue: number | undefined;
  kind: AuthorityKind;
  load: number | undefined;
  queued: number | undefined;
  admitted: number | undefined;
  start: number | undefined;
  end: number | undefined;
}
type Blocker = AuthorityKind | 'unobserved' | 'ambiguous';
const number = (value: unknown) =>
  typeof value === 'number' ? value : undefined;
function readWork(work: AuthorityWorkSummary, origin: number): Work {
  const phase = (name: string) =>
    work.events.find((event) => event['workPhase'] === name);
  const first = work.events[0];
  const at = (event: TraceEvent | undefined) => {
    const clock = number(event?.['workClockMs']);
    return clock === undefined ? undefined : clock - origin;
  };
  return {
    slot: work.slot,
    queue: number(first?.['authorityQueue']),
    kind:
      authorityKinds.find((kind) => kind === first?.['authorityKind']) ??
      'vault',
    load: number(first?.['load']),
    queued: at(phase('queued')),
    admitted: at(phase('admitted')),
    start: at(phase('start')),
    end: at(phase('complete') ?? phase('failed')),
  };
}
function clipped(
  start: number | undefined,
  end: number | undefined,
  limit: number,
): Span[] {
  if (start === undefined || end === undefined) return [];
  const span = { startMs: Math.max(0, start), endMs: Math.min(limit, end) };
  return span.endMs > span.startMs ? [span] : [];
}
function merge(spans: readonly Span[]): Span[] {
  const result: Span[] = [];
  for (const span of [...spans].sort((a, b) => a.startMs - b.startMs)) {
    const last = result.at(-1);
    if (last && last.endMs >= span.startMs)
      last.endMs = Math.max(last.endMs, span.endMs);
    else result.push({ ...span });
  }
  return result;
}
const duration = (spans: readonly Span[]) =>
  spans.reduce((total, span) => total + span.endMs - span.startMs, 0);
function gaps(spans: readonly Span[], limit: number): Span[] {
  const result: Span[] = [];
  let cursor = 0;
  for (const span of merge(spans)) {
    result.push(...clipped(cursor, span.startMs, limit));
    cursor = span.endMs;
  }
  result.push(...clipped(cursor, limit, limit));
  return result;
}
function intersection(left: readonly Span[], right: readonly Span[]): number {
  const a = merge(left),
    b = merge(right);
  let i = 0,
    j = 0,
    total = 0;
  while (i < a.length && j < b.length) {
    const x = a[i]!,
      y = b[j]!;
    total += Math.max(
      0,
      Math.min(x.endMs, y.endMs) - Math.max(x.startMs, y.startMs),
    );
    if (x.endMs <= y.endMs) i++;
    else j++;
  }
  return total;
}
/** Only an explicitly linked queue can identify observed holders. Native waits
 * in another document, missing boundaries and overlapping observations stay explicit. */
function blockers(wait: Span, owner: Work, works: readonly Work[]) {
  const edges = works
    .filter(
      (work) =>
        work.slot !== owner.slot &&
        work.queue === owner.queue &&
        owner.queue !== undefined,
    )
    .flatMap((work) =>
      clipped(work.start, work.end, wait.endMs).flatMap((span) => {
        const start = Math.max(wait.startMs, span.startMs);
        return span.endMs > start
          ? [
              { at: start, kind: work.kind, change: 1 },
              { at: span.endMs, kind: work.kind, change: -1 },
            ]
          : [];
      }),
    );
  edges.push({ at: wait.endMs, kind: 'vault', change: 0 });
  edges.sort((a, b) => a.at - b.at);
  const active = new Map<AuthorityKind, number>(),
    totals = new Map<Blocker, number>();
  let count = 0,
    cursor = wait.startMs;
  for (const edge of edges) {
    const kind: Blocker =
      count === 0
        ? 'unobserved'
        : count === 1
          ? active.keys().next().value!
          : 'ambiguous';
    totals.set(kind, (totals.get(kind) ?? 0) + edge.at - cursor);
    const next = (active.get(edge.kind) ?? 0) + edge.change;
    if (next === 0) active.delete(edge.kind);
    else active.set(edge.kind, next);
    count += edge.change;
    cursor = edge.at;
  }
  return [...totals]
    .filter(([, ms]) => ms > 0)
    .map(([category, elapsedMs]) => ({ category, elapsedMs }));
}
function measuredSpan(
  start: number | undefined,
  end: number | undefined,
  limit: number,
): number | null {
  return start === undefined || end === undefined
    ? null
    : duration(clipped(start, end, limit));
}
function workIntervals(work: Work, limit: number) {
  const executionEnd =
    work.end ?? (work.kind === 'group-directory' ? limit : undefined);
  const waitEnd = work.start ?? work.end;
  return {
    waitEnd,
    executionEnd,
    wait: clipped(work.queued, waitEnd, limit),
    execution: clipped(work.start, executionEnd, limit),
  };
}
function workReport(work: Work, all: readonly Work[], limit: number) {
  const intervals = workIntervals(work, limit);
  return {
    slot: work.slot,
    category: work.kind,
    queueSlot: work.queue ?? null,
    queuedMs: work.queued ?? null,
    admittedMs: work.admitted ?? null,
    acquiredMs: work.start ?? null,
    finishedMs: work.end ?? null,
    waitMs: measuredSpan(work.queued, intervals.waitEnd, limit),
    schedulerWaitMs: measuredSpan(work.queued, work.admitted, limit),
    nativeAdmissionWaitMs: measuredSpan(work.admitted, work.start, limit),
    executionMs: measuredSpan(work.start, intervals.executionEnd, limit),
    missingBoundary: work.queued === undefined || work.start === undefined,
    blockers: intervals.wait.flatMap((wait) => blockers(wait, work, all)),
  };
}
function overlaps(stages: Record<string, Span[]>) {
  const entries = Object.entries(stages),
    result: { stages: string[]; elapsedMs: number }[] = [];
  for (let left = 0; left < entries.length; left++)
    for (let right = left + 1; right < entries.length; right++) {
      const a = entries[left]!,
        b = entries[right]!,
        elapsedMs = intersection(a[1], b[1]);
      if (elapsedMs) result.push({ stages: [a[0], b[0]], elapsedMs });
    }
  return result;
}
/** Fixed pre-dispatch milestones only, at most 32 retained points per existing
 * load slot. It shares the 64-operation budget and never retains request data. */
export class GroupDirectoryPrelude {
  private readonly points: { stage: GroupStartupStage; at: number }[] = [];
  private dropped = 0;
  private origin: number | undefined;
  private sent: number | undefined;
  observe(event: TraceEvent): void {
    if (this.origin === undefined) {
      const clock = number(event['loadClockMs']),
        elapsed = number(event['loadMs']);
      if (clock !== undefined && elapsed !== undefined)
        this.origin = clock - elapsed;
    }
    if (this.sent !== undefined) return;
    const stage = groupStartupStages.find(
      (stage) => stage === event['loadStage'],
    );
    const at = number(event['loadMs']);
    if (!stage || at === undefined) return;
    if (stage === 'group-list-send') this.sent = at;
    if (this.points.length < 32) this.points.push({ stage, at });
    else this.dropped++;
  }
  private intervals(start: GroupStartupStage, end: GroupStartupStage): Span[] {
    const result: Span[] = [];
    let pending: number | undefined;
    for (const point of this.points) {
      if (point.stage === start) pending = point.at;
      if (point.stage === end && pending !== undefined) {
        result.push(...clipped(pending, point.at, this.sent ?? point.at));
        pending = undefined;
      }
    }
    return result;
  }
  report(
    slot: number,
    flow: { authority: readonly AuthorityWorkSummary[]; overflow: boolean },
  ) {
    const milestones = Object.fromEntries(
      groupStartupStages.map((stage) => [
        stage,
        this.points
          .filter((point) => point.stage === stage)
          .map((point) => point.at),
      ]),
    );
    const coverage = {
      droppedMilestones: this.dropped,
      authorityOverflow: flow.overflow,
      missingMilestones: groupStartupStages.filter(
        (stage) => !milestones[stage]?.length,
      ),
    };
    if (this.origin === undefined || this.sent === undefined)
      return {
        available: false as const,
        reason:
          this.origin === undefined
            ? 'missing-shared-clock'
            : 'group-list-not-dispatched',
        milestones,
        coverage,
      };
    return this.complete({
      slot,
      origin: this.origin,
      limit: this.sent,
      flow,
      milestones,
      coverage,
    });
  }
  private complete(input: {
    slot: number;
    origin: number;
    limit: number;
    flow: { authority: readonly AuthorityWorkSummary[]; overflow: boolean };
    milestones: Record<string, number[]>;
    coverage: {
      droppedMilestones: number;
      authorityOverflow: boolean;
      missingMilestones: GroupStartupStage[];
    };
  }) {
    const all = input.flow.authority.map((work) =>
      readWork(work, input.origin),
    );
    const linked = all.filter(
      (work) =>
        work.load === input.slot && (work.queued ?? Infinity) <= input.limit,
    );
    const work = linked.map((work) => workReport(work, all, input.limit));
    const queue = linked.flatMap(
      (work) => workIntervals(work, input.limit).wait,
    );
    const execution = linked.flatMap(
      (work) => workIntervals(work, input.limit).execution,
    );
    const modeEnd = input.milestones['group-mode-end']?.at(-1);
    const stages = {
      identities: this.intervals('identities-start', 'identities-end'),
      vaultQueue: queue,
      vaultExecution: execution,
      vaultAuthorization: this.intervals('vault-acquired', 'vault-ready'),
      groupMode: this.intervals('group-mode-start', 'group-mode-end'),
      groupListPreparation: clipped(modeEnd, input.limit, input.limit),
    };
    const covered = merge(Object.values(stages).flat());
    const queueMs = duration(merge(queue)),
      unattributed = gaps(covered, input.limit);
    return {
      available: true as const,
      clock: 'group-directory-relative-performance.now',
      firstGroupListSentMs: input.limit,
      elapsedMs: input.limit,
      milestones: input.milestones,
      coverage: input.coverage,
      durationsMs: Object.fromEntries(
        Object.entries(stages).map(([stage, spans]) => [
          stage,
          duration(merge(spans)),
        ]),
      ),
      intervals: stages,
      overlaps: overlaps(stages),
      work,
      accounting: {
        queueMs,
        executionMs: duration(covered) - queueMs,
        unattributedMs: duration(unattributed),
        unattributedIntervals: unattributed,
        observedIntervalsOnly: true,
        executionMeaning:
          'observed-stage-wall-time-outside-linked-vault-queue; includes-I/O; not-CPU-time',
        blockerScope:
          'same-observed-authority-queue; other-documents-and-missing-boundaries-are-unobserved',
      },
    };
  }
}
