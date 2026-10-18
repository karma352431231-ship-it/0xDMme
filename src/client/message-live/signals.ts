import type { LiveEvent, LiveSnapshot } from './protocol.ts';

export type LiveSignal =
  | { kind: 'hello'; peer: string; retry: boolean }
  | { kind: 'owner'; owner: string }
  | {
      kind: 'state';
      owner: string;
      sequence: number;
      sentAt: number;
      snapshot: LiveSnapshot;
      peer?: string;
      event?: LiveEvent;
    };
const identifier =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
function id(value: unknown): value is string {
  return typeof value === 'string' && identifier.test(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function snapshot(value: unknown): value is LiveSnapshot {
  if (!record(value) || !keys(value, ['phase', 'activity'])) return false;
  return (
    typeof value['phase'] === 'string' &&
    [
      'paused',
      'connecting',
      'connected',
      'unavailable',
      'authorization',
    ].includes(value['phase']) &&
    (value['activity'] === null ||
      (typeof value['activity'] === 'number' &&
        Number.isFinite(value['activity'])))
  );
}
function stateMetadata(value: Record<string, unknown>): boolean {
  return (
    id(value['owner']) &&
    typeof value['sequence'] === 'number' &&
    Number.isSafeInteger(value['sequence']) &&
    value['sequence'] > 0 &&
    typeof value['sentAt'] === 'number' &&
    Number.isFinite(value['sentAt'])
  );
}
function stateRoute(value: Record<string, unknown>): boolean {
  if (value['peer'] !== undefined && !id(value['peer'])) return false;
  if (value['event'] === undefined) return true;
  return (
    value['peer'] === undefined &&
    typeof value['event'] === 'string' &&
    [
      'ready',
      'changed',
      'call',
      'removed',
      'authorization',
      'invalidated',
      'revoked',
      'ended',
    ].includes(value['event'])
  );
}
function state(value: Record<string, unknown>): boolean {
  return (
    keys(value, [
      'kind',
      'owner',
      'sequence',
      'sentAt',
      'snapshot',
      'peer',
      'event',
    ]) &&
    stateMetadata(value) &&
    stateRoute(value) &&
    snapshot(value['snapshot'])
  );
}
function hello(value: Record<string, unknown>): boolean {
  return (
    keys(value, ['kind', 'peer', 'retry']) &&
    id(value['peer']) &&
    typeof value['retry'] === 'boolean'
  );
}
/** Hints contain no payloads. Reject extra fields instead of relaying arbitrary same-origin data. */
export function liveSignal(value: unknown): LiveSignal | null {
  if (!record(value)) return null;
  switch (value['kind']) {
    case 'hello':
      return hello(value) ? (value as LiveSignal) : null;
    case 'owner':
      return keys(value, ['kind', 'owner']) && id(value['owner'])
        ? (value as LiveSignal)
        : null;
    case 'state':
      return state(value) ? (value as LiveSignal) : null;
    default:
      return null;
  }
}
