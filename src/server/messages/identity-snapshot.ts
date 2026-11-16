import { keys } from '../../shared/account/index.ts';
import type { Database } from '../database/index.ts';
import type { MessageAction } from './operation.ts';

/** Compare both versions against one account cut. The store that owns each
 * version reads it under the same transaction and current-device check. */
export function identitySnapshotAction(
  db: Pick<Database, 'contacts' | 'vault' | 'backups'>,
): MessageAction {
  return (authority, data) => {
    keys(data, []);
    const { accountId } = authority.session;
    return db.contacts.withMessageRead(authority, async (client) => {
      const head = await db.vault.readHead(client, accountId);
      const removal = await db.backups.removalCursor(client, accountId);
      return { ...head, removal };
    });
  };
}
