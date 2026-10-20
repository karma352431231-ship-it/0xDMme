export { RankingLive } from './live.ts';
import type { CommunityRankingStore, WorkSignals } from '../database/index.ts';
import { WorkScheduler } from '../work-scheduler/index.ts';

export class CommunityRankingService {
  private readonly scheduler: WorkScheduler;
  private readonly unsubscribe: () => void;
  constructor(
    store: CommunityRankingStore,
    signals: WorkSignals,
    options: { fallbackMs?: number; keepAlive?: boolean } = {},
  ) {
    this.scheduler = new WorkScheduler({
      coalesceMs: 1000,
      ...options,
      work: () => store.process(),
      failed: () => {
        process.stderr.write('Rankings unavailable; update pending.\n');
      },
    });
    this.unsubscribe = signals.subscribe('ranking', () =>
      this.scheduler.wake(),
    );
  }
  start(): void {
    this.scheduler.start();
  }
  async flush(): Promise<void> {
    await this.scheduler.flush();
  }
  async close(): Promise<void> {
    this.unsubscribe();
    await this.scheduler.close();
  }
}
