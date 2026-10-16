import type pg from 'pg';

export type ContactAccess = 'read' | 'write' | 'pair';

/** Consent mutations exclude admission; independent participant pairs coexist. */
export async function lockContactAdmission(
  client: pg.PoolClient,
  input: { actor: string | null; access: ContactAccess; peer?: string },
): Promise<void> {
  await client.query(
    input.access === 'write'
      ? "SELECT pg_advisory_xact_lock(hashtext('hash-talk:contact-admission'))"
      : "SELECT pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'))",
  );
  if (!input.actor) return;
  if (input.access === 'read') {
    await client.query(
      'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR SHARE',
      [input.actor],
    );
    return;
  }
  const participants = [
    ...new Set([input.actor, ...(input.peer ? [input.peer] : [])]),
  ].sort();
  // Acquire both participant locks before any callback, irrespective of sender.
  await client.query(
    'SELECT id FROM hash_talk.accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [participants],
  );
}
