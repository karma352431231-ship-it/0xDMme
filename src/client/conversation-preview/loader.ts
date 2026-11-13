import {
  loadingPresentation,
  timedLoad,
} from '../chat-sync-diagnostics/index.ts';
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
  private readonly loading = loadingPresentation('conversation-previews');
  readonly values = new Map<string, ConversationPreview>();
  private generation = 0;
  private revision = 0;
  private active = false;
  private completion: Promise<void> | undefined;
  private pending: readonly string[] | null = null;
  failed = false;
  private readonly load: (
    peers: readonly string[],
  ) => Promise<Map<string, ConversationPreview>>;
  private readonly changed: () => void;
  private readonly available: () => boolean;
  private readonly exclude: () => readonly string[];
  constructor(options: {
    load: ConversationPreviewLoader['load'];
    changed: () => void;
    available?: () => boolean;
    exclude?: () => readonly string[];
  }) {
    this.load = options.load;
    this.changed = options.changed;
    this.available = options.available ?? (() => true);
    this.exclude = options.exclude ?? (() => []);
  }
  clear(): void {
    this.loading.cancel();
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
    this.pending = peers;
    await this.drain();
  }
  /** Startup waits for an existing/coalesced read without bypassing admission. */
  async prepare(peers: readonly string[]): Promise<boolean> {
    await this.refresh(peers);
    await this.completion;
    return this.pending === null;
  }
  /** Resume one coalesced list read after foreground verification settles. */
  resume(): void {
    void this.drain();
  }
  presented(host: HTMLElement, matchingRows = true): void {
    this.loading.presented(host, matchingRows);
  }
  private async drain(): Promise<void> {
    if (this.active || this.pending === null || !this.available()) return;
    const peers = this.pending;
    this.pending = null;
    this.active = true;
    let finished = () => {};
    const completion = new Promise<void>((resolve) => {
      finished = resolve;
    });
    this.completion = completion;
    this.failed = false;
    const generation = this.generation,
      revision = this.revision;
    try {
      let values = new Map<string, ConversationPreview>();
      await this.loading.run(async (trace) => {
        values = await timedLoad(trace, 'previews', () =>
          this.loadEligible(peers),
        );
        return values.size;
      });
      if (generation !== this.generation) return;
      if (revision !== this.revision) {
        this.loading.cancel();
        this.pending ??= peers;
        return;
      }
      this.replace(values);
    } catch {
      // Never leave a previous preview visible after a failed permission/snapshot check.
      if (generation === this.generation) {
        this.failed = true;
        this.values.clear();
        this.changed();
      }
    } finally {
      this.active = false;
      try {
        await this.drain();
      } finally {
        finished();
        if (this.completion === completion) this.completion = undefined;
      }
    }
  }
  private loadEligible(
    peers: readonly string[],
  ): Promise<Map<string, ConversationPreview>> {
    const excluded = new Set(this.exclude());
    const eligible = peers.filter((peer) => !excluded.has(peer));
    return eligible.length || !peers.length
      ? this.load(eligible)
      : Promise.resolve(new Map<string, ConversationPreview>());
  }
  private replace(values: ReadonlyMap<string, ConversationPreview>): void {
    // The selected verified window owns its preview; list reads serve other peers.
    const excluded = new Set(this.exclude());
    for (const peer of this.values.keys())
      if (!excluded.has(peer)) this.values.delete(peer);
    for (const [peer, preview] of values)
      if (!excluded.has(peer)) this.values.set(peer, preview);
    this.changed();
  }
}
