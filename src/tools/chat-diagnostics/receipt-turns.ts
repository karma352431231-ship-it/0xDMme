import { sendStages } from '../../shared/chat-sync-diagnostics/send.ts';
import { diagnosticRequestCategory } from '../../shared/chat-sync-diagnostics/network.ts';
import type { TraceEvent } from './events.ts';
import type { AuthorityWorkSummary } from './flow.ts';
interface ReceiptPoint {
  stage: string;
  ms: number;
  phase: string;
  span: number | null;
  attempt: number | null;
  request: string | null;
  items: number | null;
  pages: number | null;
  reason: string | null;
  success: boolean | null;
  more: boolean | null;
}
interface Turn {
  slot: number;
  scope: string;
  live: boolean | null;
  points: ReceiptPoint[];
  terminal: ReceiptPoint[];
  dropped: number;
}
const number = (v: unknown): number | null =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
const terminal = new Set([
  'receipt-yield',
  'receipt-start',
  'receipt-commit',
  'receipt-release',
  'receipt-complete',
  'receipt-failed',
  'receipt-retry',
]);
/** Independent receipt records survive global ring eviction. Terminal marks have
 * a separate budget so noisy SDK/request detail cannot hide commit or failure. */
export class ReceiptTurns {
  private readonly turns = new Map<number, Turn>();
  private overflow = 0;
  observe(event: TraceEvent, ms: number): void {
    if (event.kind !== 'reuse-send') return;
    const slot = number(event['receiptTurn']);
    const stage = sendStages.find((s) => s === event['sendStage']);
    if (
      slot === null ||
      !stage ||
      ['receipt-at-submit', 'receipt-awaited'].includes(stage)
    )
      return;
    const turn = this.turn(slot);
    if (!turn) return;
    receiptMetadata(turn, event);
    const lane = terminal.has(stage) ? turn.terminal : turn.points;
    if (lane.length >= (terminal.has(stage) ? 16 : 128)) {
      turn.dropped++;
      return;
    }
    lane.push(readReceiptPoint(stage, event, ms));
  }
  private turn(slot: number): Turn | undefined {
    if (this.turns.has(slot)) return this.turns.get(slot);
    if (this.turns.size >= 128) {
      this.overflow++;
      return;
    }
    const turn = {
      slot,
      scope: 'unobserved',
      live: null,
      points: [],
      terminal: [],
      dropped: 0,
    };
    this.turns.set(slot, turn);
    return turn;
  }
  report(authority: readonly AuthorityWorkSummary[], offset = 0) {
    return {
      limits: {
        turns: 128,
        detailPointsPerTurn: 128,
        terminalPointsPerTurn: 16,
      },
      overflow: this.overflow,
      turns: [...this.turns.values()].map((turn) => {
        const points = [...turn.points, ...turn.terminal].sort(
          (a, b) => a.ms - b.ms,
        );
        const first = (stage: string) =>
          points.find((p) => p.stage === stage)?.ms ?? null;
        return {
          slot: turn.slot,
          scope: turn.scope,
          live: turn.live,
          startMs: first('receipt-start'),
          commitMs: first('receipt-commit'),
          releaseMs: first('receipt-release'),
          releaseMeaning:
            'inbox-owner-settled; actual-platform-release-is-in-linked-authority-events',
          completeMs: first('receipt-complete'),
          outcome:
            first('receipt-failed') !== null
              ? 'failed-or-cancelled'
              : first('receipt-complete') === null
                ? 'unfinished'
                : first('receipt-commit') === null
                  ? 'completed-without-page-commit'
                  : 'committed',
          droppedPoints: turn.dropped,
          points,
          spans: receiptSpans(points),
          authority: authority
            .filter((w) => w.events.some((e) => e['receiptTurn'] === turn.slot))
            .map((w) => receiptAuthority(w, offset)),
          authoritySlots: authority
            .filter((w) => w.events.some((e) => e['receiptTurn'] === turn.slot))
            .map((w) => w.slot),
          missing: [
            'receipt-start',
            'receipt-release',
            'receipt-complete',
          ].filter((stage) => first(stage) === null),
        };
      }),
    };
  }
}
function receiptSpans(points: ReceiptPoint[]) {
  const starts = new Map<number, ReceiptPoint>();
  const spans: {
    slot: number;
    stage: string;
    attempt: number | null;
    request: string | null;
    startMs: number | null;
    endMs: number | null;
    missingBoundary: boolean;
  }[] = [];
  for (const point of points) {
    if (point.span === null) continue;
    if (point.phase === 'start') starts.set(point.span, point);
    if (point.phase === 'end') {
      const start = starts.get(point.span);
      spans.push({
        slot: point.span,
        stage: point.stage,
        attempt: point.attempt,
        request: point.request,
        startMs: start?.ms ?? null,
        endMs: point.ms,
        missingBoundary: !start,
      });
      starts.delete(point.span);
    }
  }
  for (const [slot, start] of starts)
    spans.push({
      slot,
      stage: start.stage,
      attempt: start.attempt,
      request: start.request,
      startMs: start.ms,
      endMs: null,
      missingBoundary: true,
    });
  return spans;
}
export function receiptLinks(input: {
  points: readonly { stage: string; ms: number; receipt?: number }[];
  gestureMs: number | null;
  turns: ReturnType<ReceiptTurns['report']>['turns'];
  endMs: number | null;
}) {
  const related = input.points.filter(
    (p) =>
      p.receipt !== undefined &&
      ['receipt-at-submit', 'receipt-awaited'].includes(p.stage),
  );
  return related.map((p) => receiptLink(p, input));
}
type ReceiptLinkInput = Parameters<typeof receiptLinks>[0];
function receiptLink(
  p: ReceiptLinkInput['points'][number],
  input: ReceiptLinkInput,
) {
  const turn = input.turns.find((t) => t.slot === p.receipt);
  return {
    turn: p.receipt!,
    relation: p.stage,
    scope: turn ? turn.scope : 'unobserved',
    live: turn ? turn.live : null,
    awaitedAtMs: p.stage === 'receipt-awaited' ? p.ms : null,
    ageAtGestureMs: ageAtGesture(turn?.startMs, input.gestureMs),
    remainingWaitMs: remainingWait(p, turn?.completeMs, input),
    available: !!turn,
  };
}
function ageAtGesture(
  start: number | null | undefined,
  gesture: number | null,
): number | null {
  return start === null || start === undefined || gesture === null
    ? null
    : Math.max(0, gesture - start);
}
function remainingWait(
  p: ReceiptLinkInput['points'][number],
  complete: number | null | undefined,
  input: ReceiptLinkInput,
): number | null {
  if (
    p.stage !== 'receipt-awaited' ||
    complete === null ||
    complete === undefined ||
    input.endMs === null
  )
    return null;
  return Math.max(
    0,
    Math.min(complete, input.endMs) - Math.max(p.ms, input.gestureMs ?? p.ms),
  );
}
function readReceiptPoint(
  stage: string,
  event: TraceEvent,
  ms: number,
): ReceiptPoint {
  const request = event['sendRequest'];
  return {
    stage,
    ms,
    more:
      typeof event['receiptMore'] === 'boolean' ? event['receiptMore'] : null,
    phase: ['point', 'start', 'end'].includes(String(event['sendPhase']))
      ? String(event['sendPhase'])
      : 'point',
    span: number(event['sendSpan']),
    attempt: number(event['receiptAttempt']),
    request:
      typeof request === 'string' &&
      diagnosticRequestCategory('/api/account/' + request) === request
        ? request
        : null,
    items: number(event['receiptItems']),
    pages: number(event['receiptPages']),
    reason: [
      'draft-admission',
      'snapshot-changed',
      'failed',
      'cancelled',
      'generation-changed',
    ].includes(String(event['receiptReason']))
      ? String(event['receiptReason'])
      : null,
    success:
      typeof event['sendSuccess'] === 'boolean' ? event['sendSuccess'] : null,
  };
}

function receiptAuthority(work: AuthorityWorkSummary, offset: number) {
  return {
    slot: work.slot,
    events: work.events.map((e) => ({
      phase: String(e['workPhase']),
      ms: (number(e['workClockMs']) ?? e.ms) + offset,
      queue: number(e['authorityQueue']),
      kind: String(e['authorityKind'] ?? 'vault'),
      lockPhase: typeof e['lockPhase'] === 'string' ? e['lockPhase'] : null,
    })),
  };
}

function receiptMetadata(turn: Turn, event: TraceEvent): void {
  if (event['receiptScope'] === 'direct' || event['receiptScope'] === 'groups')
    turn.scope = event['receiptScope'];
  if (typeof event['receiptLive'] === 'boolean')
    turn.live = event['receiptLive'];
}
