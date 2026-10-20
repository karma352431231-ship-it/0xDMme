export interface TextDraft {
  id: string;
  peer: string;
  text: string;
  createdAt?: number;
  order?: string;
}

/** Local input admission is independent of the SDK owner. Only a confirmed
 * encrypted save requests transmission; failed saves retain their original ID. */
export class TextSendQueue {
  private drafts: TextDraft[] = [];
  private generation = 0;
  private saving = false;
  private sending = false;
  private saveFailed = false;
  private sendFailed = false;
  private dirty = false;
  private version = 0;
  private quiet: ReturnType<typeof setTimeout> | null = null;
  private readonly options: {
    save: (draft: TextDraft) => Promise<void>;
    transmit: () => Promise<{ ok: boolean; more: boolean }>;
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
  }
  get unsaved(): boolean {
    return this.drafts.length > 0;
  }
  get pending(): boolean {
    return (
      (this.unsaved && !this.saveFailed) ||
      (this.dirty && !this.sendFailed) ||
      this.sending ||
      this.quiet !== null
    );
  }
  get full(): boolean {
    return this.drafts.length >= 32;
  }
  enqueue(draft: TextDraft): void {
    if (this.full || new TextEncoder().encode(draft.text).length > 131072)
      throw new Error('Wait for conversations to update, then try again.');
    const captured = { ...draft, createdAt: draft.createdAt ?? Date.now() };
    this.drafts.push(captured);
    this.options.draftChanged?.(captured, 'admitted');
    this.deferBackground();
    this.sendFailed = false;
    this.options.changed();
    this.resume();
  }
  retry(): void {
    this.saveFailed = false;
    this.sendFailed = false;
    this.dirty = true;
    this.options.changed();
    this.resume();
  }
  deferBackground(): void {
    if (this.quiet !== null) clearTimeout(this.quiet);
    this.quiet = setTimeout(() => {
      this.quiet = null;
      this.options.changed();
    }, 1000);
  }
  reset(): void {
    this.generation++;
    if (this.quiet !== null) clearTimeout(this.quiet);
    this.quiet = null;
    this.drafts = [];
    this.dirty = false;
    this.saveFailed = false;
    this.sendFailed = false;
  }
  resume(): void {
    if (!this.saving && !this.saveFailed && this.unsaved) void this.saveNext();
    if (
      !this.sending &&
      !this.sendFailed &&
      this.dirty &&
      this.options.available()
    )
      void this.flush();
  }
  private async saveNext(): Promise<void> {
    const current = this.generation,
      draft = this.drafts[0]!;
    this.saving = true;
    try {
      await this.options.save(draft);
      if (current !== this.generation) return;
      this.options.draftChanged?.(draft, 'saved');
      this.drafts.shift();
      this.dirty = true;
      this.version++;
    } catch (error: unknown) {
      if (current !== this.generation) return;
      this.saveFailed = true;
      this.options.draftChanged?.(draft, 'save-failed');
      this.options.failed(error);
    } finally {
      this.saving = false;
      this.options.changed();
      this.resume();
    }
  }
  private async flush(): Promise<void> {
    this.sending = true;
    const current = this.generation,
      version = this.version;
    try {
      const result = await this.options.transmit();
      if (current !== this.generation) return;
      this.sendFailed = !result.ok;
      this.dirty = !result.ok || result.more || version !== this.version;
    } catch (error: unknown) {
      if (current !== this.generation) return;
      this.sendFailed = true;
      this.options.failed(error);
    } finally {
      this.sending = false;
      this.options.changed();
      this.resume();
    }
  }
}
