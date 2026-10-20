import { createRuntimeContentCapacity } from './storage-capacity/index.ts';
import { automaticPublicModeration } from '../shared/public-moderation/index.ts';
import { Database } from './database/index.ts';
import { readWebConfiguration } from './web-configuration/index.ts';
import { createBackgroundWorker } from './background/index.ts';
import type { BackgroundWorker, BackgroundRole } from './background/index.ts';
import { readPoseModerationConfiguration } from './public-moderation/index.ts';

let database: Database | undefined;
let worker: BackgroundWorker | undefined;
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => process.exit(1), 8000);
  timeout.unref();
  try {
    await worker?.close();
  } finally {
    await database?.close();
    clearTimeout(timeout);
  }
}
try {
  const role = process.argv[2];
  if (!['ranking', 'content', 'public'].includes(role ?? ''))
    throw new Error('Invalid worker.');
  const config = readWebConfiguration(process.env);
  const moderation = await readPoseModerationConfiguration(process.env);
  database = new Database(
    config.databaseUrl,
    await createRuntimeContentCapacity(config.contentCapacity),
    moderation?.acceptedModels ?? [],
    'worker',
  );
  if (!automaticPublicModeration)
    database.publicModeration.pauseAutomaticModeration();
  await database.verifyMigrations();
  worker = await createBackgroundWorker(role as BackgroundRole, {
    db: database,
    directory: config.objectDirectory,
    origin: config.origin,
    keepAlive: true,
    moderation,
  });
  database.workSignals.holdWorker(role as BackgroundRole, () => {
    process.exitCode = 1;
    void shutdown().catch(() => {
      process.exitCode = 1;
    });
  });
  await database.workSignals.start();
  worker.start();
  const stop = () => {
    void shutdown().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.stdout.write(`0xDMme: worker ${role} started.\n`);
} catch {
  await shutdown().catch(() => {});
  process.stderr.write(
    'Worker did not start; check its schema and configuration.\n',
  );
  process.exitCode = 1;
}
