import type {
  QueueGate,
  QueueWakeup,
  TextQueueObservation,
} from '../../shared/chat-sync-diagnostics/text-queue.ts';

export type ObserveTextQueue = (
  id: string,
  value: TextQueueObservation,
) => 'retired' | void;
const limit = 32;

/** Observes only durable drafts waiting for a queue admission. The queue's
 * version and the persisted outbox determine what actually gets sent. */
export class TextQueueTrace {
  private readonly waiting = new Map<string, QueueGate | undefined>();
  private readonly emit: ObserveTextQueue;
  constructor(emit: ObserveTextQueue) {
    this.emit = emit;
  }

  durable(id: string, generation: number): void {
    if (this.waiting.size < limit) this.waiting.set(id, undefined);
    else
      this.emit(id, {
        phase: 'truncated',
        trigger: 'save-complete',
        generation,
      });
    this.emit(id, { phase: 'durable', trigger: 'save-complete', generation });
  }
  decision(value: TextQueueObservation & { gate: QueueGate }): void {
    for (const [id, prior] of this.waiting) {
      if (prior === value.gate) continue;
      this.waiting.set(id, value.gate);
      this.emit(id, { ...value, phase: 'requested' });
      if (this.emit(id, value) === 'retired') this.waiting.delete(id);
    }
  }
  flush(value: TextQueueObservation): readonly string[] {
    const ids = [...this.waiting.keys()];
    this.waiting.clear();
    return this.mark(ids, value);
  }
  restore(ids: readonly string[]): void {
    for (const id of ids)
      if (this.waiting.size < limit) this.waiting.set(id, undefined);
  }
  mark(ids: readonly string[], value: TextQueueObservation): readonly string[] {
    return ids.filter((id) => {
      if (this.emit(id, value) !== 'retired') return true;
      this.waiting.delete(id);
      return false;
    });
  }
  reset(generation: number, trigger: QueueWakeup): void {
    this.mark([...this.waiting.keys()], {
      generation,
      trigger,
      phase: 'cancelled',
    });
    this.waiting.clear();
  }
}
