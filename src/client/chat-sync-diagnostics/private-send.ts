import type {
  PrivateSendContext,
  PrivateSendFields,
  SendWaitReason,
  SendMaintenanceKind,
} from '../../shared/chat-sync-diagnostics/private-send.ts';
import type { SendStage } from '../../shared/chat-sync-diagnostics/send.ts';

type Emit = (
  stage: SendStage,
  fields: PrivateSendFields & {
    sendPhase?: 'point' | 'start' | 'end';
    sendSuccess?: boolean;
    sendMs?: number;
  },
) => void;
interface Gesture {
  mediaMode: NonNullable<PrivateSendFields['sendMediaMode']>;
  composer: number;
  gesture: number;
  clock: number;
}
/** Only this capture owns draft/capability correlation. It never schedules work. */
export class PrivateSendCapture {
  private ended = false;
  private readonly drafts = new Map<string, PrivateSendContext>();
  private gestures = new WeakMap<Event, Gesture>();
  private tokenOwner: object = {};
  private readonly saves = new Map<string, (ok?: boolean) => void>();
  private readonly eligible = new Set<string>();
  private readonly accepted = new Set<string>();
  private readonly waiting = new Map<string, Map<SendWaitReason, () => void>>();
  private maintenance: SendMaintenanceKind | undefined;
  private reasons: readonly SendWaitReason[] = [];
  private batches = 0;
  private spans = 0;
  private receipts = 0;
  private activeReceipt: PrivateSendContext | undefined;
  private readonly emit: Emit;
  constructor(emit: Emit) {
    this.emit = emit;
  }
  stop(): void {
    this.ended = true;
    this.drafts.clear();
    this.waiting.clear();
    this.saves.clear();
    this.accepted.clear();
    this.eligible.clear();
    this.reasons = [];
    this.gestures = new WeakMap();
  }
  gesture(value: unknown): void {
    if (this.ended || typeof value !== 'object' || value === null) return;
    const v = value as Record<string, unknown>;
    if (!(v['event'] instanceof Event)) return;
    if (
      !['composer', 'gesture', 'clock'].every(
        (key) => Number.isSafeInteger(v[key]) && Number(v[key]) >= 0,
      )
    )
      return;
    this.gestures.set(v['event'], {
      mediaMode: ['text', 'ordinary', 'view-once'].includes(
        String(v['mediaMode']),
      )
        ? (v['mediaMode'] as Gesture['mediaMode'])
        : 'unknown',
      composer: Number(v['composer']),
      gesture: Number(v['gesture']),
      clock: Number(v['clock']),
    });
  }
  begin(
    id: string,
    slot: number,
    event?: Event,
    scope: 'private' | 'group' = 'private',
  ): void {
    if (this.ended || this.drafts.has(id)) return;
    if (this.drafts.size >= 256) {
      this.point(undefined, 'logical-submit', {
        privateOverflow: true,
        sendScope: scope,
      });
      return;
    }
    const context = { owner: this.tokenOwner, message: slot, scope };
    this.drafts.set(id, context);
    const gesture = event && this.gestures.get(event);
    this.point(
      context,
      'logical-submit',
      gesture
        ? {
            sendMediaMode: gesture.mediaMode,
            sendComposer: gesture.composer,
            sendGesture: gesture.gesture,
            sendGestureClockMs: gesture.clock,
          }
        : {},
    );
    if (this.activeReceipt)
      this.point({ ...this.activeReceipt, ...context }, 'receipt-at-submit');
  }
  reset(): void {
    for (const [id, context] of this.drafts)
      if (!this.accepted.has(id))
        this.point(context, 'send-cancelled', { sendOutcome: 'cancelled' });
    this.drafts.clear();
    this.waiting.clear();
    this.saves.clear();
    this.accepted.clear();
    this.eligible.clear();
    this.gestures = new WeakMap();
    this.activeReceipt = undefined;
    this.tokenOwner = {};
  }
  queue(
    id: string,
    stage: 'enqueued' | 'save-start' | 'ready' | 'save-failed' | 'cancelled',
  ): void {
    const context = this.context(id);
    if (!context) return;
    this.saves.get(id)?.(stage !== 'save-failed');
    this.saves.delete(id);
    if (stage === 'enqueued' || stage === 'save-start') {
      this.point(context, stage === 'enqueued' ? 'enqueued' : 'draft-save');
      const finish = this.span(
        context,
        stage === 'enqueued' ? 'scheduler-wait' : 'local-save',
        stage === 'enqueued' ? { sendWait: 'earlier-draft' } : {},
      );
      if (finish) this.saves.set(id, finish);
      return;
    }
    this.finishQueue(context, id, stage);
  }
  private finishQueue(
    context: PrivateSendContext,
    id: string,
    stage: string,
  ): void {
    if (stage === 'ready') {
      this.point(context, 'staging-complete');
      this.point(context, 'flush-ready');
      this.ready(id);
    } else
      this.point(
        context,
        stage === 'cancelled' ? 'send-cancelled' : 'send-failed',
        { sendOutcome: stage === 'cancelled' ? 'cancelled' : 'failed' },
      );
  }
  ready(id: string): void {
    if (!this.context(id) || this.accepted.has(id)) return;
    this.waiting.set(id, new Map());
    this.scheduler(this.reasons);
  }
  scheduler(
    reasons: readonly SendWaitReason[],
    maintenance = this.maintenance,
  ): void {
    this.reasons = reasons;
    this.maintenance = reasons.includes('maintenance')
      ? maintenance
      : undefined;
    for (const [id, waits] of this.waiting) this.updateWait(id, waits, reasons);
  }
  private updateWait(
    id: string,
    waits: Map<SendWaitReason, () => void>,
    reasons: readonly SendWaitReason[],
  ): void {
    for (const [reason, finish] of waits)
      if (!reasons.includes(reason)) {
        finish();
        waits.delete(reason);
      }
    for (const reason of reasons)
      if (!waits.has(reason)) {
        const finish = this.span(this.context(id), 'scheduler-wait', {
          sendWait: reason,
          ...(reason === 'maintenance' && this.maintenance
            ? { sendMaintenance: this.maintenance }
            : {}),
        });
        if (finish) waits.set(reason, finish);
      }
    if (!reasons.length && !this.eligible.has(id)) {
      this.eligible.add(id);
      this.point(this.context(id), 'scheduler-eligible');
    }
  }
  dispatch(id: string): void {
    for (const finish of this.waiting.get(id)?.values() ?? []) finish();
    this.waiting.delete(id);
    this.point(this.context(id), 'outbox-dispatch');
  }
  accept(id: string): void {
    if (!this.context(id)) return;
    this.accepted.add(id);
    this.waiting.delete(id);
  }
  context(id: string): PrivateSendContext | undefined {
    return this.drafts.get(id);
  }
  batch(): PrivateSendContext | undefined {
    if (this.ended) return;
    if (this.batches >= 128) {
      this.point(undefined, 'batch-member', { privateOverflow: true });
      return;
    }
    return { owner: this.tokenOwner, batch: ++this.batches };
  }
  receipt(
    scope: 'direct' | 'groups',
    live: boolean,
  ): PrivateSendContext | undefined {
    if (this.ended) return;
    if (this.receipts >= 128) {
      this.point(undefined, 'receipt-start', { privateOverflow: true });
      return;
    }
    const token = { owner: this.tokenOwner, receipt: ++this.receipts };
    this.activeReceipt = token;
    this.point(token, 'receipt-start', {
      receiptScope: scope,
      receiptLive: live,
    });
    return token;
  }
  releaseReceipt(context: PrivateSendContext | undefined): void {
    this.point(context, 'receipt-release');
    if (this.activeReceipt === context) this.activeReceipt = undefined;
  }
  fields(context: PrivateSendContext | undefined): PrivateSendFields {
    if (this.ended || context?.owner !== this.tokenOwner) return {};
    return {
      ...(context.scope ? { sendScope: context.scope } : {}),
      ...(context.receipt ? { receiptTurn: context.receipt } : {}),
      ...(context.receiptAttempt
        ? { receiptAttempt: context.receiptAttempt }
        : {}),
      ...(context.message ? { privateSend: context.message } : {}),
      ...(context.batch ? { privateBatch: context.batch } : {}),
      ...(context.attempt ? { privateAttempt: context.attempt } : {}),
    };
  }
  member(context: PrivateSendContext | undefined, id: string): void {
    const draft = this.context(id);
    if (draft) this.point(context, 'batch-member', this.fields(draft));
  }
  point(
    context: PrivateSendContext | undefined,
    stage: SendStage,
    fields: PrivateSendFields = {},
  ): void {
    if (
      !this.ended &&
      (context?.owner === this.tokenOwner || fields.privateOverflow === true)
    )
      this.emit(stage, {
        ...this.fields(context),
        ...fields,
        sendClockMs: Math.round(performance.now()),
        sendPhase: 'point',
      });
  }
  span(
    context: PrivateSendContext | undefined,
    stage: SendStage,
    fields: PrivateSendFields = {},
  ): ((ok?: boolean) => void) | undefined {
    if (this.ended || context?.owner !== this.tokenOwner) return;
    if (this.spans >= 4096) {
      this.point(context, stage, {
        privateOverflow: true,
        privateOverflowKind: 'operation',
      });
      return;
    }
    const sendSpan = ++this.spans,
      start = performance.now();
    const linkage = { ...this.fields(context), ...fields, sendSpan };
    this.emit(stage, {
      ...linkage,
      sendClockMs: Math.round(start),
      sendPhase: 'start',
    });
    let finished = false;
    const owner = this.tokenOwner;
    return (ok = true) => {
      if (this.ended || finished || owner !== this.tokenOwner) return;
      finished = true;
      this.emit(stage, {
        ...linkage,
        sendClockMs: Math.round(performance.now()),
        sendPhase: 'end',
        sendMs: Math.max(0, Math.round(performance.now() - start)),
        sendSuccess: ok,
      });
    };
  }
}
