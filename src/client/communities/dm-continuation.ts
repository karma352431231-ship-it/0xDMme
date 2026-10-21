import { SynchronizationTask } from '../synchronization-work/index.ts';
/** One posted task per owner, yielding to input without per-page timer clamping.
 * A batch reuses two ports; completion, view changes and session cleanup close them. */
export class DmContinuations {
  private readonly task = new SynchronizationTask(() => this.dispatch());
  private pending = false;
  private readonly ports: { available: () => boolean; run: () => void };
  constructor(ports: { available: () => boolean; run: () => void }) {
    this.ports = ports;
  }
  request(): void {
    this.pending = true;
    this.resume();
  }
  resume(): void {
    if (this.task.pending || !this.pending || !this.ports.available()) return;
    this.task.schedule();
  }
  private dispatch(): void {
    if (!this.pending || !this.ports.available()) return;
    this.pending = false;
    this.ports.run();
  }
  clear(): void {
    this.task.clear();
    this.pending = false;
  }
}
