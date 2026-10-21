import type pg from 'pg';
import { messagePageSize } from '../../shared/messages/index.ts';
import type { ContactAuthority } from './contacts.ts';
const projection =
  "SELECT m.id,m.kind,m.sender,m.recipient,m.sequence::text,m.hash,m.relation,m.deletion_account,(m.body IS NULL OR pr.id IS NOT NULL) AS deleted,m.deletion,pr.id AS removal_id,pr.hash AS removal_hash,pr.proof AS removal,pr.sequence::text AS removal_sequence,m.sender_revision,m.recipient_revision,m.queue_active,r.status FROM hash_talk.message_packets m LEFT JOIN LATERAL (SELECT * FROM hash_talk.personal_removals pr WHERE pr.account_id=$1 AND pr.kind='message' AND pr.id IN (m.id,(m.relation->>'id')::uuid) ORDER BY (pr.id=m.id) DESC LIMIT 1) pr ON true LEFT JOIN hash_talk.message_references r ON r.message_id=m.id AND r.account_id=$1 AND r.device_id=$2";

/** Same authorized metadata projection for full scans and bounded changed IDs. */
export async function messageIndexPage(
  client: pg.PoolClient,
  a: ContactAuthority,
  range: { after: number; through: number; peer?: string },
) {
  const result = await client.query<Record<string, unknown>>(
    projection +
      ' WHERE (m.sender=$1 OR m.recipient=$1) AND m.sequence>$3 AND m.sequence<=$5 AND ($6::uuid IS NULL OR m.sender=$6 OR m.recipient=$6) ORDER BY m.sequence LIMIT $4',
    [
      a.session.accountId,
      a.session.deviceId,
      range.after,
      messagePageSize + 1,
      range.through,
      range.peer ?? null,
    ],
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
    throw new Error('Incomplete change index.');
  return result.rows.map(sequenceRow);
}
function sequenceRow(
  row: Record<string, unknown>,
): Record<string, unknown> & { sequence: number } {
  return { ...row, sequence: Number(row['sequence']) };
}

/** Latest live root per requested peer, in one bounded query; never a read ACK. */
export async function latestMessageItems(
  client: pg.PoolClient,
  authority: ContactAuthority,
  peers: string[],
  through = Number.MAX_SAFE_INTEGER,
) {
  const latest = await client.query<{ id: string }>(
    `SELECT DISTINCT ON (CASE WHEN sender=$1 THEN recipient ELSE sender END) id
     FROM hash_talk.message_packets m
     WHERE ((sender=$1 AND recipient=ANY($2::uuid[])) OR (recipient=$1 AND sender=ANY($2::uuid[])))
     AND sequence<=$3 AND kind<>'profile' AND relation IS NULL AND body IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals pr WHERE pr.account_id=$1 AND pr.kind='message' AND pr.id=m.id)
     ORDER BY CASE WHEN sender=$1 THEN recipient ELSE sender END, sequence DESC LIMIT 16`,
    [authority.session.accountId, peers, through],
  );
  return {
    items: await changedMessageItems(
      client,
      authority,
      latest.rows.map((row) => row.id),
    ),
    next: null,
  };
}

export async function messageDeliveryItems(
  client: pg.PoolClient,
  authority: ContactAuthority,
  input: { ids: string[]; through: number },
): Promise<unknown[]> {
  const rows = await client.query(
    "SELECT m.id,m.hash,m.queue_active,EXISTS(SELECT 1 FROM hash_talk.message_references r WHERE r.message_id=m.id AND r.account_id=m.recipient AND r.status='received') AS recipient_received FROM hash_talk.message_packets m WHERE m.id=ANY($1::uuid[]) AND (m.sender=$2 OR m.recipient=$2) AND m.body IS NOT NULL AND m.sequence<=$3",
    [input.ids, authority.session.accountId, input.through],
  );
  return rows.rows as unknown[];
}
