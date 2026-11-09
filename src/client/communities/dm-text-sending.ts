import { OutgoingTexts, TextSendQueue } from '../text-send/index.ts';
import type { OutgoingText, TextDraft } from '../text-send/index.ts';
import type { SocialDms } from '../social-dm/index.ts';
import {
  expectedInterruption,
  workInterruption,
} from '../synchronization-work/index.ts';

function interrupted(error: unknown): boolean {
  return (
    expectedInterruption(error) || workInterruption(error)?.origin === 'session'
  );
}

/** Session-owned text admission; navigation never retargets a saved draft.
 * Acceptance ends transmission without waiting for a history readback. */
export class DmTextSending {
  private readonly outgoing = new OutgoingTexts({
    maximumTextBytes: 3_000_000,
    maximumBytes: 8 * 1024 * 1024,
  });
  private readonly queue: TextSendQueue;
  private generation = 0;
  private transferring = false;
  private restoring: Promise<void> | null = null;
  private readonly options: {
    controller: Pick<SocialDms, 'queueText' | 'pendingTexts' | 'sendPending'>;
    available: () => boolean;
    changed: () => void;
    failed: (error: unknown) => void;
  };
  constructor(options: {
    controller: Pick<SocialDms, 'queueText' | 'pendingTexts' | 'sendPending'>;
    available: () => boolean;
    changed: () => void;
    failed: (error: unknown) => void;
  }) {
    this.options = options;
    window.addEventListener('online', () => this.resume());
    window.addEventListener('beforeunload', (event) => {
      if (!this.queue.unsaved) return;
      event.preventDefault();
      event.returnValue = '';
    });
    document.addEventListener('visibilitychange', () => this.resume());
    this.queue = new TextSendQueue({
      maximumTextBytes: 3_000_000,
      maximumQueuedBytes: 8 * 1024 * 1024,
      available: options.available,
      save: (draft) => this.save(draft),
      transmit: async () => {
        const generation = this.generation;
        this.outgoing.beginTransfer();
        this.transferring = true;
        try {
          const result = await options.controller.sendPending({
            priority: 'interactive',
            published: (draft) => {
              if (generation !== this.generation) return;
              this.outgoing.acknowledge(draft);
              options.changed();
            },
          });
          return { ok: true, more: result.more };
        } catch (error: unknown) {
          // View suspension cancels the controller without replacing this
          // account-owned queue. Its next turn rechecks live send authority.
          if (generation === this.generation && interrupted(error))
            return { ok: true, more: true };
          throw error;
        } finally {
          this.transferring = false;
        }
      },
      draftChanged: (draft, phase) => this.outgoing.update(draft, phase),
      changed: options.changed,
      failed: (error) => {
        this.outgoing.failTransfer();
        options.failed(error);
      },
    });
  }
  enqueue(peer: string, text: string): void {
    this.queue.enqueue({ id: crypto.randomUUID(), peer, text });
  }
  private async save(draft: TextDraft): Promise<void> {
    const generation = this.generation;
    try {
      await this.options.controller.queueText(draft);
    } catch (error: unknown) {
      if (generation !== this.generation || !interrupted(error)) throw error;
      // One renewed local turn may save the same ID after view suspension.
      await this.options.controller.queueText(draft);
    }
  }
  get transmitting(): boolean {
    return this.transferring;
  }
  get full(): boolean {
    return this.queue.full;
  }
  get pending(): boolean {
    return this.queue.pending;
  }
  get unsaved(): boolean {
    return this.queue.unsaved;
  }
  forPeer(peer: string): readonly OutgoingText[] {
    return this.outgoing.forPeer(peer);
  }
  observed(rows: readonly { id: string }[]): void {
    this.outgoing.observed(rows);
  }
  async restore(peer: string): Promise<void> {
    const generation = this.generation;
    if (this.restoring) await this.restoring;
    if (generation !== this.generation) return;
    const task = this.options.controller
      .pendingTexts(peer, {
        priority: 'interactive',
      })
      .then((drafts) => {
        if (generation !== this.generation) return;
        const recovered = drafts.filter(
          (draft) => !this.outgoing.has(draft.id),
        );
        this.outgoing.restore(recovered);
        if (recovered.length) this.queue.retry();
      });
    this.restoring = task;
    try {
      await task;
    } finally {
      if (this.restoring === task) this.restoring = null;
    }
  }
  retry(): void {
    this.outgoing.retry();
    this.queue.retry();
  }
  resume(): void {
    this.queue.resume();
  }
  reset(): void {
    this.generation++;
    this.restoring = null;
    this.queue.reset();
    this.outgoing.reset();
  }
}
