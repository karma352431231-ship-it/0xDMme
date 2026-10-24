import { keys, object } from '../../shared/account/index.ts';
import {
  isSyncSnapshot,
  syncSnapshot,
} from '../../shared/message-sync/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type { MessageSnapshot } from '../database/index.ts';
export function messageSequence(value: unknown): number {
  return integer(value, Number.MAX_SAFE_INTEGER);
}
export function messageSnapshot(input: unknown): MessageSnapshot {
  if (isSyncSnapshot(input)) return syncSnapshot(input);
  const data = object(input);
  keys(data, ['revision', 'directory', 'contacts']);
  return {
    revision: messageSequence(data['revision']),
    directory: fingerprint(data['directory']),
    contacts: messageSequence(data['contacts']),
  };
}
