import type { StatusStore } from '../database/index.ts';
/** Bounded durable fanout, resumed immediately between bursts and after a restart. */
export class StatusSignals {
  private readonly store: StatusStore;
  private running: Promise<void> | null = null;
  private scheduled: ReturnType<typeof setImmediate> | null = null;
  private stopped = false;
  constructor(store: StatusStore) {
    this.store = store;
  }
  request(): void {
    if (this.stopped || this.running || this.scheduled) return;
    this.running = this.drain()
      .catch(() => {
        process.stderr.write('Avisos de status indisponíveis.\n');
      })
      .finally(() => {
        this.running = null;
      });
  }
  private async drain(): Promise<void> {
    for (let batch = 0; batch < 16; batch++) {
      if (this.stopped || !(await this.store.notifyBatch())) return;
    }
    if (this.stopped) return;
    this.scheduled = setImmediate(() => {
      this.scheduled = null;
      this.request();
    });
    this.scheduled.unref();
  }
  async close(): Promise<void> {
    this.stopped = true;
    if (this.scheduled) clearImmediate(this.scheduled);
    this.scheduled = null;
    await this.running;
  }
}
