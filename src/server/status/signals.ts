import type { StatusStore } from '../database/index.ts';
import { WorkScheduler } from '../work-scheduler/index.ts';
/** Bounded durable fanout, resumed immediately between bursts and after a restart. */
export class StatusSignals {
  private readonly store: StatusStore;
  private readonly scheduler: WorkScheduler;
  private stopped = false;
  constructor(store: StatusStore) {
    this.store = store;
    this.scheduler = new WorkScheduler({
      fallbackMs: 0,
      work: () => this.drain(),
      failed: () => {
        process.stderr.write('Avisos de status indisponíveis.\n');
      },
    });
  }
  request(): void {
    this.scheduler.wake();
  }
  private async drain(): Promise<number | null> {
    for (let batch = 0; batch < 16; batch++) {
      if (this.stopped || !(await this.store.notifyBatch())) return null;
    }
    return this.stopped ? null : Date.now();
  }
  async close(): Promise<void> {
    this.stopped = true;
    await this.scheduler.close();
  }
}
