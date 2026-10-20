import { canonical } from '../../shared/devices/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';

export interface ConversationWindow<T> {
  snapshot: string;
  views: T[];
  oldest: number | null;
}

/** Session-only, bounded views. A live hint blocks navigation until a signed
 * confirmation proves the same snapshot; authority/lifecycle loss clears all. */
export class ConversationWindows<T> {
  private readonly entries = new Map<string, ConversationWindow<T>>();
  private snapshot: string | null = null;
  private bytes = 0;
  private readonly sizes = new Map<string, number>();
  private profile = '';
  setProfile(session: AccountSession | null): void {
    const profile = canonical([
      session?.name ?? null,
      session?.profileRevision ?? null,
    ]);
    if (profile !== this.profile) this.clear();
    this.profile = profile;
  }
  clear(): void {
    this.entries.clear();
    this.sizes.clear();
    this.bytes = 0;
    this.invalidate();
  }
  invalidate(): void {
    this.snapshot = null;
  }
  confirm(snapshot: unknown): void {
    this.snapshot = canonical(snapshot);
    for (const [peer, window] of this.entries)
      if (window.snapshot !== this.snapshot) this.remove(peer);
  }
  remember(peer: string, window: ConversationWindow<T>): void {
    this.remove(peer);
    const bytes = JSON.stringify(window).length * 2;
    if (bytes > 8 * 1024 * 1024) return;
    this.entries.set(peer, structuredClone(window));
    this.sizes.set(peer, bytes);
    this.bytes += bytes;
    while (this.entries.size > 16 || this.bytes > 8 * 1024 * 1024)
      this.remove(this.entries.keys().next().value!);
  }
  has(peer: string): boolean {
    const window = this.entries.get(peer);
    return !!window && window.snapshot === this.snapshot;
  }
  read(peer: string): ConversationWindow<T> | null {
    if (!this.has(peer)) return null;
    const window = this.entries.get(peer)!;
    this.entries.delete(peer);
    this.entries.set(peer, window);
    return structuredClone(window);
  }
  private remove(peer: string): void {
    this.bytes -= this.sizes.get(peer) ?? 0;
    this.sizes.delete(peer);
    this.entries.delete(peer);
  }
}
