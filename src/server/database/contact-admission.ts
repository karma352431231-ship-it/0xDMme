import type pg from 'pg';

export type ContactAccess = 'read' | 'write' | 'pair';
export type ContactPeer =
  string | ((client: pg.PoolClient) => Promise<string | readonly string[]>);

/** Consent mutations exclude admission; independent participant sets coexist. */
export async function lockContactAdmission(
  client: pg.PoolClient,
  input: { actor: string | null; access: ContactAccess; peer?: ContactPeer },
): Promise<readonly string[]> {
  await client.query(
    input.access === 'write'
      ? "SELECT pg_advisory_xact_lock(hashtext('hash-talk:contact-admission'))"
      : "SELECT pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'))",
  );
  if (!input.actor) return [];
  if (input.access === 'read') {
    await client.query(
      'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR SHARE',
      [input.actor],
    );
    return [input.actor];
  }
  // Resolve immutable routing under the shared gate, then lock both accounts
  // in one order. Authorization and mutable row checks follow those locks.
  const peer =
    typeof input.peer === 'function' ? await input.peer(client) : input.peer;
  const participants = [
    ...new Set([
      input.actor,
      ...(peer ? (typeof peer === 'string' ? [peer] : peer) : []),
    ]),
  ].sort();
  // Acquire every participant lock before authorized work, irrespective of sender.
  await client.query(
    'SELECT id FROM hash_talk.accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [participants],
  );
  return participants;
}
