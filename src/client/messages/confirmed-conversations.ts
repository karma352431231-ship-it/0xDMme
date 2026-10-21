import { canonical } from '../../shared/devices/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { traceChatSync } from '../chat-sync-diagnostics/index.ts';
import type {
  ChatSyncDecision,
  ChatSyncReason,
} from '../../shared/chat-sync-diagnostics/index.ts';
interface ConversationView {
  text: string;
  kind?: string;
}
export interface ConfirmedConversation<T> {
  snapshot: string;
  views: T[];
  oldest: number | null;
}

/** Session-only verified candidates. Immediate display is allowed only within
 * the same uninterrupted live epoch; other candidates need a fresh check.
 * Keep at most 16 conversations, 4096 rows and 8 MiB of estimated text/storage.
 * Profile cards keep verification metadata only; their bodies belong to the
 * existing encrypted profile store and do not render as message rows.
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
  private pending = false;
  private profile = '';

  setProfile(session: AccountSession | null): void {
    const profile = canonical([
      session?.name ?? null,
      session?.profileRevision ?? null,
    ]);
    if (profile !== this.profile) this.clear('profile-changed');
    this.profile = profile;
  }

  hint(): void {
    this.pending = true;
    this.trace(null, 'cache-invalidated', 'live-hint');
  }
  confirm(snapshot: unknown): void {
    const current = canonical(snapshot);
    for (const [peer, window] of this.windows)
      if (canonical(JSON.parse(window.value.snapshot) as unknown) !== current) {
        window.epoch = null;
        this.trace(peer, 'cache-invalidated', 'snapshot-changed');
      }
    this.pending = false;
    this.trace(null, 'cache-confirmed', 'confirmed');
  }

  connection(connected: boolean): void {
    this.connected = connected;
    if (!connected) this.invalidateReuse('live-disconnected');
  }
  invalidateReuse(reason: ChatSyncReason = 'account-pause'): void {
    this.epoch++;
    this.trace(null, 'cache-invalidated', reason);
  }
  reusable(peer: string): ConfirmedConversation<T> | null {
    const window = this.windows.get(peer);
    this.trace(peer, 'cache-check', this.reuseReason(peer));
    return this.connected && !this.pending && window?.epoch === this.epoch
      ? window.value
      : null;
  }

  private reuseReason(peer: string): ChatSyncReason {
    if (!this.windows.has(peer)) return 'missing';
    if (!this.connected) return 'disconnected';
    if (this.pending) return 'pending-confirmation';
    return this.windows.get(peer)!.epoch === this.epoch
      ? 'eligible'
      : 'epoch-mismatch';
  }
  clear(reason: ChatSyncReason = 'controller-close'): void {
    this.trace(null, 'cache-cleared', reason);
    this.windows.clear();
    this.bytes = 0;
    this.rows = 0;
    this.pending = false;
  }
  advance(from: unknown, snapshot: unknown, peers: readonly string[]): void {
    const affected = new Set(peers);
    for (const [peer, window] of this.windows) {
      if (
        canonical(JSON.parse(window.value.snapshot) as unknown) !==
        canonical(from)
      )
        continue;
      if (affected.has(peer)) {
        // Retain the old cursor/content for an authenticated delta on reopen.
        // It is not eligible for immediate publication until revalidated.
        window.epoch = null;
        this.trace(peer, 'cache-invalidated', 'message-delta');
      } else {
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
    this.trace(
      peer,
      'candidate-read',
      window ? 'candidate-present' : 'missing',
    );
    if (!window) return null;
    this.windows.delete(peer);
    this.windows.set(peer, window);
    return window.value;
  }
  remember(peer: string, value: ConfirmedConversation<T>): void {
    this.remove(peer, 'replaced');
    const retained = {
      ...value,
      views: value.views.map((view) =>
        view.kind === 'profile' ? { ...view, text: '' } : view,
      ),
    };
    const bytes = retained.views.reduce(
      (total, view) => total + view.text.length * 2 + 1024,
      value.snapshot.length * 2,
    );
    if (bytes > 8 * 1024 * 1024 || value.views.length > 4096) {
      this.trace(
        peer,
        'cache-removed',
        bytes > 8 * 1024 * 1024 ? 'byte-limit' : 'row-limit',
      );
      return;
    }
    this.windows.set(peer, {
      value: retained,
      bytes,
      epoch: this.connected ? this.epoch : null,
    });
    this.bytes += bytes;
    this.rows += value.views.length;
    this.trace(peer, 'cache-stored', 'stored');
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
      this.remove(oldest, this.budgetReason());
    }
  }
  private budgetReason(): ChatSyncReason {
    if (this.windows.size > 16) return 'conversation-limit';
    return this.bytes > 8 * 1024 * 1024 ? 'byte-limit' : 'row-limit';
  }
  private remove(peer: string, reason: ChatSyncReason): void {
    const previous = this.windows.get(peer);
    if (!previous) return;
    this.bytes -= previous.bytes;
    this.rows -= previous.value.views.length;
    this.windows.delete(peer);
    this.trace(peer, 'cache-removed', reason);
  }
  private trace(
    peer: string | null,
    event: ChatSyncDecision['event'],
    reason: ChatSyncReason,
  ): void {
    const window = peer === null ? undefined : this.windows.get(peer);
    traceChatSync(this, peer, {
      event,
      reason,
      windows: this.windows.size,
      rows: this.rows,
      bytes: this.bytes,
      epoch: this.epoch,
      windowEpoch: window?.epoch ?? -1,
      windowRows: window?.value.views.length ?? 0,
      present: window !== undefined,
      connected: this.connected,
      pending: this.pending,
    });
  }
}
