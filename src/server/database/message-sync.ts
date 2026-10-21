import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import {
  messageChangePageIds,
  messageSyncConflict,
  messageChangeRetention,
  sameSyncAuthority,
  sameSyncFence,
} from '../../shared/message-sync/index.ts';
import type {
  MessageSyncSnapshot,
  MessageSyncRecovery,
} from '../../shared/message-sync/index.ts';
import type { ContactAuthority } from './contacts.ts';

/** All callers hold the actor admission/account lock. A CACHE 1 identity is
 * allocated only after every writer has acquired those participant locks. */
export async function messageSyncState(
  client: pg.PoolClient,
  a: ContactAuthority,
  known: MessageSyncSnapshot | null = null,
): Promise<MessageSyncSnapshot> {
  const result = await client.query<{
    revision: string;
    invalidation: string;
    anchor: string;
    contacts: number;
    valid_anchor: boolean;
  }>(
    `SELECT coalesce(h.revision,0)::text AS revision,coalesce(h.invalidation_revision,0)::text AS invalidation,
      (CASE WHEN coalesce(h.revision,0)=$3::bigint THEN $2::bigint ELSE
      greatest(coalesce((SELECT max(sequence) FROM hash_talk.message_packets WHERE sender=$1),0),
      coalesce((SELECT max(sequence) FROM hash_talk.message_packets WHERE recipient=$1),0)) END)::text AS anchor,
      ($2::bigint IS NULL OR $2=0 OR EXISTS(SELECT 1 FROM hash_talk.message_packets WHERE sequence=$2 AND (sender=$1 OR recipient=$1))) AS valid_anchor,
      coalesce((SELECT revision FROM hash_talk.contact_controls WHERE account_id=$1),0) AS contacts
      FROM (SELECT 1) singleton LEFT JOIN hash_talk.message_heads h ON h.account_id=$1`,
    [a.session.accountId, known?.anchor ?? null, known?.revision ?? null],
  );
  const row = result.rows[0]!;
  if (!row.valid_anchor)
    throw new AccountError(
      400,
      'Message checkpoint has no account sequence anchor.',
    );
  return {
    version: 2,
    account: a.session.accountId,
    device: a.session.deviceId,
    revision: Number(row.revision),
    invalidation: Number(row.invalidation),
    anchor: Number(row.anchor),
    directory: a.directory,
    contacts: row.contacts,
    source: 'full',
    recovery: 'initial',
  };
}

/** The server chooses a finite cut. Response size and retained revisions are
 * separate limits; a retained journal can require several bounded cuts. */
export async function nextMessageSync(
  client: pg.PoolClient,
  a: ContactAuthority,
  from: MessageSyncSnapshot | null,
): Promise<MessageSyncSnapshot> {
  const current = await messageSyncState(client, a, actorCheckpoint(a, from));
  if (!from) return current;
  if (!sameSyncAuthority(from, current))
    return { ...current, recovery: 'authority' };
  if (from.revision > current.revision || from.anchor > current.anchor)
    throw new AccountError(400, 'Message checkpoint is ahead of the account.');
  if (sameCheckpoint(from, current)) return from;
  const rows = await client.query<{
    revision: string;
    ids: string[] | null;
    kind: string;
  }>(
    'SELECT revision::text,ids,change_kind AS kind FROM hash_talk.message_changes WHERE account_id=$1 AND revision>$2 AND revision<=$3 ORDER BY message_changes.revision LIMIT $4',
    [
      a.session.accountId,
      from.revision,
      current.revision,
      messageChangeRetention,
    ],
  );
  const cut = journalCut(rows.rows, from.revision);
  if ('recovery' in cut) return recoverSnapshot(current, from, cut.recovery);
  if (cut.revision < current.invalidation)
    return recoverSnapshot(current, from, 'invalidation');
  if (cut.revision === from.revision && current.revision > from.revision)
    return recoverSnapshot(current, from, 'gap');
  const sequence = await client.query<{ anchor: string }>(
    'SELECT coalesce(max(sequence),0)::text AS anchor FROM hash_talk.message_packets WHERE id=ANY($1::uuid[]) AND (sender=$2 OR recipient=$2)',
    [cut.ids, a.session.accountId],
  );
  return {
    ...current,
    revision: cut.revision,
    anchor: Math.max(from.anchor, Number(sequence.rows[0]!.anchor)),
    source: 'journal',
    recovery: null,
  };
}
function journalCut(
  rows: { revision: string; ids: string[] | null; kind: string }[],
  from: number,
): { revision: number; ids: string[] } | { recovery: MessageSyncRecovery } {
  const ids = new Set<string>();
  let revision = from;
  for (const row of rows) {
    if (Number(row.revision) !== revision + 1)
      return { recovery: revision === from ? 'expired' : 'gap' };
    if (row.kind === 'legacy') return { recovery: 'legacy' };
    if (row.kind === 'reset' || !row.ids) return { recovery: 'reset' };
    const added = new Set([...ids, ...row.ids]);
    if (added.size > messageChangePageIds) break;
    for (const id of row.ids) ids.add(id);
    revision++;
  }
  return { revision, ids: [...ids] };
}

/** Later appends are outside this cut. Removal/cleanup, contact or directory
 * changes still reject it; revision<=head alone would be unsafe. */
export async function expectMessageSync(
  client: pg.PoolClient,
  a: ContactAuthority,
  snapshot: MessageSyncSnapshot,
): Promise<void> {
  // Every nonzero server-issued anchor is an existing immutable participant
  // packet. Its unique sequence index proves the upper bound without reading
  // either account-wide maximum again on every page/object/confirmation.
  const result = await client.query<{
    revision: string;
    invalidation: string;
    contacts: number;
    valid_anchor: boolean;
  }>(
    `SELECT coalesce(h.revision,0)::text AS revision,coalesce(h.invalidation_revision,0)::text AS invalidation,
      coalesce((SELECT revision FROM hash_talk.contact_controls WHERE account_id=$1),0) AS contacts,
      ($2::bigint=0 OR EXISTS(SELECT 1 FROM hash_talk.message_packets WHERE sequence=$2 AND (sender=$1 OR recipient=$1))) AS valid_anchor
      FROM (SELECT 1) singleton LEFT JOIN hash_talk.message_heads h ON h.account_id=$1`,
    [a.session.accountId, snapshot.anchor],
  );
  const row = result.rows[0]!,
    current = {
      ...snapshot,
      account: a.session.accountId,
      device: a.session.deviceId,
      directory: a.directory,
      revision: Number(row.revision),
      invalidation: Number(row.invalidation),
      contacts: row.contacts,
    };
  if (
    !row.valid_anchor ||
    !sameSyncFence(snapshot, current) ||
    snapshot.revision > current.revision
  )
    throw new AccountError(409, messageSyncConflict);
}

function recoverSnapshot(
  current: MessageSyncSnapshot,
  from: MessageSyncSnapshot,
  recovery: MessageSyncRecovery,
): MessageSyncSnapshot {
  const appendOnly =
    sameSyncFence(from, current) &&
    recovery !== 'legacy' &&
    recovery !== 'reset';
  return { ...current, source: appendOnly ? 'tail' : 'full', recovery };
}

function sameCheckpoint(
  from: MessageSyncSnapshot,
  current: MessageSyncSnapshot,
): boolean {
  return (
    from.revision === current.revision &&
    from.anchor === current.anchor &&
    sameSyncFence(from, current)
  );
}

function actorCheckpoint(
  a: ContactAuthority,
  from: MessageSyncSnapshot | null,
): MessageSyncSnapshot | null {
  return from?.account === a.session.accountId &&
    from.device === a.session.deviceId
    ? from
    : null;
}
