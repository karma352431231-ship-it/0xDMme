import type pg from 'pg';
import { messagePageSize } from '../../shared/messages/index.ts';
import type { ContactAuthority } from './contacts.ts';
const projection =
  "SELECT m.id,m.kind,m.sender,m.recipient,m.sequence::text,m.hash,m.relation,m.deletion_account,(m.body IS NULL OR pr.id IS NOT NULL) AS deleted,m.deletion,pr.id AS removal_id,pr.hash AS removal_hash,pr.proof AS removal,pr.sequence::text AS removal_sequence,m.sender_revision,m.recipient_revision,m.queue_active,r.status FROM hash_talk.message_packets m LEFT JOIN LATERAL (SELECT * FROM hash_talk.personal_removals pr WHERE pr.account_id=$1 AND pr.kind='message' AND pr.id IN (m.id,(m.relation->>'id')::uuid) ORDER BY (pr.id=m.id) DESC LIMIT 1) pr ON true LEFT JOIN hash_talk.message_references r ON r.message_id=m.id AND r.account_id=$1 AND r.device_id=$2";

/** Same authorized metadata projection for full scans and bounded changed IDs. */
export async function messageIndexPage(
  client: pg.PoolClient,
  a: ContactAuthority,
  after: number,
) {
  const result = await client.query<Record<string, unknown>>(
    projection +
      ' WHERE (m.sender=$1 OR m.recipient=$1) AND m.sequence>$3 ORDER BY m.sequence LIMIT $4',
    [a.session.accountId, a.session.deviceId, after, messagePageSize + 1],
  );
  const items = result.rows.slice(0, messagePageSize).map(sequenceRow);
  return {
    items,
    next:
      result.rows.length > messagePageSize
        ? Number(items.at(-1)?.['sequence'])
        : null,
  };
}
export async function changedMessageItems(
  client: pg.PoolClient,
  a: ContactAuthority,
  ids: string[],
) {
  if (!ids.length) return [];
  const result = await client.query<Record<string, unknown>>(
    projection +
      ' WHERE (m.sender=$1 OR m.recipient=$1) AND m.id=ANY($3::uuid[]) ORDER BY m.sequence LIMIT 257',
    [a.session.accountId, a.session.deviceId, ids],
  );
  if (result.rows.length !== ids.length)
    throw new Error('Índice de alterações incompleto.');
  return result.rows.map(sequenceRow);
}
function sequenceRow(row: Record<string, unknown>) {
  return { ...row, sequence: Number(row['sequence']) };
}
