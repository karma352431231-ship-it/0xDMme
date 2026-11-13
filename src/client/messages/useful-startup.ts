import { startLoad } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import { SynchronizationTask } from '../synchronization-work/index.ts';

type Step = () => Promise<void>;
interface StartupOperations {
  available: () => boolean;
  /** Group operations reserve the existing exclusive foreground owner. */
  run: (step: Step) => Promise<boolean>;
  previews: () => Promise<boolean>;
  groups: Step;
  /** One bounded group-preview turn. True means another turn is needed. */
  groupPreviews?: (() => Promise<boolean>) | undefined;
  settled: () => void;
  failed: (error: unknown) => void;
}
type SourceState = 'pending' | 'running' | 'complete' | 'failed' | 'cancelled';

/** Independent directory sources. Eligibility may overlap, while authority
 * acquisition and SDK execution stay exclusive in their existing owners. */
export class UsefulStartup {
  private readonly options: StartupOperations;
  private generation = 0;
  private direct: SourceState = 'cancelled';
  private group: SourceState = 'cancelled';
  private groupDirectory = true;
  private directActive = false;
  private groupActive = false;
  private repeat = false;
  private trace: LoadTrace | undefined;
  private initial = true;
  private readonly continuation = new SynchronizationTask(() => this.resume());
  constructor(options: StartupOperations) {
    this.options = options;
  }
  get pending(): boolean {
    return this.waiting(this.direct) || this.waiting(this.group);
  }
  private waiting(state: SourceState): boolean {
    return state === 'pending' || state === 'running';
  }
  request(): void {
    if (this.pending) {
      this.repeat ||= this.directActive || this.groupActive;
      return;
    }
    this.direct = this.group = 'pending';
    this.groupDirectory = true;
    this.trace = startLoad('useful-directory');
    this.trace?.point('entry', { loadInitial: this.initial });
    this.initial = false;
    this.resume();
  }
  reset(): void {
    this.generation++;
    this.direct = this.group = 'cancelled';
    this.repeat = false;
    this.initial = true;
    this.continuation.clear();
    this.trace?.point('cancelled', { loadOutcome: 'cancelled' });
    this.trace = undefined;
  }
  resume(): void {
    if (!this.pending || !this.options.available()) return;
    const generation = this.generation;
    // Admit both sources before awaiting either one. Their operations keep
    // their own permission and exclusive-resource gates.
    if (!this.directActive && this.direct === 'pending') {
      this.directActive = true;
      this.direct = 'running';
      void this.readDirect(generation);
    }
    if (!this.groupActive && this.group === 'pending') {
      this.groupActive = true;
      this.group = 'running';
      void this.readGroups(generation);
    }
  }
  private async readDirect(generation: number): Promise<void> {
    try {
      await Promise.resolve();
      if (generation !== this.generation) return;
      const admitted = await this.measure('previews', this.options.previews);
      if (generation === this.generation)
        this.direct = admitted ? 'complete' : 'pending';
    } catch (error: unknown) {
      if (generation === this.generation) {
        this.direct = 'failed';
        this.options.failed(error);
      }
    } finally {
      this.directActive = false;
      this.finish(generation);
    }
  }
  private async readGroups(generation: number): Promise<void> {
    let progressed = false;
    try {
      await Promise.resolve();
      if (generation !== this.generation) return;
      let more = false;
      const directory = this.groupDirectory;
      const admitted = await this.options.run(async () => {
        if (generation !== this.generation) return;
        await this.measure(directory ? 'groups' : 'previews', async () => {
          if (directory) await this.options.groups();
          else more = (await this.options.groupPreviews?.()) ?? false;
        });
      });
      if (generation !== this.generation) return;
      progressed = admitted;
      this.advanceGroup({ directory, admitted, more });
    } catch (error: unknown) {
      if (generation === this.generation) {
        this.group = 'failed';
        this.options.failed(error);
      }
    } finally {
      this.groupActive = false;
      if (progressed && this.group === 'pending') this.continuation.schedule();
      this.finish(generation);
    }
  }
  private advanceGroup(input: {
    directory: boolean;
    admitted: boolean;
    more: boolean;
  }): void {
    if (!input.admitted) {
      this.group = 'pending';
      return;
    }
    this.groupDirectory = false;
    this.group =
      input.more || (input.directory && !!this.options.groupPreviews)
        ? 'pending'
        : 'complete';
  }
  private measure<T>(stage: 'previews' | 'groups', work: () => Promise<T>) {
    return this.trace ? this.trace.measure(stage, work) : work();
  }
  private finish(generation: number): void {
    if (generation !== this.generation) {
      this.resume();
      return;
    }
    if (this.pending) return;
    const outcome =
      this.direct === 'failed' || this.group === 'failed'
        ? 'failed'
        : 'complete';
    this.trace?.point(outcome, { loadOutcome: outcome });
    this.trace = undefined;
    if (this.repeat) {
      this.repeat = false;
      this.request();
    } else this.options.settled();
  }
}
