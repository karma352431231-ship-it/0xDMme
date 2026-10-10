import type { Database } from '../database/index.ts';
import { CommunityRankingService } from '../community-ranking/index.ts';
import { ContentMaintenance } from '../content-maintenance/index.ts';
import { ObjectStore } from '../object-store/index.ts';
import {
  RepresentativeService,
  DnsDomainResolver,
} from '../representatives/index.ts';
import type { PoseModerationConfiguration } from '../public-moderation/index.ts';
import { publicBackgroundWorker } from './public-worker.ts';

export interface BackgroundWorker {
  start: () => void;
  close: () => Promise<void>;
}
export type BackgroundRole = 'ranking' | 'content' | 'public';
export function backgroundMode(
  environment: Readonly<Record<string, string | undefined>>,
): 'embedded' | 'isolated' {
  const value = environment['HASH_TALK_BACKGROUND_MODE'] ?? 'embedded';
  if (value !== 'embedded' && value !== 'isolated')
    throw new Error('Modo dos workers inválido.');
  return value;
}
export async function createBackgroundWorker(
  role: BackgroundRole,
  options: {
    db: Database;
    directory: string;
    origin: string;
    keepAlive?: boolean;
    moderation?: PoseModerationConfiguration | null;
  },
): Promise<BackgroundWorker> {
  const { db, directory, origin, keepAlive = false } = options;
  if (role === 'ranking')
    return new CommunityRankingService(db.communityRanking, db.workSignals, {
      keepAlive,
    });
  if (role === 'content') {
    const objects = new ObjectStore(directory);
    await objects.initialize();
    return new ContentMaintenance(
      db,
      objects,
      new RepresentativeService(
        db.representatives,
        new DnsDomainResolver(),
        origin,
      ),
      { keepAlive },
    );
  }
  return publicBackgroundWorker({
    db,
    directory,
    keepAlive,
    moderation: options.moderation ?? null,
  });
}
export async function embeddedBackground(
  options: Parameters<typeof createBackgroundWorker>[1],
): Promise<BackgroundWorker> {
  const workers: BackgroundWorker[] = [];
  for (const role of ['ranking', 'content', 'public'] as const)
    workers.push(await createBackgroundWorker(role, options));
  return {
    start: () => {
      for (const worker of workers) worker.start();
    },
    close: async () => {
      const results = await Promise.allSettled(
        workers.map((worker) => worker.close()),
      );
      if (results.some((result) => result.status === 'rejected'))
        throw new Error('Workers não encerraram.');
    },
  };
}
