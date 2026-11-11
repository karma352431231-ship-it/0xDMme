export { submittedMediaRows, updateSubmittedMediaStates } from './rows.ts';
import type {
  MediaSubmission,
  SubmissionItem,
  StagedMedia,
  SubmittedMedia,
} from './types.ts';
export type {
  MediaSubmission,
  SubmissionItem,
  StagedMedia,
  SubmittedMedia,
} from './types.ts';
import {
  attachmentBatchLimit,
  chatFileLimit,
} from '../../shared/attachments/index.ts';
import { traceSend } from '../chat-sync-diagnostics/index.ts';

interface Batch {
  cancel: AbortController;
  items: SubmissionItem[];
  next: number;
  failed: boolean;
  ids: Set<string>;
}
/** Owns at most two immutable media batches, their transferred plaintext,
 * staging failure/retry and visible lifetime. The outbox owns durable data,
 * ordering, ciphertext retry and publication; the scheduler owns the engine. */
export class AttachmentSubmissions {
  private readonly batches: Batch[] = [];
  private readonly held = new Map<string, SubmittedMedia>();
  private generation = 0;
  private running = false;
  private admitting = false;
  private readonly options: {
    available: () => boolean;
    run: (work: () => Promise<void>) => Promise<boolean>;
    stage: (item: SubmissionItem) => Promise<StagedMedia[]>;
    send: () => Promise<void>;
    changed: (update?: 'progress') => void;
    failed: (error: unknown) => void;
    followup: () => void;
  };
  constructor(options: AttachmentSubmissions['options']) {
    this.options = options;
  }
  get pending(): boolean {
    return this.batches.length > 0;
  }
  get ready(): boolean {
    return this.pending && !this.batches[0]!.failed;
  }
  get active(): boolean {
    return this.running;
  }
  get full(): boolean {
    return (
      this.batches.length >= 2 ||
      this.held.size >= 64 - attachmentBatchLimit * 2
    );
  }
  get unsaved(): boolean {
    return this.batches.some((batch) => batch.next < batch.items.length);
  }
  enqueue(input: MediaSubmission): void {
    if (
      this.full ||
      input.selections.length > attachmentBatchLimit ||
      input.selections.reduce((sum, item) => sum + item.bytes.length, 0) >
        chatFileLimit
    ) {
      traceSend('ui-blocked', undefined, { sendBlock: 'queue-full' });
      throw new Error('Wait for conversations to update, then try again.');
    }
    const createdAt = Date.now();
    const cancel = new AbortController();
    const items = (input.selections.length ? input.selections : [null]).map(
      (selection, index) => ({
        id: crypto.randomUUID(),
        peer: input.peer,
        selection: selection ? Object.freeze({ ...selection }) : null,
        text: index === 0 ? input.text : '',
        reply: index === 0 ? input.reply : null,
        viewOnce: input.viewOnce,
        createdAt: createdAt + index,
        signal: cancel.signal,
      }),
    );
    this.batches.push({
      cancel,
      items,
      next: 0,
      failed: false,
      ids: new Set(items.map((item) => item.id)),
    });
    for (const item of items) {
      this.held.set(item.id, {
        id: item.id,
        peer: item.peer,
        createdAt: item.createdAt,
        content: null,
        viewOnce: item.viewOnce,
        phase: 'queued',
        progress: null,
      });
      traceSend('submit', item.id);
      traceSend('ui-available', item.id);
      if (!this.options.available())
        traceSend('ui-blocked', item.id, { sendBlock: 'engine' });
    }
    this.admitting = true;
    try {
      this.options.changed();
    } finally {
      this.admitting = false;
    }
    queueMicrotask(() => this.resume());
  }
  resume(): void {
    if (
      this.admitting ||
      this.running ||
      !this.batches.length ||
      this.batches[0]!.failed ||
      !this.options.available()
    )
      return;
    this.running = true;
    const generation = this.generation,
      batch = this.batches[0]!;
    void this.perform(batch, generation);
  }
  private async perform(batch: Batch, generation: number): Promise<void> {
    try {
      const ran = await this.options.run(async () => {
        await this.stageBatch(batch, generation);
        if (generation !== this.generation) return;
        this.markBatch(batch, navigator.onLine ? 'sending' : 'saved');
        if (navigator.onLine) await this.options.send();
        if (generation === this.generation) this.markBatch(batch, 'saved');
        if (generation === this.generation) this.options.followup();
      });
      if (generation !== this.generation) return;
      if (ran) this.batches.shift();
      else {
        batch.failed = true;
        this.markBatch(batch, 'failed');
      }
    } catch (error: unknown) {
      if (generation !== this.generation) return;
      batch.failed = true;
      this.markBatch(batch, 'failed');
      this.options.failed(error);
    } finally {
      if (generation !== this.generation) this.disposeBatch(batch);
      this.running = false;
      this.options.changed();
      this.resume();
    }
  }
  private async stageBatch(batch: Batch, generation: number): Promise<void> {
    while (batch.next < batch.items.length && generation === this.generation) {
      const item = batch.items[batch.next]!;
      this.mark(item.id, 'staging');
      this.options.changed();
      const staged = await this.options.stage(item);
      if (generation !== this.generation) return;
      for (const row of staged) {
        batch.ids.add(row.id);
        this.held.set(row.id, {
          ...row,
          viewOnce: item.viewOnce,
          phase: 'saved',
          progress: null,
        });
      }
      this.wipe(item);
      batch.next++;
      traceSend('staging-complete', item.id);
      this.options.changed();
    }
  }
  private markBatch(batch: Batch, phase: SubmittedMedia['phase']): void {
    for (const id of batch.ids) this.mark(id, phase);
    this.options.changed();
  }
  private mark(id: string, phase: SubmittedMedia['phase']): void {
    const value = this.held.get(id);
    if (value && value.phase !== 'accepted') value.phase = phase;
  }
  acknowledge(value: { id: string; peer: string }): boolean {
    const held = this.held.get(value.id);
    if (!held || held.peer !== value.peer) return false;
    held.phase = 'accepted';
    held.progress = 1;
    this.reconcileFailedBatch();
    this.trim();
    this.options.changed();
    return true;
  }
  progress(input: { message: string; done: number; total: number }): void {
    const value = this.held.get(input.message);
    if (!value || value.phase === 'accepted') return;
    value.phase = 'sending';
    value.progress = input.total ? input.done / input.total : 0;
    this.options.changed('progress');
  }
  retry(): boolean {
    const batch = this.batches[0];
    if (!batch?.failed) return false;
    batch.failed = false;
    this.resume();
    return true;
  }
  private reconcileFailedBatch(): void {
    const batch = this.batches[0];
    if (!batch?.failed || batch.next < batch.items.length) return;
    for (const id of batch.ids) {
      const row = this.held.get(id);
      if (row && row.phase !== 'accepted') return;
    }
    this.batches.shift();
  }
  failTransfer(): void {
    for (const row of this.held.values())
      if (row.phase === 'sending') row.phase = 'failed';
  }
  peers(): string[] {
    return [
      ...new Set(
        [...this.held.values()]
          .filter((item) => item.phase !== 'accepted')
          .map((item) => item.peer),
      ),
    ];
  }
  has(id: string): boolean {
    return this.held.has(id);
  }
  forPeer(peer: string | undefined): readonly SubmittedMedia[] {
    return [...this.held.values()].filter((value) => value.peer === peer);
  }
  observed(
    peer: string | undefined,
    rows: readonly { id: string }[] | null,
  ): void {
    if (!rows) return;
    const ids = new Set(rows.map((row) => row.id));
    for (const value of this.held.values())
      if (value.peer === peer && ids.has(value.id)) this.held.delete(value.id);
  }
  private trim(): void {
    for (const value of this.held.values()) {
      if (this.held.size < 64 - attachmentBatchLimit * 2) break;
      if (value.phase === 'accepted') this.held.delete(value.id);
    }
  }
  private wipe(item: SubmissionItem): void {
    item.selection?.bytes.fill(0);
    item.selection?.thumbnail?.fill(0);
    item.selection = null;
    item.text = '';
  }
  private disposeBatch(batch: Batch): void {
    for (const item of batch.items) this.wipe(item);
  }
  reset(): void {
    this.generation++;
    for (const batch of this.batches) {
      batch.cancel.abort();
      if (!this.running || batch !== this.batches[0]) this.disposeBatch(batch);
    }
    this.batches.length = 0;
    this.held.clear();
  }
}
