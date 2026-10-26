import { diagnosticReasons, reportObject } from './model.ts';

function numbers(value: unknown, keys: readonly string[]) {
  const object = reportObject(value);
  const clean: Record<string, number | null> = {};
  for (const key of keys) {
    const n = object[key];
    if (n !== null && (typeof n !== 'number' || !Number.isFinite(n) || n < 0))
      throw new Error('Invalid diagnostic measurement.');
    clean[key] = n;
  }
  return clean;
}
function time(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new Error('Invalid diagnostic time.');
  return new Date(value).toISOString();
}
function resources(value: unknown) {
  if (value === null) return null;
  const object = reportObject(value);
  return {
    ...numbers(value, [
      'uptimeSeconds',
      'cpuUserSeconds',
      'cpuSystemSeconds',
      'rssBytes',
      'heapUsedBytes',
      'heapLimitBytes',
      'availableMemoryBytes',
      'memoryCeilingBytes',
    ]),
    measuredAt: time(object['measuredAt']),
    storage:
      object['storage'] === null
        ? null
        : numbers(object['storage'], ['availableBytes', 'totalBytes']),
  };
}
function database(value: unknown) {
  if (value === null) return null;
  const object = reportObject(value);
  if (typeof object['queryAvailable'] !== 'boolean')
    throw new Error('Invalid database measurement.');
  return {
    ...numbers(value, [
      'poolConnections',
      'poolIdle',
      'poolWaiting',
      'activeTransactions',
      'lockWaiters',
      'oldestTransactionSeconds',
    ]),
    queryAvailable: object['queryAvailable'],
  };
}
/** Whitelist when writing and reading; unknown strings can never enter history/output. */
export function diagnosticRecord(value: unknown) {
  const event = reportObject(value);
  const reason = diagnosticReasons.find((known) => known === event['reason']);
  if (!reason) throw new Error('Invalid diagnostic reason.');
  const metric = reportObject(event['metrics']);
  const area = ['health', 'account', 'public', 'asset'].find(
    (known) => known === event['area'],
  );
  return {
    reason,
    observedAt: time(event['observedAt']),
    collectedAt: time(event['collectedAt']),
    ...(area ? { area } : {}),
    ...optionalTiming(event),
    metrics: {
      traffic: numbers(metric['traffic'], [
        'started',
        'completed',
        'errors',
        'slow',
        'aborted',
        'activeRequests',
        'activeConnections',
      ]),
      resources: resources(metric['resources']),
      database: database(metric['database']),
    },
  };
}
function optionalTiming(event: Record<string, unknown>) {
  const fields: Record<string, number> = {};
  for (const key of ['elapsedMs', 'deadlineDelayMs']) {
    const n = event[key];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) fields[key] = n;
  }
  return fields;
}
