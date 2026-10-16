import type pg from 'pg';
import type { PushRegistration } from '../../shared/daily/index.ts';

export interface PushJob {
  account_id: string;
  device_id: string;
  generation: string;
  subscription: PushRegistration;
  attempts: number;
}
export type PushJobKey = Pick<PushJob, 'account_id' | 'device_id'>;
export interface PushJobCursor {
  scheduledAt: string;
  account: string;
  device: string;
}
export interface PushJobPage {
  items: PushJob[];
  next: PushJobCursor | null;
}

/** Keep PostgreSQL timestamp precision and stable tie ordering across bounded pages. */
export async function readPushJobPage(
  pool: Pick<pg.Pool, 'query'>,
  after: PushJobCursor | null,
): Promise<PushJobPage> {
  const rows = await pool.query<PushJob & { scheduled_at: string }>(
    `SELECT account_id,device_id,generation::text,subscription,attempts,next_attempt::text AS scheduled_at
     FROM hash_talk.push_subscriptions WHERE pending AND attempts<3 AND next_attempt<=now()
     AND ($1::timestamptz IS NULL OR next_attempt >= $1::timestamptz)
     AND ($1::timestamptz IS NULL OR (next_attempt,account_id,device_id)>($1::timestamptz,$2::uuid,$3::uuid))
     ORDER BY next_attempt,account_id,device_id LIMIT 16`,
    [after?.scheduledAt ?? null, after?.account ?? null, after?.device ?? null],
  );
  const last = rows.rows.at(-1);
  return {
    items: rows.rows.map((row) => ({
      account_id: row.account_id,
      device_id: row.device_id,
      generation: row.generation,
      subscription: row.subscription,
      attempts: row.attempts,
    })),
    next:
      rows.rows.length === 16 && last
        ? {
            scheduledAt: last.scheduled_at,
            account: last.account_id,
            device: last.device_id,
          }
        : null,
  };
}
