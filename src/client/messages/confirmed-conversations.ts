interface ConversationView {
  text: string;
}
export interface ConfirmedConversation<T> {
  snapshot: string;
  views: T[];
  oldest: number | null;
}

/** Session-only candidates, never authority to display a conversation. The caller
 * must authenticate the snapshot and confirm it again before publishing rows.
 * Keep at most 16 conversations, 4096 rows and 8 MiB of estimated text/storage.
 * Persistent copies remain encrypted under their existing quota. */
export class ConfirmedConversations<T extends ConversationView> {
  private readonly windows = new Map<
    string,
    { value: ConfirmedConversation<T>; bytes: number }
  >();
  private bytes = 0;
  private rows = 0;

  clear(): void {
    this.windows.clear();
    this.bytes = 0;
    this.rows = 0;
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
    this.windows.set(peer, { value, bytes });
    this.bytes += bytes;
    this.rows += value.views.length;
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
