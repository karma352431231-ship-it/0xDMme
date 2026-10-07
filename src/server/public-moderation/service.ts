import type { CommunityStore, PublicProfileStore } from '../database/index.ts';

/** Own the global moderation lifecycle; byte owners collect only their own targets. */
export class PublicModerationService {
  private readonly stop = new AbortController();
  private timer: ReturnType<typeof setInterval> | null = null;
  private cleaning: Promise<void> | null = null;
  private readonly stores: ModerationCollectors;
  constructor(stores: ModerationCollectors) {
    this.stores = stores;
  }
  async initialize(): Promise<void> {
    await this.clean();
  }
  start(): void {
    if (this.stop.signal.aborted)
      throw new Error('Serviço de moderação pública encerrado.');
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.clean().catch(() => {
        process.stderr.write('Descarte de mídia pública indisponível.\n');
      });
    }, 30_000);
    this.timer.unref();
  }
  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stop.abort();
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
      remaining = avatars === 32 || photos === 32;
      if (remaining)
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
}

type ModerationCollectors = {
  profiles: Pick<PublicProfileStore, 'collectModeration'>;
  communities: Pick<CommunityStore, 'collectModeration'>;
};
