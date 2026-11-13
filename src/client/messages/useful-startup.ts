import { startLoad } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';

type Step = () => Promise<void>;
interface StartupOperations {
  available: () => boolean;
  /** Group work shares the foreground engine owner. Previews already own
   * single-flight admission and acquire verified authority for their reads. */
  run: (step: Step) => Promise<boolean>;
  previews: () => Promise<boolean>;
  groups: Step;
  settled: () => void;
  failed: (error: unknown) => void;
}
/** One bounded visible-directory pass, independent of optional maintenance.
 * Group work shares foreground exclusion; preview reads keep their authority lane. */
export class UsefulStartup {
  private readonly options: StartupOperations;
  private generation = 0;
  private step: number | null = null;
  private running = false;
  private repeat = false;
  private trace: LoadTrace | undefined;
  private queuedAt = 0;
  private initial = true;
  constructor(options: StartupOperations) {
    this.options = options;
  }
  get pending(): boolean {
    return this.step !== null || this.running;
  }
  request(): void {
    if (this.step !== null) {
      this.repeat ||= this.running || this.step !== 0;
      return;
    }
    this.step = 0;
    this.queuedAt = performance.now();
    this.trace = startLoad('useful-directory');
    this.trace?.point('entry', { loadInitial: this.initial });
    this.initial = false;
    this.resume();
  }
  reset(): void {
    this.generation++;
    this.step = null;
    this.repeat = false;
    this.initial = true;
    this.trace?.point('cancelled', { loadOutcome: 'cancelled' });
    this.trace = undefined;
  }
  resume(): void {
    if (this.running || this.step === null || !this.options.available()) return;
    this.running = true;
    const generation = this.generation;
    // Reserve our pass before maintenance, then let the active owner settle.
    void Promise.resolve()
      .then(() => this.advance(generation))
      .catch(this.options.failed);
  }
  private async advance(generation: number): Promise<void> {
    const step = this.step;
    let progressed = false;
    try {
      if (step === null || !this.canAdvance(generation)) return;
      const admitted = await this.perform(step, generation);
      if (admitted && generation === this.generation) {
        this.step = step === 0 ? 1 : null;
        progressed = true;
      }
    } catch (error: unknown) {
      if (generation !== this.generation) return;
      this.trace?.point('failed', { loadOutcome: 'failed' });
      this.options.failed(error);
      // Failure of one source must not suppress the other or create a retry loop.
      this.step = step === 0 ? 1 : null;
      progressed = true;
    } finally {
      this.running = false;
      this.finish(generation, progressed);
    }
  }
  private canAdvance(generation: number): boolean {
    return generation === this.generation && this.options.available();
  }
  private async perform(step: number, generation: number): Promise<boolean> {
    let admitted = true;
    const operation =
      step === 0
        ? async () => {
            admitted = await this.options.previews();
          }
        : this.options.groups;
    const work = async () => {
      if (generation !== this.generation) return;
      this.trace?.point('queue', {
        loadStageMs: Math.round(performance.now() - this.queuedAt),
      });
      if (this.trace)
        await this.trace.measure(step === 0 ? 'previews' : 'groups', operation);
      else await operation();
    };
    if (step === 0) await work();
    else admitted = await this.options.run(work);
    return admitted;
  }
  private finish(generation: number, progressed: boolean): void {
    if (generation !== this.generation) {
      this.resume();
      return;
    }
    if (this.step !== null) {
      if (progressed) {
        this.queuedAt = performance.now();
        this.resume();
      }
      return;
    }
    this.trace?.point('complete', { loadOutcome: 'complete' });
    this.trace = undefined;
    if (this.repeat) {
      this.repeat = false;
      this.request();
    } else this.options.settled();
  }
}
