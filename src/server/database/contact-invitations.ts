import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { digest } from '../../shared/devices/index.ts';
import { assertContentCapacity } from './content-capacity.ts';
import type { ContentCapacity } from './content-capacity.ts';

/** One row per hashed bearer token. Raw invitation secrets stay on the client.
 * The caller owns contact/device admission and the atomic request transaction. */
export class ContactInvitations {
  private readonly capacity: ContentCapacity;
  constructor(capacity: ContentCapacity) {
    this.capacity = capacity;
  }
  async issue(
    client: pg.PoolClient,
    owner: string,
    hash: string,
  ): Promise<number> {
    const row = await client.query<{ expires: string }>(
      `INSERT INTO hash_talk.contact_invitations(account_id,token_hash,expires_at)
       VALUES($1,$2,now()+interval '24 hours') ON CONFLICT DO NOTHING
       RETURNING (extract(epoch FROM expires_at)*1000)::bigint::text AS expires`,
      [owner, hash],
    );
    if (row.rows[0]) {
      await assertContentCapacity(client, this.capacity);
      return Number(row.rows[0].expires);
    }
    const previous = await client.query<{ expires: string }>(
      `SELECT (extract(epoch FROM expires_at)*1000)::bigint::text AS expires FROM hash_talk.contact_invitations
       WHERE account_id=$1 AND token_hash=$2 AND expires_at>now() AND consumed_at IS NULL`,
      [owner, hash],
    );
    if (!previous.rows[0])
      throw new AccountError(409, 'Create a new invitation.');
    return Number(previous.rows[0].expires);
  }
  async valid(
    client: pg.PoolClient,
    input: { owner: string; token: string; actor?: string },
  ): Promise<boolean> {
    const found = await client.query(
      `SELECT 1 FROM hash_talk.contact_invitations WHERE account_id=$1 AND token_hash=$2
       AND expires_at>now() AND (consumed_at IS NULL OR used_by=$3::uuid)`,
      [input.owner, await digest(input.token), input.actor ?? null],
    );
    return !!found.rowCount;
  }
  async consume(
    client: pg.PoolClient,
    input: { owner: string; token: string; actor: string },
  ): Promise<boolean> {
    const result = await client.query(
      `UPDATE hash_talk.contact_invitations SET used_by=$3,consumed_at=now() WHERE account_id=$1 AND token_hash=$2
       AND consumed_at IS NULL AND expires_at>now() RETURNING token_hash`,
      [input.owner, await digest(input.token), input.actor],
    );
    return !!result.rowCount;
  }
  async revoke(
    client: pg.PoolClient,
    owner: string,
    hash: string,
  ): Promise<void> {
    await client.query(
      'DELETE FROM hash_talk.contact_invitations WHERE account_id=$1 AND token_hash=$2',
      [owner, hash],
    );
  }
  async clean(client: pg.PoolClient): Promise<void> {
    await client.query(`DELETE FROM hash_talk.contact_invitations WHERE (account_id,token_hash) IN
      (SELECT account_id,token_hash FROM hash_talk.contact_invitations WHERE expires_at<=now() ORDER BY expires_at LIMIT 128)`);
  }
}
