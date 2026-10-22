import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { syncSnapshot } from '../../shared/message-sync/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type { ContactAuthority, MessageStore } from '../database/index.ts';

/** Transport validation only; the schema owner holds read and security locks. */
export function messageSyncOperations(store: MessageStore) {
  return {
    'sync-probe': (a: ContactAuthority, data: Record<string, unknown>) => {
      keys(data, ['from', 'ids']);
      const ids = data['ids'];
      if (!Array.isArray(ids) || ids.length > 18)
        throw new AccountError(400, 'Invalid delivery probe.');
      return store.syncProbe(a, {
        from: syncSnapshot(data['from']),
        ids: ids.map((id: unknown) => uuid(id)),
      });
    },
    'sync-state': (a: ContactAuthority, data: Record<string, unknown>) => {
      keys(data, ['from']);
      return store.syncState(
        a,
        data['from'] === null ? null : syncSnapshot(data['from']),
      );
    },
    'sync-peer-window': (
      a: ContactAuthority,
      input: Record<string, unknown>,
    ) => {
      const data = object(input);
      keys(data, ['snapshot', 'peer', 'before']);
      return store.syncPeerWindow(a, {
        snapshot: syncSnapshot(data['snapshot']),
        peer: uuid(data['peer']),
        before:
          data['before'] === null
            ? null
            : integer(data['before'], Number.MAX_SAFE_INTEGER),
      });
    },
    'sync-peer-page': (a: ContactAuthority, input: Record<string, unknown>) => {
      const data = object(input);
      keys(data, ['snapshot', 'peer', 'after', 'through']);
      return store.syncPeerPage(a, {
        snapshot: syncSnapshot(data['snapshot']),
        peer: uuid(data['peer']),
        after: integer(data['after'], Number.MAX_SAFE_INTEGER),
        through: integer(data['through'], Number.MAX_SAFE_INTEGER),
      });
    },
  };
}
