import type { VaultWorkOptions } from '../vault-authority/index.ts';
import { startLoad } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';

type Step = () => Promise<void | false>;

/** Bounded startup maintenance yields between owners to foreground actions.
 * No SDK or authority operation is interrupted or run concurrently here. */
export class MessageWarmup {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private next: number | null = null;
  private running = false;
  private repeat = false;
  private generation = 0;
  private scheduled: LoadTrace | undefined;
  ready = false;
  get pending(): boolean {
    return this.next !== null || this.running;
  }
  private readonly options: {
    available: () => boolean;
    run: (step: () => Promise<void>) => Promise<void>;
    failed: (error: unknown) => void;
    changed: () => void;
    steps: readonly [Step, ...Step[]];
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
  /** Coalesce a burst without restarting owners already queued in this pass. */
  queue(): void {
    if (!this.pending) this.request();
    else if (this.running || this.next !== 0) this.repeat = true;
  }
  reset(): void {
    this.generation++;
    this.repeat = false;
    this.ready = false;
    this.next = null;
    this.pause();
  }
  pause(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.scheduled?.point('cancelled', { loadOutcome: 'cancelled' });
    this.scheduled = undefined;
  }
  resume(): void {
    if (
      this.timer !== null ||
      this.running ||
      this.next === null ||
      !this.options.available()
    )
      return;
    this.scheduled = startLoad('optional-maintenance');
    const scheduledAt = performance.now();
    this.timer = setTimeout(() => {
      this.timer = null;
      const trace = this.scheduled;
      this.scheduled = undefined;
      trace?.point('scheduler', {
        loadStageMs: Math.round(performance.now() - scheduledAt),
      });
      void this.step(trace).catch(this.options.failed);
    }, 1000);
  }
  private async step(trace: LoadTrace | undefined): Promise<void> {
    if (this.next === null || !this.options.available()) {
      trace?.point('cancelled', { loadOutcome: 'cancelled' });
      return;
    }
    const index = this.next;
    const step = this.options.steps[index]!;
    this.next = index + 1 < this.options.steps.length ? index + 1 : null;
    const generation = this.generation;
    this.running = true;
    try {
      await this.execute(async () => {
        if ((await step()) === false && this.generation === generation)
          this.next = index;
      }, trace);
    } finally {
      this.running = false;
      if (this.next === null && this.repeat) {
        this.repeat = false;
        this.next = 0;
      }
      this.options.changed();
      this.resume();
    }
  }
  private async execute(
    step: () => Promise<void>,
    trace: LoadTrace | undefined,
  ): Promise<void> {
    try {
      if (trace) await trace.measure('work', () => this.options.run(step));
      else await this.options.run(step);
      trace?.point('complete', { loadOutcome: 'complete' });
    } catch (error: unknown) {
      trace?.point('failed', { loadOutcome: 'failed' });
      throw error;
    }
  }
}
