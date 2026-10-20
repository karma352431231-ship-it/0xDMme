import { canonical } from '../../shared/devices/index.ts';
interface ConversationView {
  text: string;
}
export interface ConfirmedConversation<T> {
  snapshot: string;
  views: T[];
  oldest: number | null;
}

/** Session-only verified candidates. Immediate display is allowed only within
 * the same uninterrupted live epoch; other candidates need a fresh check.
 * Keep at most 16 conversations, 4096 rows and 8 MiB of estimated text/storage.
 * Persistent copies remain encrypted under their existing quota. */
export class ConfirmedConversations<T extends ConversationView> {
  private readonly windows = new Map<
    string,
    { value: ConfirmedConversation<T>; bytes: number; epoch: number | null }
  >();
  private bytes = 0;
  private rows = 0;
  private connected = false;
  private epoch = 0;

  connection(connected: boolean): void {
    if (!connected) this.invalidateReuse();
    this.connected = connected;
  }
  invalidateReuse(): void {
    this.epoch++;
  }
  reusable(peer: string): ConfirmedConversation<T> | null {
    const window = this.windows.get(peer);
    return this.connected && window?.epoch === this.epoch ? window.value : null;
  }

  clear(): void {
    this.windows.clear();
    this.bytes = 0;
    this.rows = 0;
  }
  advance(from: unknown, snapshot: unknown, peers: readonly string[]): void {
    const affected = new Set(peers);
    for (const [peer, window] of this.windows) {
      if (
        canonical(JSON.parse(window.value.snapshot) as unknown) !==
        canonical(from)
      )
        continue;
      if (affected.has(peer)) this.remove(peer);
      else {
        const next = JSON.stringify(snapshot),
          change = (next.length - window.value.snapshot.length) * 2;
        window.value.snapshot = next;
        window.bytes += change;
        this.bytes += change;
      }
    }
    this.trim();
  }
  read(peer: string): ConfirmedConversation<T> | null {
    const window = this.windows.get(peer);
    if (!window) return null;
    this.windows.delete(peer);
    this.windows.set(peer, window);
    return window.value;
  }
  remember(peer: string, value: ConfirmedConversation<T>): void {
    this.remove(peer);
    const bytes = value.views.reduce(
      (total, view) => total + view.text.length * 2 + 1024,
      value.snapshot.length * 2,
    );
    if (bytes > 8 * 1024 * 1024 || value.views.length > 4096) return;
    this.windows.set(peer, {
      value,
      bytes,
      epoch: this.connected ? this.epoch : null,
    });
    this.bytes += bytes;
    this.rows += value.views.length;
    this.trim();
  }
  private trim(): void {
    while (
      this.windows.size > 16 ||
      this.bytes > 8 * 1024 * 1024 ||
      this.rows > 4096
    ) {
      const oldest = this.windows.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
  }
  private remove(peer: string): void {
    const previous = this.windows.get(peer);
    if (!previous) return;
    this.bytes -= previous.bytes;
    this.rows -= previous.value.views.length;
    this.windows.delete(peer);
  }
}
