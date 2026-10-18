import { keys, uuid } from '../../shared/account/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type { ContactAuthority, Database } from '../database/index.ts';

/** Fresh bounded reads through their owning modules; no cross-module transaction. */
export function callContext(
  db: Pick<Database, 'vault' | 'backups' | 'contacts'>,
) {
  return async (a: ContactAuthority, d: Record<string, unknown>) => {
    keys(d, ['peer', 'vault', 'removals']);
    const peer = uuid(d['peer']);
    const after = integer(d['vault'], Number.MAX_SAFE_INTEGER);
    const removals = integer(d['removals'], Number.MAX_SAFE_INTEGER);
    const [vault, removed, directory] = await Promise.all([
      db.vault.page(a.session, a.directory, after),
      db.backups.page(a, removals),
      db.contacts.directory(a, peer, 0),
    ]);
    return { vault, removals: removed, peer: directory };
  };
}
