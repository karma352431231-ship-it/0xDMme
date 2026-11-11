/** One authorized opening owns these validated bytes. Never cached or persisted. */
export class ViewOnceMediaBuffer {
  private bytes: Uint8Array<ArrayBuffer> | undefined;
  private closed = false;
  private borrowed = false;
  adopt(bytes: Uint8Array<ArrayBuffer>): void {
    if (this.closed || this.bytes || this.borrowed) {
      bytes.fill(0);
      throw new DOMException('View-once opening cancelled.', 'AbortError');
    }
    this.bytes = bytes;
  }
  async present(
    work: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>,
  ): Promise<boolean> {
    if (this.closed)
      throw new DOMException('View-once opening cancelled.', 'AbortError');
    if (!this.bytes) return false;
    if (this.borrowed) throw new Error('View-once transfer already started.');
    this.borrowed = true;
    try {
      await work(this.bytes);
      return true;
    } finally {
      this.close();
    }
  }
  close(): void {
    this.closed = true;
    this.bytes?.fill(0);
    this.bytes = undefined;
  }
}
