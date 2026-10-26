import { readFile, stat } from 'node:fs/promises';
import { Database } from '../server/database/index.ts';
import { readWebConfiguration } from '../server/web-configuration/index.ts';
import { EngagementQueryError } from '../shared/engagement-metrics/index.ts';
import { createRuntimeContentCapacity } from '../server/storage-capacity/index.ts';

function maintenanceOptions(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const key = args[index]!;
    if (
      ![
        '--check',
        '--repair',
        '--health',
        '--correct',
        '--scope',
        '--entity',
      ].includes(key) ||
      values.has(key)
    )
      throw new EngagementQueryError(
        'Unknown or duplicate maintenance option.',
      );
    if (['--check', '--repair', '--health'].includes(key)) {
      values.set(key, 'true');
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith('--'))
      throw new EngagementQueryError('Missing maintenance option value.');
    values.set(key, value);
  }
  return {
    command: maintenanceCommand(values),
    scope: values.get('--scope'),
    entity: values.get('--entity'),
    file: values.get('--correct'),
  };
}

function maintenanceCommand(values: ReadonlyMap<string, string>): string {
  const commands = ['--check', '--repair', '--health', '--correct'].filter(
    (key) => values.has(key),
  );
  if (commands.length !== 1)
    throw new EngagementQueryError('Select one maintenance operation.');
  const command = commands[0]!;
  if (
    ['--health', '--correct'].includes(command) &&
    (values.has('--scope') || values.has('--entity'))
  )
    throw new EngagementQueryError(
      'Only gauge reconciliation accepts an entity scope.',
    );
  return command;
}

async function correctionFile(path: string): Promise<unknown> {
  const info = await stat(path);
  if (!info.isFile() || info.size > 8192)
    throw new EngagementQueryError(
      'Use a correction JSON file of at most 8192 bytes.',
    );
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    throw new EngagementQueryError('The correction file is not valid JSON.');
  }
}

let database: Database | undefined;
try {
  const options = maintenanceOptions(process.argv.slice(2));
  const config = readWebConfiguration(process.env);
  database = new Database(
    config.databaseUrl,
    await createRuntimeContentCapacity(config.contentCapacity),
  );
  await database.verifyMigrations();
  const metrics = database.engagementMetrics;
  const output =
    options.command === '--health'
      ? await metrics.health()
      : options.command === '--correct'
        ? await metrics.correct(await correctionFile(options.file!))
        : await metrics.reconcile({
            ...(options.scope ? { scope: options.scope } : {}),
            ...(options.entity ? { entity: options.entity } : {}),
            repair: options.command === '--repair',
          });
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
} catch (error) {
  process.stderr.write(
    error instanceof EngagementQueryError
      ? `Invalid operation: ${error.message}\n`
      : 'Engagement maintenance failed. Check the schema, service and local operation file.\n',
  );
  process.exitCode = 1;
} finally {
  await database?.close();
}
