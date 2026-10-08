import type { Database } from '../database/index.ts';
import { CommunityRankingService } from '../community-ranking/index.ts';
import { ContentMaintenance } from '../content-maintenance/index.ts';
import { PublicMaintenance } from '../public-maintenance/index.ts';
import { ObjectStore } from '../object-store/index.ts';
import {
  RepresentativeService,
  DnsDomainResolver,
} from '../representatives/index.ts';
import {
  PublicModerationWorker,
  publicModerationBinding,
  publicModerationRetargeting,
} from '../public-moderation/index.ts';

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
  const collectors = new PublicMaintenance(db, directory, { keepAlive });
  const policy = publicModerationRetargeting(db);
  const moderation = new PublicModerationWorker({
    queue: db.publicModeration,
    bind: publicModerationBinding(db),
    runner: null,
    upgradePolicy: () => db.publicModeration.upgrade(policy),
    signals: db.workSignals,
    keepAlive,
  });
  return {
    start: () => {
      collectors.start();
      moderation.start();
    },
    close: async () => {
      const results = await Promise.allSettled([
        collectors.close(),
        moderation.close(),
      ]);
      if (results.some((result) => result.status === 'rejected'))
        throw new Error('Coleta pública não encerrou.');
    },
  };
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
