interface ConnectivityOptions {
  hint: () => boolean;
  changed: (online: boolean) => void;
  probe?: (signal: AbortSignal) => Promise<boolean>;
}

const interval = 30_000;
const deadline = 8_000;

/** Owns only permission to attempt networking, never account authorization.
 * A browser offline hint can be overridden by a real response, in memory only.
 */
export class Connectivity {
  private readonly options: ConnectivityOptions;
  private hint: boolean | undefined;
  private verified = false;
  private published: boolean | undefined;
  private active = false;
  private checkedAt = -Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private checking: AbortController | null = null;
  constructor(options: ConnectivityOptions) {
    this.options = options;
  }
  get online(): boolean {
    const hint = this.options.hint();
    if (hint !== this.hint) {
      this.hint = hint;
      this.verified = false;
    }
    return hint || this.verified;
  }
  responded(): void {
    // Accept the response atomically: publishing a transient offline state here
    // could cancel the operation that just established connectivity.
    this.hint = this.options.hint();
    this.verified = true;
    this.checkedAt = Date.now();
    this.cancelCheck();
    this.publish();
    this.check();
  }
  failed(): void {
    this.verified = false;
    this.cancelCheck();
    this.publish();
    this.check();
  }
  hintChanged(): void {
    this.verified = false;
    this.cancelCheck();
    this.clearTimer();
    this.publish();
    this.check();
  }
  resume(): void {
    this.active = true;
    this.publish();
    this.check();
  }
  pause(): void {
    this.active = false;
    this.clearTimer();
    this.cancelCheck();
  }
  private publish(): void {
    const online = this.online;
    if (online === this.published) return;
    this.published = online;
    this.options.changed(online);
  }
  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  private cancelCheck(): void {
    this.checking?.abort();
    if (this.deadline !== null) clearTimeout(this.deadline);
    this.deadline = null;
  }
  private check(): void {
    if (!this.active || !this.options.probe || this.options.hint()) return;
    if (this.checking || this.timer !== null) return;
    const delay = this.checkedAt + interval - Date.now();
    if (delay > 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.check();
      }, delay);
      return;
    }
    const controller = new AbortController();
    this.checking = controller;
    this.checkedAt = Date.now();
    void this.probe(controller);
  }
  private async probe(controller: AbortController): Promise<void> {
    this.deadline = setTimeout(() => {
      this.deadline = null;
      if (!controller.signal.aborted) this.acceptProbe(false);
      controller.abort();
    }, deadline);
    try {
      const verified = await this.options.probe!(controller.signal);
      if (!controller.signal.aborted) this.acceptProbe(verified);
    } catch {
      if (!controller.signal.aborted) this.acceptProbe(false);
    } finally {
      if (this.checking === controller) {
        this.cancelCheck();
        this.checking = null;
      }
      this.check();
    }
  }
  private acceptProbe(verified: boolean): void {
    this.verified = verified;
    this.publish();
  }
}
