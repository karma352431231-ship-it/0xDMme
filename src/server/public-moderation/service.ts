import type {
  CommunityStore,
  PublicProfileStore,
  WorkSignals,
} from '../database/index.ts';
import { WorkConsumers } from '../work-scheduler/index.ts';

/** Own the global moderation lifecycle; byte owners collect only their own targets. */
export class PublicModerationService {
  private readonly stop = new AbortController();
  private readonly consumers: WorkConsumers;
  private cleaning: Promise<void> | null = null;
  private readonly stores: ModerationCollectors;
  constructor(
    stores: ModerationCollectors,
    options: {
      signals?: Pick<WorkSignals, 'subscribe'>;
      fallbackMs?: number;
    } = {},
  ) {
    this.stores = stores;
    this.consumers = new WorkConsumers(
      [
        {
          topic: 'public-moderation',
          work: async () => {
            await stores.profiles.collectModeration(this.stop.signal);
          },
          next: () =>
            stores.profiles.nextModerationCollection?.() ??
            Promise.resolve(null),
        },
        {
          topic: 'public-moderation',
          work: async () => {
            await stores.communities.collectModeration(this.stop.signal);
          },
          next: () =>
            stores.communities.nextModerationCollection?.() ??
            Promise.resolve(null),
        },
      ],
      options.signals ?? { subscribe: () => () => {} },
      options,
    );
  }
  async initialize(): Promise<void> {
    await this.clean();
  }
  start(): void {
    if (this.stop.signal.aborted)
      throw new Error('Serviço de moderação pública encerrado.');
    this.consumers.start();
  }
  async close(): Promise<void> {
    this.stop.abort();
    await this.consumers.close();
    if (this.cleaning) await this.cleaning;
  }
  async clean(): Promise<void> {
    if (this.stop.signal.aborted) return;
    if (this.cleaning) return this.cleaning;
    this.cleaning = this.collect();
    try {
      await this.cleaning;
    } finally {
      this.cleaning = null;
    }
  }
  private async collect(): Promise<void> {
    let remaining = true;
    while (remaining && !this.stop.signal.aborted) {
      const avatars = await this.stores.profiles.collectModeration(
        this.stop.signal,
      );
      if (this.stop.signal.aborted) return;
      const photos = await this.stores.communities.collectModeration(
        this.stop.signal,
      );
      remaining = avatars >= 32 || photos >= 32;
      if (remaining)
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
}

type ModerationCollectors = {
  profiles: Pick<PublicProfileStore, 'collectModeration'> &
    Partial<Pick<PublicProfileStore, 'nextModerationCollection'>>;
  communities: Pick<CommunityStore, 'collectModeration'> &
    Partial<Pick<CommunityStore, 'nextModerationCollection'>>;
};
