import type { AttachmentSelection } from '../attachments/index.ts';

/** At most this many files wait in the composer; each is sent as its own message. */
export const attachmentBatchLimit = 10;

export type Admission = 'added' | 'full' | 'over-limit';

/**
 * Selections waiting in one composer, in the order chosen (24/10/2026): a
 * recorded voice note alone, or up to attachmentBatchLimit files that share
 * the conversation's byte limit. The queue owns their bytes and wipes every
 * selection it drops, refuses or hands over as sent.
 */
export class AttachmentSelectionQueue {
  private readonly maximum: number;
  private items: AttachmentSelection[] = [];
  constructor(maximum: number) {
    this.maximum = maximum;
  }
  get first(): AttachmentSelection | null {
    return this.items[0] ?? null;
  }
  get all(): readonly AttachmentSelection[] {
    return this.items;
  }
  get used(): number {
    return this.items.reduce((total, item) => total + item.bytes.length, 0);
  }
  get full(): boolean {
    return this.items.length >= attachmentBatchLimit;
  }
  /** Checked before reading a file, so an oversized choice costs nothing. */
  fits(bytes: number): boolean {
    return this.used + bytes <= this.maximum;
  }
  admit(item: AttachmentSelection): Admission {
    const result: Admission = this.full
      ? 'full'
      : this.fits(item.bytes.length)
        ? 'added'
        : 'over-limit';
    if (result === 'added') this.items.push(item);
    else wipe(item);
    return result;
  }
  /** A voice note replaces everything waiting. */
  replace(item: AttachmentSelection): void {
    this.clear();
    this.items = [item];
  }
  remove(item: AttachmentSelection): void {
    if (!this.items.includes(item)) return;
    this.items = this.items.filter((value) => value !== item);
    wipe(item);
  }
  clear(): void {
    for (const item of this.items) wipe(item);
    this.items = [];
  }
}

/** Chosen bytes never outlive their selection in memory. */
export function wipe(selection: AttachmentSelection): void {
  selection.bytes.fill(0);
  selection.thumbnail?.fill(0);
}
