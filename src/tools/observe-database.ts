import { mkdir, rename, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Database } from '../server/database/index.ts';
import { readWebConfiguration } from '../server/web-configuration/index.ts';

let database: Database | undefined;
const directory = new URL('../../.local/metrics/', import.meta.url);
const pending = new URL(`pending-${randomUUID()}.json`, directory);
try {
  const config = readWebConfiguration(process.env);
  database = new Database(config.databaseUrl);
  const metrics = await database.maintenanceSnapshot();
  const snapshot = JSON.stringify({
    recordedAt: new Date().toISOString(),
    ...metrics,
  });
  if (Buffer.byteLength(snapshot) > 16_384)
    throw new Error('Métricas excedidas.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(pending, snapshot, { flag: 'wx', mode: 0o600 });
  await rename(pending, new URL('database.json', directory));
  process.stdout.write(
    'Métricas agregadas gravadas somente em .local/metrics/database.json.\n',
  );
} catch {
  process.stderr.write('Não foi possível obter métricas do banco local.\n');
  process.exitCode = 1;
} finally {
  await database?.close();
  await unlink(pending).catch((error: unknown) => {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
  });
}
