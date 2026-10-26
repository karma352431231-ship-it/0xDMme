import { diagnosticFile, readPrivate } from './storage.ts';
import { diagnosticRecord } from './record.ts';
import { reportObject } from './model.ts';

/** No public endpoint. Detailed aggregate evidence is read only by the operator. */
export async function readDiagnostics(directory: string) {
  const events = await readPrivate(diagnosticFile(directory, 'events'));
  const lifecycle = await readPrivate(diagnosticFile(directory, 'lifecycle'));
  const fatal = await readPrivate(diagnosticFile(directory, 'fatal'));
  const exit = await readPrivate(diagnosticFile(directory, 'service-exit'));
  if (!events && !lifecycle && !fatal && !exit)
    throw new Error('Incident history unavailable.');
  return {
    version: 1,
    events: historyEvents(events),
    lifecycleRecordedAt: date(lifecycle?.['recordedAt']),
    fatal: fatalSummary(fatal),
    serviceExit: exitSummary(exit),
    coverage:
      'Application HTTP and process/database/storage evidence at incident time.',
    limitations:
      'No host network/proxy/TURN coverage, browser timing, or automatic cause attribution.',
  };
}

function date(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}
function fatalSummary(value: unknown) {
  if (value === null) return null;
  const object = reportObject(value);
  const reason = ['unhandled-rejection', 'uncaught-exception'].find(
    (known) => known === object['reason'],
  );
  return {
    recordedAt: date(object['recordedAt']),
    reason: reason ?? 'unknown',
  };
}
function exitSummary(value: unknown) {
  if (value === null) return null;
  const object = reportObject(value);
  const result = [
    'success',
    'protocol',
    'timeout',
    'exit-code',
    'signal',
    'core-dump',
    'watchdog',
    'exec-condition',
    'oom-kill',
    'start-limit-hit',
    'resources',
  ].find((known) => known === object['result']);
  const exitStatus = object['exitStatus'];
  return {
    recordedAt: date(object['recordedAt']),
    result: result ?? 'unknown',
    exitStatus:
      typeof exitStatus === 'number' &&
      Number.isInteger(exitStatus) &&
      exitStatus >= 0 &&
      exitStatus <= 255
        ? exitStatus
        : null,
  };
}

function historyEvents(value: Record<string, unknown> | null) {
  if (!value) return [];
  if (
    value['version'] !== 1 ||
    !Array.isArray(value['events']) ||
    value['events'].length > 32
  )
    throw new Error('Invalid incident history.');
  return value['events'].map((event: unknown) => diagnosticRecord(event));
}
