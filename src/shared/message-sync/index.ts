import { AccountError, keys, object, uuid } from '../account/index.ts';
import { fingerprint } from '../devices/index.ts';
import { integer } from '../vault/index.ts';

export type MessageSyncRecovery =
  | 'initial'
  | 'authority'
  | 'expired'
  | 'gap'
  | 'legacy'
  | 'reset'
  | 'invalidation';
export interface MessageSyncSnapshot {
  version: 2;
  account: string;
  device: string;
  revision: number;
  anchor: number;
  invalidation: number;
  directory: string;
  contacts: number;
  source: 'full' | 'journal' | 'tail';
  recovery?: MessageSyncRecovery | null;
}
export const messageSyncConflict =
  'Message deletion or authorization changed. Reconcile the affected history.';
export const messageChangeRetention = 256;
export const messageChangePageIds = 256;
export function syncSnapshot(input: unknown): MessageSyncSnapshot {
  const d = object(input);
  keys(d, [
    'version',
    'account',
    'device',
    'revision',
    'anchor',
    'invalidation',
    'directory',
    'contacts',
    'source',
    ...(Object.hasOwn(d, 'recovery') ? ['recovery'] : []),
  ]);
  const recovery = recoveryReason(d['recovery']);
  if (
    d['version'] !== 2 ||
    !['full', 'journal', 'tail'].includes(String(d['source']))
  )
    throw new AccountError(400, 'Invalid message synchronization checkpoint.');
  const revision = integer(d['revision'], Number.MAX_SAFE_INTEGER),
    invalidation = integer(d['invalidation'], Number.MAX_SAFE_INTEGER);
  if (invalidation > revision)
    throw new AccountError(400, 'Invalid message invalidation boundary.');
  return {
    version: 2,
    account: uuid(d['account']),
    device: uuid(d['device']),
    revision,
    invalidation,
    anchor: integer(d['anchor'], Number.MAX_SAFE_INTEGER),
    directory: fingerprint(d['directory']),
    contacts: integer(d['contacts'], Number.MAX_SAFE_INTEGER),
    source: d['source'] as MessageSyncSnapshot['source'],
    ...(recovery === undefined ? {} : { recovery }),
  };
}
export function isSyncSnapshot(value: unknown): value is MessageSyncSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === 2
  );
}
export function sameSyncAuthority(
  a: MessageSyncSnapshot,
  b: MessageSyncSnapshot,
): boolean {
  return (
    a.account === b.account &&
    a.device === b.device &&
    a.directory === b.directory &&
    a.contacts === b.contacts
  );
}
export function sameSyncFence(
  a: MessageSyncSnapshot,
  b: MessageSyncSnapshot,
): boolean {
  return sameSyncAuthority(a, b) && a.invalidation === b.invalidation;
}

export function messageReadThrough(snapshot: unknown): number {
  return isSyncSnapshot(snapshot) ? snapshot.anchor : Number.MAX_SAFE_INTEGER;
}
export function supportsMessageDelta(snapshot: unknown): boolean {
  return !isSyncSnapshot(snapshot) || snapshot.source === 'journal';
}

function recoveryReason(
  value: unknown,
): MessageSyncRecovery | null | undefined {
  if (value === undefined || value === null) return value;
  if (
    typeof value !== 'string' ||
    ![
      'initial',
      'authority',
      'expired',
      'gap',
      'legacy',
      'reset',
      'invalidation',
    ].includes(value)
  )
    throw new AccountError(400, 'Invalid message recovery reason.');
  return value as MessageSyncRecovery;
}
