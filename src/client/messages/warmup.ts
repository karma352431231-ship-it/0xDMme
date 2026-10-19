import type { VaultWorkOptions } from '../vault-authority/index.ts';

type Step = () => Promise<void>;

/** Bounded startup maintenance yields between owners to foreground actions.
 * No SDK or authority operation is interrupted or run concurrently here. */
export class MessageWarmup {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private next: number | null = null;
  private running = false;
  ready = false;
  get pending(): boolean {
    return this.next !== null || this.running;
  }
  private readonly options: {
    available: () => boolean;
    run: (step: Step) => Promise<void>;
    failed: (error: unknown) => void;
    changed: () => void;
    steps: readonly [Step, Step, Step, Step];
  };
  constructor(options: MessageWarmup['options']) {
    this.options = options;
  }
  /** Only essential first startup is interactive; later rechecks stay maintenance. */
  initialWork(visible: boolean): VaultWorkOptions {
    return !this.ready && visible ? { priority: 'interactive' } : {};
  }
  request(): void {
    this.ready = true;
    this.next = 0;
    this.resume();
  }
  reset(): void {
    this.ready = false;
    this.next = null;
    this.pause();
  }
  pause(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  resume(): void {
    if (
      this.timer !== null ||
      this.running ||
      this.next === null ||
      !this.options.available()
    )
      return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.step().catch(this.options.failed);
    }, 1000);
  }
  private async step(): Promise<void> {
    if (this.next === null || !this.options.available()) return;
    const step = this.options.steps[this.next]!;
    this.next =
      this.next + 1 < this.options.steps.length ? this.next + 1 : null;
    this.running = true;
    try {
      await this.options.run(step);
    } finally {
      this.running = false;
      this.options.changed();
      this.resume();
    }
  }
}
