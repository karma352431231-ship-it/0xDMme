import { Database } from './database/index.ts';
import { readWebConfiguration } from './web-configuration/index.ts';
import { createBackgroundWorker } from './background/index.ts';
import type { BackgroundWorker, BackgroundRole } from './background/index.ts';

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
    throw new Error('Worker inválido.');
  const config = readWebConfiguration(process.env);
  database = new Database(
    config.databaseUrl,
    config.accountCapacityBytes,
    [],
    'worker',
  );
  await database.verifyMigrations();
  worker = await createBackgroundWorker(role as BackgroundRole, {
    db: database,
    directory: config.objectDirectory,
    origin: config.origin,
    keepAlive: true,
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
  process.stdout.write(`0xDMme: worker ${role} iniciado.\n`);
} catch {
  await shutdown().catch(() => {});
  process.stderr.write(
    'Worker não iniciado; confira esquema e configuração próprios.\n',
  );
  process.exitCode = 1;
}
