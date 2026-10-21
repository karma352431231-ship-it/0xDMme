import type { DeliveryState } from '../message-status/index.ts';

export interface ConversationPreview {
  id: string;
  sequence: number;
  text: string;
  own: boolean;
  sentAt?: number;
  delivery?: DeliveryState;
  read: boolean;
}

/** One refresh in flight and one pending refresh; no cleartext persistence. */
export class ConversationPreviewLoader {
  readonly values = new Map<string, ConversationPreview>();
  private generation = 0;
  private revision = 0;
  private active = false;
  private pending: readonly string[] | null = null;
  failed = false;
  private readonly load: (
    peers: readonly string[],
  ) => Promise<Map<string, ConversationPreview>>;
  private readonly changed: () => void;
  constructor(options: {
    load: ConversationPreviewLoader['load'];
    changed: () => void;
  }) {
    this.load = options.load;
    this.changed = options.changed;
  }
  clear(): void {
    this.generation++;
    this.revision++;
    this.pending = null;
    this.values.clear();
    this.failed = false;
  }
  /** Accept only a complete, already verified latest conversation window.
   * A concurrent older account read must not overwrite this publication. */
  publish(peer: string, preview: ConversationPreview | null): void {
    const previous = this.values.get(peer);
    if (preview && JSON.stringify(previous) === JSON.stringify(preview)) return;
    if (!preview && !previous && !this.active) return;
    this.revision++;
    if (preview) this.values.set(peer, preview);
    else this.values.delete(peer);
    this.changed();
  }
  async refresh(peers: readonly string[]): Promise<void> {
    if (this.active) {
      this.pending = peers;
      return;
    }
    this.active = true;
    this.failed = false;
    const generation = this.generation,
      revision = this.revision;
    try {
      const values = await this.load(peers);
      if (generation !== this.generation) return;
      if (revision !== this.revision) {
        this.pending ??= peers;
        return;
      }
      this.values.clear();
      for (const [peer, preview] of values) this.values.set(peer, preview);
      this.changed();
    } catch {
      // Never leave a previous preview visible after a failed permission/snapshot check.
      if (generation === this.generation) {
        this.failed = true;
        this.values.clear();
        this.changed();
      }
    } finally {
      this.active = false;
      const pending = this.pending;
      this.pending = null;
      if (pending) await this.refresh(pending);
    }
  }
}
