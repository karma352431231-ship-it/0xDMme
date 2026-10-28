/** Conversations whose unsent text is kept; the oldest is dropped beyond it. */
const draftLimit = 50;

/**
 * Unsent @ chat text per conversation, kept in this page's memory only so
 * leaving a conversation and coming back finds it again. It is never written
 * to storage, does not survive a reload and is forgotten with the session.
 */
export class DmDrafts {
  private readonly texts = new Map<string, string>();
  keep(peer: string, text: string): void {
    this.texts.delete(peer);
    if (!text.trim()) return;
    this.texts.set(peer, text);
    if (this.texts.size <= draftLimit) return;
    const oldest = this.texts.keys().next();
    if (!oldest.done) this.texts.delete(oldest.value);
  }
  /** The kept text of a conversation, handed back once. */
  take(peer: string): string {
    const text = this.texts.get(peer) ?? '';
    this.texts.delete(peer);
    return text;
  }
  get size(): number {
    return this.texts.size;
  }
  clear(): void {
    this.texts.clear();
  }
}
