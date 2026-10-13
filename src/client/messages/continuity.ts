interface ContinuityOperations {
  current: () => boolean;
  available: () => boolean;
  pause: () => void;
  stop: () => void;
  reconnect: () => void;
  check: () => void;
}

/** Visibility alone does not invalidate a verified conversation. Actual stream
 * loss or browser suspension closes it before a signed check can reopen it. */
export class MessageContinuity {
  private readonly options: ContinuityOperations;
  private connected = false;
  suspended = false;
  constructor(options: ContinuityOperations) {
    this.options = options;
  }
  reset(): void {
    this.connected = false;
    this.suspended = false;
  }
  changed(): void {
    const current = this.options.current();
    if (this.connected && !current) this.options.pause();
    this.connected = current;
  }
  visibility(visible: boolean): void {
    if (!visible || (!this.suspended && this.options.current())) return;
    this.suspended = false;
    this.reconnect();
  }
  freeze(): void {
    if (this.suspended) return;
    this.suspended = true;
    this.connected = false;
    this.options.stop();
    this.options.pause();
  }
  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    this.reconnect();
  }
  private reconnect(): void {
    this.connected = false;
    this.options.pause();
    if (!this.options.available()) return;
    this.options.reconnect();
    this.options.check();
  }
}
