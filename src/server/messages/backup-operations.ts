import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { fingerprint, directoryEvent } from '../../shared/devices/index.ts';
import type {
  ContactAuthority,
  Database,
  DeviceStore,
} from '../database/index.ts';
import type { MessageAction } from './operation.ts';
import {
  messageSnapshot as snapshot,
  messageSequence as sequence,
} from './operation-input.ts';
import { recoveryKey, verifyRecoveryKey } from '../../shared/messages/index.ts';
interface BackupMessagePorts {
  messages: Pick<
    Database['messages'],
    'backupWindow' | 'confirmSnapshot' | 'acknowledge'
  >;
  recovery: Database['messageRecovery'];
  backups: Pick<Database['backups'], 'clean' | 'page'>;
  devices: Pick<DeviceStore, 'current'>;
  /** Complete immediate collection after committed personal removal. */
  collectRemoved: () => Promise<void>;
}
/** Recovery/export and personal-removal contracts keep their snapshot checks. */
export function backupMessageOperations(
  input: BackupMessagePorts,
): Record<string, MessageAction> {
  return {
    'recovery-current': (a, d) => {
      keys(d, []);
      return input.recovery.current(a);
    },
    'recovery-key': (a, d) => {
      keys(d, ['id']);
      return input.recovery.historical(a, uuid(d['id']));
    },
    'recovery-peer': (a, d) => {
      keys(d, ['accountId']);
      return input.recovery.peer(a, uuid(d['accountId']));
    },
    'recovery-register': (a, d) => registerRecovery(input, a, d),
    'personal-clean': async (a, _d, p) => {
      const result = await input.backups.clean(a, p);
      await input.collectRemoved();
      return result;
    },
    'personal-page': (a, d) => {
      keys(d, ['after']);
      return input.backups.page(a, sequence(d['after']));
    },
    'backup-window': async (a, d) => {
      keys(d, ['ids', 'snapshot']);
      if (!Array.isArray(d['ids']) || !d['ids'].length || d['ids'].length > 32)
        throw new AccountError(400, 'Invalid batch.');
      const ids = d['ids'].map(uuid);
      if (new Set(ids).size !== ids.length)
        throw new AccountError(400, 'Duplicate batch.');
      const rows = await input.messages.backupWindow(
        a,
        ids,
        snapshot(d['snapshot']),
      );
      const recovery = new Map<string, unknown>();
      for (const row of rows) {
        const archive = row.packet?.archives.find(
          (k) => k.accountId === a.session.accountId,
        );
        if (archive && !recovery.has(archive.keyId))
          recovery.set(
            archive.keyId,
            await input.recovery.historical(a, archive.keyId),
          );
      }
      await input.messages.confirmSnapshot(a, snapshot(d['snapshot']));
      return { rows, recovery: [...recovery.values()] };
    },
    'backup-ack': async (a, d) => {
      keys(d, ['items', 'snapshot']);
      if (!Array.isArray(d['items']) || d['items'].length > 32)
        throw new AccountError(400, 'Invalid batch.');
      await input.messages.confirmSnapshot(a, snapshot(d['snapshot']));
      for (const item of d['items']) {
        const row = object(item);
        keys(row, ['id', 'hash']);
        await input.messages.acknowledge(
          a,
          uuid(row['id']),
          fingerprint(row['hash']),
          snapshot(d['snapshot']),
        );
      }
      await input.messages.confirmSnapshot(a, snapshot(d['snapshot']));
    },
  };
}
async function registerRecovery(
  input: BackupMessagePorts,
  a: ContactAuthority,
  d: Record<string, unknown>,
): Promise<unknown> {
  keys(d, ['key']);
  const key = recoveryKey(d['key']),
    current = await input.devices.current(a.session.accountId);
  if (!current) throw new AccountError(403, 'Directory missing.');
  await verifyRecoveryKey(key, directoryEvent(current.event));
  return input.recovery.register(a, key);
}
