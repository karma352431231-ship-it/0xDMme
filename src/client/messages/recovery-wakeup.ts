import type { PendingConversation } from './sync-progress.ts';
/** A sleeping failed peer does not keep the inbox polling. One bounded alarm
 * requests its next fair turn; lifecycle owners cancel it on departure. */
export class MessageRecoveryWakeup {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly request: () => void;
  constructor(request: () => void) {
    this.request = request;
  }
  clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  wait(pending: readonly PendingConversation[]): void {
    this.clear();
    if (!pending.length || pending.some((item) => item.retryAt <= Date.now()))
      return;
    const next = Math.min(...pending.map((item) => item.retryAt));
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.request();
      },
      Math.min(next - Date.now(), 2147483647),
    );
  }
}
