import type { Database } from '../database/index.ts';
import { PublicMaintenance } from '../public-maintenance/index.ts';
import {
  configuredPoseRunner,
  PublicModerationWorker,
  publicModerationBinding,
  publicModerationRetargeting,
} from '../public-moderation/index.ts';
import type { PoseModerationConfiguration } from '../public-moderation/index.ts';

export async function publicBackgroundWorker(options: {
  db: Database;
  directory: string;
  keepAlive: boolean;
  moderation: PoseModerationConfiguration | null;
}) {
  const { db, directory, keepAlive } = options;
  const runner = await configuredPoseRunner({
    db,
    directory,
    configuration: options.moderation,
  });
  const collectors = new PublicMaintenance(db, directory, { keepAlive });
  const policy = publicModerationRetargeting(db);
  const moderation = new PublicModerationWorker({
    queue: db.publicModeration,
    bind: publicModerationBinding(db),
    runner: runner?.scanner ?? null,
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
      await runner?.close();
      if (results.some((result) => result.status === 'rejected'))
        throw new Error('Serviço público não encerrou.');
    },
  };
}
