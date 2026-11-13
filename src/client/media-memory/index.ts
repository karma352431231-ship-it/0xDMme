/**
 * Photos and videos already opened in this session, kept in memory so that
 * switching chats shows them again at once instead of reading and decrypting
 * them again (owner, 13/11/2026).
 *
 * The bytes are the same decrypted media a mounted row already holds; nothing
 * is written to storage. A row reaches this memory only after its message was
 * published by a verified read, so reuse needs no new authorization. The
 * account runtime clears it whenever the session, the device's authority or
 * access to the conversations changes, and forgets a message when it is
 * deleted. Least recently used entries leave first.
 */
const maximumBytes = 96 * 1024 * 1024;
const maximumEntries = 64;
const maximumEntry = 24 * 1024 * 1024;

export type MediaVariant = 'original' | 'thumbnail';

export class MediaMemory {
  private readonly entries = new Map<string, Blob>();
  private bytes = 0;

  has(message: string, variant: MediaVariant): boolean {
    return this.entries.has(key(message, variant));
  }
  /**
   * The stored copy, or the result of `load` stored for next time. Callers
   * may wipe the returned bytes; the memory keeps its own copy.
   */
  async read(
    message: string,
    variant: MediaVariant,
    load: () => Promise<Uint8Array<ArrayBuffer>>,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const name = key(message, variant),
      kept = this.entries.get(name);
    if (kept) {
      this.touch(name, kept);
      return new Uint8Array(await kept.arrayBuffer());
    }
    const bytes = await load();
    this.keep(name, bytes);
    return bytes;
  }
  /** A deleted message's media leaves memory with it. */
  forget(message: string): void {
    for (const variant of ['original', 'thumbnail'] as const) {
      const name = key(message, variant),
        kept = this.entries.get(name);
      if (!kept) continue;
      this.entries.delete(name);
      this.bytes -= kept.size;
    }
  }
  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }
  private keep(name: string, bytes: Uint8Array<ArrayBuffer>): void {
    if (!bytes.length || bytes.length > maximumEntry) return;
    const previous = this.entries.get(name);
    if (previous) this.bytes -= previous.size;
    // The Blob copies the bytes, so the caller's buffer stays its own.
    const blob = new Blob([bytes]);
    this.entries.delete(name);
    this.entries.set(name, blob);
    this.bytes += blob.size;
    this.trim();
  }
  private touch(name: string, blob: Blob): void {
    this.entries.delete(name);
    this.entries.set(name, blob);
  }
  private trim(): void {
    for (const [name, blob] of this.entries) {
      if (this.bytes <= maximumBytes && this.entries.size <= maximumEntries)
        return;
      this.entries.delete(name);
      this.bytes -= blob.size;
    }
  }
}

function key(message: string, variant: MediaVariant): string {
  return `${variant}:${message}`;
}
