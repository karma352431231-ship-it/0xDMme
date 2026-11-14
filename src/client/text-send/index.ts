import type {
  QueueGate,
  QueueWakeup,
  TextQueueObservation,
} from '../../shared/chat-sync-diagnostics/text-queue.ts';
import { TextQueueTrace } from './observation.ts';
import type { ObserveTextQueue } from './observation.ts';
export type {
  QueueGate,
  QueueWakeup,
} from '../../shared/chat-sync-diagnostics/text-queue.ts';
export type TextTransmitResult = {
  ok: boolean;
  more: boolean;
  deferred?: true;
};
import type { TextDraft } from './draft.ts';
export type { TextDraft } from './draft.ts';
export { OutgoingTexts, outgoingTextRows } from './outgoing.ts';
export type { OutgoingText } from './outgoing.ts';

/** Local input admission is independent of the SDK owner. Only a confirmed
 * encrypted save requests transmission; failed saves retain their original ID. */
export class TextSendQueue {
  private drafts: TextDraft[] = [];
  private queuedBytes = 0;
  private generation = 0;
  private saving = false;
  private sending = false;
  private saveFailed = false;
  private sendFailed = false;
  private dirty = false;
  private version = 0;
  private batch = 0;
  private wakeVersion = 0;
  private notifying = false;
  private activeTrace: readonly string[] = [];
  private readonly trace: TextQueueTrace | undefined;
  private quiet: ReturnType<typeof setTimeout> | null = null;
  private readonly options: {
    timing?: (
      draft: TextDraft,
      stage: 'enqueued' | 'save-start' | 'ready' | 'save-failed' | 'cancelled',
    ) => void;
    observe?: ObserveTextQueue;
    blockedBy?: () => QueueGate;
    reset?: () => void;
    maximumTextBytes?: number;
    maximumQueuedBytes?: number;
    save: (draft: TextDraft) => Promise<void>;
    transmit: (admitted: () => void) => Promise<TextTransmitResult>;
    available: () => boolean;
    changed: () => void;
    failed: (error: unknown) => void;
    draftChanged?: (
      draft: TextDraft,
      phase: 'admitted' | 'saved' | 'save-failed',
    ) => void;
  };
  constructor(options: TextSendQueue['options']) {
    this.options = options;
    this.trace = options.observe
      ? new TextQueueTrace(options.observe)
      : undefined;
  }
  get unsaved(): boolean {
    return this.drafts.length > 0;
  }
  get awaitingSave(): boolean {
    return this.unsaved && !this.saveFailed;
  }
  get pending(): boolean {
    return this.working || this.quiet !== null;
  }
  get working(): boolean {
    return (
      (this.unsaved && !this.saveFailed) ||
      (this.dirty && !this.sendFailed) ||
      this.sending
    );
  }
  get full(): boolean {
    return this.drafts.length >= 32;
  }
  enqueue(draft: TextDraft): void {
    const bytes = new TextEncoder().encode(draft.text).length;
    if (
      this.full ||
      bytes > (this.options.maximumTextBytes ?? 131072) ||
      this.queuedBytes + bytes >
        (this.options.maximumQueuedBytes ?? 32 * 131072)
    )
      throw new Error('Wait for conversations to update, then try again.');
    const captured = { ...draft, createdAt: draft.createdAt ?? Date.now() };
    this.drafts.push(captured);
    this.options.timing?.(captured, 'enqueued');
    this.queuedBytes += bytes;
    this.options.draftChanged?.(captured, 'admitted');
    this.deferBackground();
    this.sendFailed = false;
    this.changed('input');
  }
  retry(): void {
    this.saveFailed = false;
    this.sendFailed = false;
    this.dirty = true;
    this.changed('retry');
  }
  deferBackground(): void {
    if (this.quiet !== null) clearTimeout(this.quiet);
    this.quiet = setTimeout(() => {
      this.quiet = null;
      this.changed('quiet-timer');
    }, 1000);
  }
  reset(): void {
    this.trace?.reset(this.generation, 'session-view');
    this.trace?.mark(this.activeTrace, {
      phase: 'cancelled',
      trigger: 'session-view',
      generation: this.generation,
      batch: this.batch,
    });
    this.activeTrace = [];
    this.generation++;
    this.options.reset?.();
    if (this.quiet !== null) clearTimeout(this.quiet);
    this.quiet = null;
    for (const draft of this.drafts) this.options.timing?.(draft, 'cancelled');
    this.drafts = [];
    this.queuedBytes = 0;
    this.dirty = false;
    this.saveFailed = false;
    this.sendFailed = false;
  }
  resume(trigger: QueueWakeup = 'status'): void {
    if (this.notifying) return;
    this.wakeVersion++;
    if (!this.saving && !this.saveFailed && this.unsaved) void this.saveNext();
    if (this.observeGate(trigger) === 'available') void this.flush(trigger);
  }
  private observeGate(trigger: QueueWakeup): QueueGate {
    const gate = this.gate();
    this.trace?.decision({
      phase: 'decision',
      trigger,
      generation: this.generation,
      gate,
      ...(this.sending ? { batch: this.batch } : {}),
    });
    return gate;
  }
  private gate(): QueueGate {
    if (this.sending) return 'active-transmission';
    if (this.sendFailed) return 'send-failed';
    if (!this.dirty) return 'no-dirty-work';
    return this.options.available()
      ? 'available'
      : (this.options.blockedBy?.() ?? 'unknown');
  }
  private changed(trigger: QueueWakeup, resume = true): void {
    this.notifying = true;
    try {
      this.options.changed();
    } finally {
      this.notifying = false;
    }
    if (resume) this.resume(trigger);
  }
  private async saveNext(): Promise<void> {
    const current = this.generation,
      draft = this.drafts[0]!;
    this.saving = true;
    this.options.timing?.(draft, 'save-start');
    try {
      await this.options.save(draft);
      if (current !== this.generation) return;
      this.options.draftChanged?.(draft, 'saved');
      this.drafts.shift();
      this.queuedBytes -= new TextEncoder().encode(draft.text).length;
      this.dirty = true;
      this.version++;
      this.options.timing?.(draft, 'ready');
      this.trace?.durable(draft.id, current);
    } catch (error: unknown) {
      if (current !== this.generation) return;
      this.saveFailed = true;
      this.options.draftChanged?.(draft, 'save-failed');
      this.options.timing?.(draft, 'save-failed');
      this.options.failed(error);
    } finally {
      this.saving = false;
      this.changed('save-complete');
    }
  }
  private async flush(trigger: QueueWakeup): Promise<void> {
    this.sending = true;
    const turn = {
      generation: this.generation,
      version: this.version,
      batch: ++this.batch,
      wakeVersion: this.wakeVersion,
    };
    const ids = this.trace?.flush({ ...turn, phase: 'flush', trigger }) ?? [];
    this.activeTrace = ids;
    let result: TextTransmitResult | undefined;
    try {
      result = await this.options.transmit(() =>
        this.markTurn(ids, turn, 'admitted', trigger),
      );
      if (turn.generation === this.generation)
        this.transmitted(result, turn, ids);
    } catch (error: unknown) {
      if (turn.generation !== this.generation) return;
      this.sendFailed = true;
      const live = this.markTurn(ids, turn, 'failed', 'transmission-complete');
      this.trace?.restore(live);
      this.options.failed(error);
    } finally {
      this.activeTrace = [];
      this.sending = false;
      const deferred = this.awaitingAdmission(result, turn);
      this.changed('transmission-complete', !deferred);
      if (deferred) this.observeGate('transmission-complete');
    }
  }
  private awaitingAdmission(
    result: TextTransmitResult | undefined,
    turn: TextQueueTurn,
  ): boolean {
    return (
      result?.deferred === true &&
      turn.generation === this.generation &&
      turn.wakeVersion === this.wakeVersion
    );
  }
  private transmitted(
    result: TextTransmitResult,
    turn: TextQueueTurn,
    ids: readonly string[],
  ): void {
    this.sendFailed = !result.ok && result.deferred !== true;
    this.dirty = !result.ok || result.more || turn.version !== this.version;
    const live = this.markTurn(
      ids,
      turn,
      transmissionPhase(result),
      'transmission-complete',
    );
    if (!result.ok || result.more) this.trace?.restore(live);
  }
  private markTurn(
    ids: readonly string[],
    turn: TextQueueTurn,
    phase: TextQueueObservation['phase'],
    trigger: QueueWakeup,
  ): readonly string[] {
    if (turn.generation !== this.generation) return [];
    return (
      this.trace?.mark(ids, {
        generation: turn.generation,
        batch: turn.batch,
        phase,
        trigger,
      }) ?? []
    );
  }
}
interface TextQueueTurn {
  wakeVersion: number;
  generation: number;
  version: number;
  batch: number;
}
function transmissionPhase(
  result: TextTransmitResult,
): 'deferred' | 'complete' | 'failed' {
  if (result.deferred) return 'deferred';
  return result.ok ? 'complete' : 'failed';
}
