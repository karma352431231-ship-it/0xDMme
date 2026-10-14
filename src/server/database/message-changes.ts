import type pg from 'pg';
import type { ContactAuthority } from './contacts.ts';
import { changedMessageItems } from './message-index.ts';
interface Snapshot {
  revision: number;
  directory: string;
  contacts: number;
}

/** Called inside the existing account/consent transaction. One journal revision
 * per head update, with at most 256 revisions/account. NULL requires a full scan.
 * The bounded journal has no message bodies; pruning never deletes chat data. */
export async function recordMessageChanges(
  client: pg.PoolClient,
  accounts: string[],
  ids: string[] | null,
): Promise<void> {
  const changes =
    ids && ids.length > 0 && ids.length <= 65 ? [...new Set(ids)] : null;
  for (const account of [...new Set(accounts)].sort()) {
    const head = await client.query<{ revision: string }>(
      'INSERT INTO hash_talk.message_heads(account_id,revision) VALUES($1,1) ON CONFLICT(account_id) DO UPDATE SET revision=hash_talk.message_heads.revision+1 RETURNING revision::text',
      [account],
    );
    const revision = Number(head.rows[0]!.revision);
    await client.query(
      'INSERT INTO hash_talk.message_changes(account_id,revision,ids,charge) VALUES($1,$2,$3,$4)',
      [account, revision, changes, 512 + 16 * (changes?.length ?? 0)],
    );
    await client.query(
      'DELETE FROM hash_talk.message_changes WHERE account_id=$1 AND revision<=$2',
      [account, revision - 256],
    );
  }
}
/** The caller has authenticated the current snapshot under account locks. Every
 * intervening revision must exist; gaps/old cursors/scope changes require reset. */
export async function readMessageChanges(
  client: pg.PoolClient,
  a: ContactAuthority,
  range: { from: Snapshot; snapshot: Snapshot },
) {
  const { from, snapshot } = range;
  if (requiresReset(from, snapshot)) return { reset: true };
  const result = await client.query<{ revision: string; ids: string[] | null }>(
    'SELECT changes.revision::text,changes.ids FROM hash_talk.message_changes changes WHERE changes.account_id=$1 AND changes.revision>$2 AND changes.revision<=$3 ORDER BY changes.revision LIMIT 256',
    [a.session.accountId, from.revision, snapshot.revision],
  );
  const ids = new Set<string>();
  let revision = from.revision;
  for (const row of result.rows) {
    if (Number(row.revision) !== ++revision || row.ids === null)
      return { reset: true };
    for (const id of row.ids) ids.add(id);
    if (ids.size > 256) return { reset: true };
  }
  if (revision !== snapshot.revision) return { reset: true };
  return {
    reset: false,
    from,
    snapshot,
    items: await changedMessageItems(client, a, [...ids]),
    next: null,
  };
}

function requiresReset(from: Snapshot, snapshot: Snapshot): boolean {
  return (
    from.directory !== snapshot.directory ||
    from.contacts !== snapshot.contacts ||
    from.revision > snapshot.revision ||
    snapshot.revision - from.revision > 256
  );
}
