import { ReceiptTurns, receiptLinks } from './receipt-turns.ts';
import { sendStages } from '../../shared/chat-sync-diagnostics/send.ts';
import type { SendStage } from '../../shared/chat-sync-diagnostics/send.ts';
import {
  sendWaitReasons,
  privateSendRevision,
} from '../../shared/chat-sync-diagnostics/private-send.ts';
import { authorityKinds } from '../../shared/chat-sync-diagnostics/flow.ts';
import type { TraceEvent } from './events.ts';
import type { AuthorityWorkSummary } from './flow.ts';
import { union, clip, subtract, duration } from './send-intervals.ts';
import type { Interval } from './send-intervals.ts';

interface Point {
  receipt?: number;
  attempt?: number;
  batch?: number;
  stage: SendStage;
  ms: number;
  outcome?: string;
}
interface Send {
  slot: number;
  gestureMs: number | null;
  points: Point[];
}
interface Operation {
  slot: number;
  stage: SendStage;
  message: number | null;
  batch: number | null;
  attempt: number | null;
  startMs: number | null;
  endMs: number | null;
  success: boolean | null;
  wait: string | null;
  request: string | null;
}
interface Batch {
  slot: number;
  attempts: Map<number, Set<number>>;
  members: Set<number>;
}
interface Work {
  platform: { phase: string; ms: number; coverage: string }[];
  slot: number;
  queue: number | null;
  category: string;
  message: number | null;
  batch: number | null;
  attempt: number | null;
  queued: number | null;
  admitted: number | null;
  start: number | null;
  end: number | null;
}
type Flow = { authority: readonly AuthorityWorkSummary[]; overflow: boolean };
const number = (v: unknown): number | null =>
  typeof v === 'number' ? v : null;
const outcome = (v: unknown): string | undefined =>
  [
    'accepted',
    'not-accepted',
    'current',
    'changed',
    'skipped',
    'failed',
    'cancelled',
  ].includes(String(v))
    ? String(v)
    : undefined;
const interval = (start: number | null, end: number | null): Interval[] =>
  start === null || end === null ? [] : [{ startMs: start, endMs: end }];

/** Admission summaries and shared operations have budgets independent of the
 * global ring. Linkage is explicit; temporal proximity is never attribution. */
export class PrivateSendBreakdowns {
  private readonly receipts = new ReceiptTurns();
  private revision = 0;
  private offset: number | undefined;
  private overflow = 0;
  private readonly sends = new Map<number, Send>();
  private readonly batches = new Map<number, Batch>();
  private readonly batchPoints = new Map<number, Point[]>();
  private readonly operations: Operation[] = [];
  private readonly open = new Map<string, Operation[]>();
  observe(event: TraceEvent): void {
    if (event.kind === 'reuse-ready')
      this.revision = Number(event['privateRevision']) || 0;
    if (event['privateOverflow'] === true) this.overflow++;
    if (event.kind !== 'reuse-send') return;
    const clock = number(event['sendClockMs']);
    if (clock !== null) this.offset ??= event.ms - clock;
    this.receipts.observe(event, this.at(event));
    const stage = sendStages.find((s) => s === event['sendStage']);
    if (!stage) return;
    this.sendEvent(stage, event);
  }
  private sendEvent(stage: SendStage, event: TraceEvent): void {
    const message = number(event['privateSend']),
      batch = number(event['privateBatch']);
    if (stage === 'logical-submit' && message !== null)
      this.admit(message, event);
    if (stage === 'batch-member') {
      this.batchMember(event);
      return;
    }
    const send = message === null ? undefined : this.sends.get(message);
    if (event['sendPhase'] === 'point') {
      if (send) this.point(send, stage, event);
      else if (batch !== null) this.batchPoint(batch, stage, event);
      return;
    }
    if (send || batch !== null) this.operation(stage, event);
  }
  private batchMember(event: TraceEvent): void {
    const batch = number(event['privateBatch']),
      message = number(event['privateSend']);
    if (batch !== null && message !== null)
      this.member(batch, message, number(event['privateAttempt']));
  }
  private batchPoint(slot: number, stage: SendStage, event: TraceEvent): void {
    if (!this.batchPoints.has(slot) && this.batchPoints.size >= 128) {
      this.overflow++;
      return;
    }
    const points = this.batchPoints.get(slot) ?? [];
    if (points.length >= 64) {
      this.overflow++;
      return;
    }
    const receipt = number(event['receiptTurn']);
    const receiptField = receipt === null ? {} : { receipt };
    const result = outcome(event['sendOutcome']);
    const attempt = number(event['privateAttempt']);
    points.push({
      stage,
      ...receiptField,
      batch: slot,
      ...(attempt === null ? {} : { attempt }),
      ms: this.at(event),
      ...(result ? { outcome: result } : {}),
    });
    this.batchPoints.set(slot, points);
  }
  private at(event: TraceEvent): number {
    const clock = number(event['sendClockMs']);
    return clock === null ? event.ms : clock + (this.offset ?? 0);
  }
  private admit(slot: number, event: TraceEvent): void {
    if (this.sends.has(slot)) return;
    if (this.sends.size >= 5) {
      this.overflow++;
      return;
    }
    const gesture = number(event['sendGestureClockMs']);
    this.sends.set(slot, {
      slot,
      gestureMs: gesture === null ? null : gesture + (this.offset ?? 0),
      points: [],
    });
  }
  private point(send: Send, stage: SendStage, event: TraceEvent): void {
    if (send.points.length >= 128) {
      this.overflow++;
      return;
    }
    if (
      [
        'pending-render',
        'ui-available',
        'scheduler-eligible',
        'check-limit',
      ].includes(stage) &&
      send.points.some((p) => p.stage === stage)
    )
      return;
    const receipt = number(event['receiptTurn']);
    const receiptField = receipt === null ? {} : { receipt };
    const result = outcome(event['sendOutcome']);
    send.points.push({
      stage,
      ...receiptField,
      ms: this.at(event),
      ...(result ? { outcome: result } : {}),
    });
  }
  private member(slot: number, message: number, attempt: number | null): void {
    if (!this.batches.has(slot) && this.batches.size >= 128) {
      this.overflow++;
      return;
    }
    const batch = this.batches.get(slot) ?? {
      slot,
      members: new Set<number>(),
      attempts: new Map<number, Set<number>>(),
    };
    if (batch.members.size >= 32 && !batch.members.has(message)) {
      this.overflow++;
      return;
    }
    batch.members.add(message);
    if (attempt !== null) {
      if (!batch.attempts.has(attempt) && batch.attempts.size >= 2) {
        this.overflow++;
        return;
      }
      const members = batch.attempts.get(attempt) ?? new Set<number>();
      members.add(message);
      batch.attempts.set(attempt, members);
    }
    this.batches.set(slot, batch);
  }
  private operation(stage: SendStage, event: TraceEvent): void {
    const key = operationKey(stage, event);
    const pending = this.open.get(key) ?? [];
    if (event['sendPhase'] === 'end' && pending.length) {
      const op = pending.shift()!;
      op.endMs = this.at(event);
      op.success = event['sendSuccess'] === true;
      if (!pending.length) this.open.delete(key);
      return;
    }
    this.startOperation(stage, event, key);
  }
  private startOperation(
    stage: SendStage,
    event: TraceEvent,
    key: string,
  ): void {
    if (this.operations.length >= 1024) {
      this.overflow++;
      return;
    }
    const op: Operation = {
      slot: this.operations.length + 1,
      stage,
      message: number(event['privateSend']),
      batch: number(event['privateBatch']),
      attempt: number(event['privateAttempt']),
      startMs: event['sendPhase'] === 'start' ? this.at(event) : null,
      endMs: event['sendPhase'] === 'end' ? this.at(event) : null,
      success:
        event['sendPhase'] === 'end' ? event['sendSuccess'] === true : null,
      wait: sendWaitReasons.find((r) => r === event['sendWait']) ?? null,
      request:
        typeof event['sendRequest'] === 'string' ? event['sendRequest'] : null,
    };
    this.operations.push(op);
    if (op.startMs !== null) {
      const pending = this.open.get(key) ?? [];
      pending.push(op);
      this.open.set(key, pending);
    }
  }
  private linked(
    send: Send,
    item: {
      message: number | null;
      batch: number | null;
      attempt: number | null;
    },
  ): boolean {
    if (item.message !== null) return item.message === send.slot;
    const batch =
      item.batch === null ? undefined : this.batches.get(item.batch);
    const members =
      item.attempt === null
        ? batch?.members
        : batch?.attempts.get(item.attempt);
    return members?.has(send.slot) ?? false;
  }
  report(flow: Flow) {
    const works = flow.authority.map((w) => readWork(w, this.offset ?? 0));
    const receiptReport = this.receipts.report(
      flow.authority,
      this.offset ?? 0,
    );
    const sends = [...this.sends.values()].map((send) =>
      this.sendReport(send, {
        works,
        authorityOverflow: flow.overflow,
        receipts: receiptReport,
      }),
    );
    const execution = this.operations
      .filter((op) => !op.wait)
      .flatMap((op) => interval(op.startMs, op.endMs));
    const completedExecution = sends.flatMap((send) => {
      const window = send.windows.toCheck.available
        ? send.windows.toCheck
        : send.windows.toAcceptance;
      return window.available ? window.executionIntervals : [];
    });
    return {
      available: this.revision === privateSendRevision,
      revision: this.revision,
      expectedRevision: privateSendRevision,
      receipts: receiptReport,
      limits: { sends: 5, batches: 128, operations: 1024, pointsPerSend: 128 },
      overflow: this.overflow,
      authorityOverflow: flow.overflow,
      automaticTimingCoverage: this.revision === privateSendRevision,
      manualMarkerRequired: false,
      clock: 'capture-relative-performance.now',
      executionMeaning:
        'observed-wall-time-including-I/O; nested-and-concurrent-intervals-are-unioned',
      checkMeaning:
        'first-accepted-own-check-in-visible-DOM; not-physical-paint-or-recipient-display',
      operations: this.operations.map((op) => ({
        ...op,
        missingBoundary: op.startMs === null || op.endMs === null,
      })),
      batches: [...this.batches.values()].map((b) => ({
        slot: b.slot,
        members: [...b.members],
        attempts: [...b.attempts].map(([slot, members]) => ({
          slot,
          members: [...members],
        })),
      })),
      captureWork: {
        operationWallUnionMs: duration(execution),
        executionWallUnionMs: duration(completedExecution),
        executionScope:
          'completed-gesture-to-check-or-acceptance-windows-only; incomplete-windows-excluded',
        sharedOperationsCountedOnce: true,
      },
      sends,
    };
  }
  private sendReport(
    original: Send,
    context: {
      works: Work[];
      authorityOverflow: boolean;
      receipts: ReturnType<ReceiptTurns['report']>;
    },
  ) {
    const { works, authorityOverflow } = context;
    const shared = [...this.batches.values()]
      .filter((b) => b.members.has(original.slot))
      .flatMap((b) =>
        (this.batchPoints.get(b.slot) ?? []).filter(
          (p) =>
            p.attempt === undefined ||
            b.attempts.get(p.attempt)?.has(original.slot),
        ),
      );
    const send = {
      ...original,
      points: [...original.points, ...shared].sort((a, b) => a.ms - b.ms),
    };
    const operations = this.operations.filter((op) => this.linked(send, op));
    const work = {
      linked: works.filter((w) => this.linked(send, w)),
      all: works,
    };
    const keys = deviceKeys(send, operations);
    const coverage = this.coverage(send, operations, authorityOverflow);
    return {
      slot: send.slot,
      gestureMs: send.gestureMs,
      milestones: send.points.map((p) => ({ ...p })),
      operations: operations.map((op) => op.slot),
      coverage,
      deviceKeys: keys.state,
      outcome: sendOutcome(send, operations),
      windows: {
        beforeDeviceKeys: this.window(send, keys.ms, operations, work),
        toAcceptance: this.window(
          send,
          firstPoint(send, 'accepted'),
          operations,
          work,
        ),
        toCheck: this.window(
          send,
          firstPoint(send, 'check-render'),
          operations,
          work,
        ),
      },
      receipts: receiptLinks({
        points: send.points,
        gestureMs: send.gestureMs,
        turns: context.receipts.turns,
        endMs: firstPoint(send, 'accepted'),
      }),
      residualCoverage: {
        meaning:
          'separate-from-milestone-coverage; measured-unattributed-time-remains-visible',
      },
      checkObservation: checkObservation(send),
    };
  }
  private coverage(
    send: Send,
    operations: Operation[],
    authorityOverflow: boolean,
  ) {
    const keys = deviceKeys(send, operations);
    const missing = [
      'logical-submit',
      'draft-admitted',
      'ui-available',
      'pending-render',
      'staging-complete',
      'outbox-dispatch',
      'accepted',
      'check-render',
    ].filter((stage) => !send.points.some((p) => p.stage === stage));
    if (send.gestureMs === null) missing.push('gesture');
    if (keys.state === 'not-observed') missing.push('device-keys');
    return {
      missing,
      ambiguousGesture: send.gestureMs === null,
      overflow: this.overflow,
      authorityOverflow,
      truncatedSpans: operations
        .filter((op) => op.startMs === null || op.endMs === null)
        .map((op) => op.slot),
      automatic: this.revision === privateSendRevision,
    };
  }
  private window(
    send: Send,
    end: number | null,
    operations: Operation[],
    work: { linked: Work[]; all: Work[] },
  ) {
    if (send.gestureMs === null || end === null)
      return {
        available: false as const,
        missing: send.gestureMs === null ? 'gesture' : 'end-boundary',
      };
    const window = { startMs: send.gestureMs, endMs: end };
    const queue = clip(
      [
        ...operations
          .filter((op) => op.wait)
          .flatMap((op) => queueInterval(op, send, end)),
        ...work.linked.flatMap((w) => interval(w.queued, w.start ?? w.end)),
      ],
      window,
    );
    const execution = subtract(
      clip(
        [
          ...operations
            .filter((op) => !op.wait)
            .flatMap((op) => interval(op.startMs, op.endMs ?? end)),
          ...work.linked.flatMap((w) => interval(w.start, w.end ?? end)),
        ],
        window,
      ),
      queue,
    );
    const residual = subtract([window], union([...queue, ...execution]));
    return {
      available: true as const,
      ...window,
      elapsedMs: end - send.gestureMs,
      queueWaitMs: duration(queue),
      executionMs: duration(execution),
      unattributedMs: duration(residual),
      accountingCoverage: {
        observedMs: duration(queue) + duration(execution),
        residualMs: duration(residual),
        fullyAttributed: residual.length === 0,
      },
      queueIntervals: queue,
      executionIntervals: execution,
      unattributedIntervals: residual.map((span) => ({
        ...span,
        bounds: bounds(span, send, operations),
      })),
      queueBlockers: operations
        .filter((op) => op.wait)
        .map((op) => ({
          operation: op.slot,
          category: op.wait,
          elapsedMs: duration(
            clip(interval(op.startMs, op.endMs ?? end), window),
          ),
        })),
      authority: work.linked.map((w) => workReport(w, work.all, window)),
    };
  }
}
function bounds(span: Interval, send: Send, operations: Operation[]) {
  const points = [
    ...send.points,
    ...operations.flatMap((op) => [
      { stage: `${op.stage}:start`, ms: op.startMs },
      { stage: `${op.stage}:end`, ms: op.endMs },
    ]),
  ]
    .filter((p): p is { stage: string; ms: number } => p.ms !== null)
    .sort((a, b) => a.ms - b.ms);
  return {
    after:
      points.filter((p) => p.ms <= span.startMs).at(-1)?.stage ?? 'gesture',
    before: points.find((p) => p.ms >= span.endMs)?.stage ?? 'window-end',
  };
}
function readWork(work: AuthorityWorkSummary, offset: number): Work {
  const first = work.events[0];
  const at = (phase: string) => {
    const e = work.events.find((e) => e['workPhase'] === phase);
    const clock = number(e?.['workClockMs']);
    return e ? (clock === null ? e.ms : clock + offset) : null;
  };
  return {
    slot: work.slot,
    platform: work.events
      .filter((e) => e['workPhase'] === 'platform')
      .map((e) => ({
        phase: String(e['lockPhase']),
        ms: (number(e['workClockMs']) ?? e.ms) + offset,
        coverage: String(e['lockCoverage']),
      })),
    queue: number(first?.['authorityQueue']),
    category:
      authorityKinds.find((k) => k === first?.['authorityKind']) ?? 'vault',
    message: number(first?.['privateSend']),
    batch: number(first?.['privateBatch']),
    attempt: number(first?.['privateAttempt']),
    queued: at('queued'),
    admitted: at('admitted'),
    start: at('start'),
    end: at('complete') ?? at('failed'),
  };
}
function workReport(work: Work, all: Work[], window: Interval) {
  const waits = clip(interval(work.queued, work.start ?? work.end), window);
  const holders = all
    .filter(
      (w) =>
        work.queue !== null && w.queue === work.queue && w.slot !== work.slot,
    )
    .map((w) => ({
      category: w.category,
      intervals: waits.flatMap((wait) => clip(interval(w.start, w.end), wait)),
    }));
  const covered = union(holders.flatMap((h) => h.intervals));
  return {
    slot: work.slot,
    category: work.category,
    queue: work.queue,
    queuedMs: work.queued,
    admittedMs: work.admitted,
    acquiredMs: work.start,
    operationCompleteMs: work.end,
    releasedMs: work.platform.find((p) => p.phase === 'released')?.ms ?? null,
    schedulerWaitMs:
      work.queued === null || work.admitted === null
        ? null
        : duration(clip(interval(work.queued, work.admitted), window)),
    acquisitionWaitMs:
      work.admitted === null || work.start === null
        ? null
        : duration(clip(interval(work.admitted, work.start), window)),
    platform: work.platform,
    platformWait: platformWait(work, window),
    missingBoundary:
      work.queued === null || work.start === null || work.end === null,
    blockers: [
      ...holders
        .filter((h) => h.intervals.length)
        .map((h) => ({
          category: h.category,
          elapsedMs: duration(h.intervals),
        })),
      { category: 'unobserved', elapsedMs: duration(subtract(waits, covered)) },
    ],
    blockerScope:
      'observed-holders-in-the-same-local-queue; concurrent-holder-detail-is-not-additive',
  };
}

function operationKey(stage: SendStage, event: TraceEvent): string {
  return typeof event['sendSpan'] === 'number'
    ? `span-${event['sendSpan']}`
    : [
        event['privateSend'],
        event['privateBatch'],
        event['privateAttempt'],
        stage,
      ]
        .map(String)
        .join('/');
}
function firstPoint(send: Send, stage: SendStage): number | null {
  return send.points.find((p) => p.stage === stage)?.ms ?? null;
}
function deviceKeys(send: Send, operations: Operation[]) {
  const ms =
    operations.find((op) => op.stage === 'device-keys' && op.startMs !== null)
      ?.startMs ?? null;
  const skipped = send.points.some(
    (p) => p.stage === 'device-keys' && p.outcome === 'skipped',
  );
  return {
    ms,
    state: ms !== null ? 'observed' : skipped ? 'skipped' : 'not-observed',
  };
}
function sendOutcome(send: Send, operations: Operation[]): string {
  if (firstPoint(send, 'accepted') !== null) return 'accepted';
  if (firstPoint(send, 'send-cancelled') !== null) return 'cancelled';
  if (
    firstPoint(send, 'send-failed') !== null ||
    operations.some((op) => op.success === false)
  )
    return 'failed-attempt';
  return 'unfinished';
}
function checkObservation(send: Send): string {
  if (firstPoint(send, 'check-render') !== null) return 'visible-DOM-observed';
  return firstPoint(send, 'check-limit') !== null
    ? 'chat-not-visible'
    : 'not-observed-before-capture-end';
}
function queueInterval(op: Operation, send: Send, end: number): Interval[] {
  const acquired =
    firstPoint(send, 'foreground-acquired') ??
    firstPoint(send, 'outbox-dispatch');
  const stop =
    op.wait === 'foreground-operation' && acquired !== null
      ? Math.min(op.endMs ?? end, acquired)
      : (op.endMs ?? end);
  return interval(op.startMs, stop);
}

function platformWait(work: Work, window: Interval) {
  const spans = ['maintenance', 'turn', 'storage'].flatMap((category) => {
    const start = work.platform.find(
      (p) => p.phase === `${category}-queued`,
    )?.ms;
    const end = work.platform.find(
      (p) => p.phase === `${category}-acquired`,
    )?.ms;
    return start === undefined || end === undefined
      ? []
      : [
          {
            category,
            intervals: clip([{ startMs: start, endMs: end }], window),
          },
        ];
  });
  const acquisition = clip(interval(work.admitted, work.start), window);
  return {
    observed: spans.map((s) => ({
      category: s.category,
      elapsedMs: duration(s.intervals),
      intervals: s.intervals,
    })),
    unattributedMs: duration(
      subtract(
        acquisition,
        spans.flatMap((s) => s.intervals),
      ),
    ),
    holderCoverage:
      'same-document-authority-slots-only; other-documents-have-no-holder-identity',
    follower: work.platform.some((p) => p.coverage === 'held-turn-follower'),
  };
}
