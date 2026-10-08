import type { Database } from '../database/index.ts';
import { WorkConsumers } from '../work-scheduler/index.ts';
import { CommunityMediaCollector } from '../community-media/index.ts';

export class PublicMaintenance {
  private readonly stop = new AbortController();
  private readonly consumers: WorkConsumers;
  constructor(
    db: Database,
    directory: string,
    options: { fallbackMs?: number; keepAlive?: boolean } = {},
  ) {
    const media = new CommunityMediaCollector(db.communityMedia, directory);
    this.consumers = new WorkConsumers(
      [
        {
          topic: 'public-media',
          work: () => media.collect(),
          next: () => db.communityMedia.nextCollection(),
        },
        {
          topic: 'public-moderation',
          work: async () => {
            await db.publicProfiles.collectModeration(this.stop.signal);
          },
          next: () => db.publicModeration.nextCollection('avatar'),
        },
        {
          topic: 'public-moderation',
          work: async () => {
            await db.communities.collectModeration(this.stop.signal);
          },
          next: () => db.publicModeration.nextCollection('community-photo'),
        },
        {
          topic: 'post-views',
          work: async () => {
            await db.communityViews.collect();
          },
          next: () => db.communityViews.nextCollection(),
        },
      ],
      db.workSignals,
      options,
    );
  }
  start(): void {
    this.consumers.start();
  }
  async close(): Promise<void> {
    this.stop.abort();
    await this.consumers.close();
  }
}
