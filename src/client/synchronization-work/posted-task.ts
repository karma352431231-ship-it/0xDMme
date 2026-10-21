/** A bounded browser task source avoids per-page timer clamping. Node and
 * runtimes without DOM message ports retain the zero-delay timer fallback. */
export class SynchronizationTask {
  private channel: MessageChannel | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scheduled = false;
  private readonly run: () => void;
  constructor(run: () => void) {
    this.run = run;
  }
  get pending(): boolean {
    return this.scheduled;
  }
  schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    if (
      typeof window === 'undefined' ||
      typeof MessageChannel === 'undefined'
    ) {
      this.timer = setTimeout(() => this.dispatch(), 0);
      return;
    }
    if (!this.channel) {
      this.channel = new MessageChannel();
      this.channel.port1.onmessage = () => this.dispatch();
    }
    this.channel.port2.postMessage(null);
  }
  private dispatch(): void {
    this.timer = null;
    this.scheduled = false;
    this.run();
  }
  clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.channel) {
      this.channel.port1.onmessage = null;
      this.channel.port1.close();
      this.channel.port2.close();
      this.channel = null;
    }
    this.scheduled = false;
  }
}
