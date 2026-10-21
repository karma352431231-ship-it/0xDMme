import { object, uuid } from '../../shared/account/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { syncSnapshot } from '../../shared/message-sync/index.ts';
import type { MessageSyncSnapshot } from '../../shared/message-sync/index.ts';
import {
  localGet,
  localPut,
  openLocal,
  sealLocal,
} from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';

export interface PendingConversation {
  peer: string;
  after: number;
  through: number;
  required: number;
  reason: 'key' | 'verification' | 'consent';
  retryAt: number;
}
export interface SyncProgress {
  version: 2;
  session: string;
  discovered: MessageSyncSnapshot | null;
  applied: MessageSyncSnapshot | null;
  target: MessageSyncSnapshot | null;
  after: number;
  pending: PendingConversation[];
}
const progressBytes = 1024 * 1024;
function name(a: VaultAuthority): string {
  return `sync-progress:v2:${a.session.deviceId}`;
}
export function emptySyncProgress(a: VaultAuthority): SyncProgress {
  return {
    version: 2,
    session: a.session.csrf,
    discovered: null,
    applied: null,
    target: null,
    after: 0,
    pending: [],
  };
}
export function decodeProgress(
  input: unknown,
  a: VaultAuthority,
): SyncProgress {
  const d = object(input);
  if (d['version'] !== 2 || d['session'] !== a.session.csrf)
    return emptySyncProgress(a);
  const pending = d['pending'];
  if (!Array.isArray(pending) || pending.length > 4096)
    throw new Error('Message recovery obligations exceed the device budget.');
  const state: SyncProgress = {
    version: 2,
    session: a.session.csrf,
    discovered: d['discovered'] === null ? null : syncSnapshot(d['discovered']),
    applied: d['applied'] === null ? null : syncSnapshot(d['applied']),
    target: d['target'] === null ? null : syncSnapshot(d['target']),
    after: integer(d['after'], Number.MAX_SAFE_INTEGER),
    pending: pending.map((raw: unknown) => {
      const row = object(raw);
      if (
        row['reason'] !== 'consent' &&
        row['reason'] !== 'key' &&
        row['reason'] !== 'verification'
      )
        throw new Error('Invalid message recovery obligation.');
      return {
        peer: uuid(row['peer']),
        after: integer(row['after'], Number.MAX_SAFE_INTEGER),
        through: integer(row['through'], Number.MAX_SAFE_INTEGER),
        required: integer(row['required'], Number.MAX_SAFE_INTEGER),
        retryAt: integer(row['retryAt'], Number.MAX_SAFE_INTEGER),
        reason: row['reason'],
      };
    }),
  };
  validateProgress(state, a);
  return state;
}
function validateProgress(state: SyncProgress, a: VaultAuthority): void {
  for (const snapshot of [state.discovered, state.applied, state.target])
    if (
      snapshot &&
      (snapshot.account !== a.session.accountId ||
        snapshot.device !== a.session.deviceId)
    )
      throw new Error('Message progress belongs to another device.');
  if (
    new Set(state.pending.map((row) => row.peer)).size !==
      state.pending.length ||
    state.pending.some(
      (row) => row.after > row.through || row.through > row.required,
    ) ||
    state.after > (state.target?.anchor ?? 0)
  )
    throw new Error('Invalid message progress range.');
}
/** One sealed strict-IDB commit contains the discovery cursor and every pending
 * obligation. Packet cache commits precede it, so replay is safe after a crash. */
export async function loadSyncProgress(
  a: VaultAuthority,
): Promise<SyncProgress> {
  const stored = await localGet<LocalCipher>(a.session.accountId, name(a));
  return stored
    ? decodeProgress(JSON.parse(await openLocal(a, stored)) as unknown, a)
    : emptySyncProgress(a);
}
export async function saveSyncProgress(
  a: VaultAuthority,
  state: SyncProgress,
): Promise<void> {
  const text = JSON.stringify(state);
  if (text.length * 2 > progressBytes || state.pending.length > 4096)
    throw new Error('Message recovery obligations exceed the device budget.');
  const sealed = await sealLocal(a, name(a), text);
  await localPut(
    a.session.accountId,
    name(a),
    sealed,
    sealed.bytes.length + 512,
  );
}
