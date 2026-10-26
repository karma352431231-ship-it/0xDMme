import { Database } from '../server/database/index.ts';
import { readWebConfiguration } from '../server/web-configuration/index.ts';
import {
  engagementCsv,
  engagementTable,
} from '../server/engagement-metrics/index.ts';
import { EngagementQueryError } from '../shared/engagement-metrics/index.ts';

const names: Readonly<Record<string, string>> = {
  '--metrics': 'metrics',
  '--from': 'from',
  '--to': 'to',
  '--preset': 'preset',
  '--timezone': 'timezone',
  '--communities': 'communityIds',
  '--posts': 'postIds',
  '--group-by': 'groupBy',
  '--bucket': 'bucket',
  '--eligibility': 'eligibility',
  '--limit': 'limit',
  '--cursor': 'cursor',
  '--page-categories': 'pageCategories',
  '--removal-cause': 'removalCause',
};
function readOptions(args: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const allowed = new Set([
    ...Object.keys(names),
    '--all',
    '--format',
    '--order-by',
    '--community-report',
    '--snapshots',
    '--before',
  ]);
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]!;
    if (!allowed.has(flag) || result.has(flag))
      throw new EngagementQueryError(`Unknown or duplicate option: ${flag}`);
    if (flag === '--all' || flag === '--snapshots') {
      result.set(flag, 'true');
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith('--'))
      throw new EngagementQueryError(`Missing value for ${flag}`);
    result.set(flag, value);
  }
  return result;
}
function order(value: string) {
  const [by, direction = 'desc', extra] = value.split(':');
  if (extra !== undefined)
    throw new EngagementQueryError('Invalid ordering option.');
  return { by, direction };
}
function communityReport(name: string | undefined): Record<string, unknown> {
  if (name === undefined) return {};
  const metric = new Map([
    ['viewed', 'post_views_estimated'],
    ['participation', 'public_contributors_distinct'],
    ['published', 'posts_published'],
  ]).get(name);
  if (!metric)
    throw new EngagementQueryError(
      'Community report must be viewed, participation or published.',
    );
  return {
    metrics: [metric],
    groupBy: 'community',
    eligibility: 'promotable',
    orderBy: { by: metric, direction: 'desc' },
    limit: 5,
    preset: 'last7d',
  };
}
function argumentsForReport(args: string[]) {
  const options = readOptions(args);
  const query = communityReport(options.get('--community-report'));
  for (const [flag, value] of options) {
    if (flag === '--order-by') {
      query['orderBy'] = order(value);
      continue;
    }
    const key = names[flag];
    if (key) query[key] = optionValue(key, value);
  }
  const format = options.get('--format') ?? 'table';
  validateOutputOptions(options, format);
  if (!query['preset'] && !query['from'] && !query['to'])
    query['preset'] = 'last24h';
  return {
    query,
    format,
    all: options.has('--all'),
    snapshots: options.has('--snapshots'),
    before: options.get('--before'),
    snapshotCursor: options.get('--cursor'),
    snapshotLimit: options.has('--limit')
      ? Number(options.get('--limit'))
      : undefined,
  };
}
function validateOutputOptions(
  options: ReadonlyMap<string, string>,
  format: string,
): void {
  if (options.has('--before') && !options.has('--snapshots'))
    throw new EngagementQueryError('--before requires --snapshots.');
  if (
    options.has('--snapshots') &&
    [...options.keys()].some(
      (key) =>
        ![
          '--snapshots',
          '--before',
          '--format',
          '--cursor',
          '--limit',
        ].includes(key),
    )
  )
    throw new EngagementQueryError(
      'Snapshot history accepts --before, --cursor, --limit and --format.',
    );
  if (!['table', 'csv', 'json'].includes(format))
    throw new EngagementQueryError('Choose table, csv or json output.');
}
function optionValue(key: string, value: string): unknown {
  if (['metrics', 'communityIds', 'postIds', 'pageCategories'].includes(key))
    return value.split(',');
  return key === 'limit' ? Number(value) : value;
}

let database: Database | undefined;
try {
  const {
    query,
    format,
    all,
    snapshots,
    before,
    snapshotCursor,
    snapshotLimit,
  } = argumentsForReport(process.argv.slice(2));
  const config = readWebConfiguration(process.env);
  database = new Database(config.databaseUrl);
  await database.verifyMigrations();
  if (snapshots) {
    if (format !== 'json')
      throw new EngagementQueryError(
        'Snapshot history currently requires --format json.',
      );
    const page = await database.engagementMetrics.snapshotsPage({
      ...(before ? { before } : {}),
      ...(snapshotCursor ? { cursor: snapshotCursor } : {}),
      ...(snapshotLimit === undefined ? {} : { limit: snapshotLimit }),
    });
    process.stdout.write(
      JSON.stringify(
        {
          ...page,
          limit: snapshotLimit ?? 1000,
          caveat:
            'Rows are rolling-window aggregates, not additive daily uniques. Resume next to read every row at crowded cutoffs. Corrections append revisions; pages retain their original correction cutoff.',
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    const report = await database.engagementMetrics.report(query, { all });
    const output =
      format === 'json'
        ? JSON.stringify(report, null, 2) + '\n'
        : format === 'csv'
          ? engagementCsv(report)
          : engagementTable(report);
    process.stdout.write(output);
  }
} catch (error) {
  // Errors are operator-visible but never print driver details or connection data.
  process.stderr.write(
    error instanceof EngagementQueryError
      ? `Invalid report: ${error.message}\n`
      : 'Engagement report failed. Check the query, schema and local service availability.\n',
  );
  process.exitCode = 1;
} finally {
  await database?.close();
}
