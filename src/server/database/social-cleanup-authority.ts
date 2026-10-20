import type pg from 'pg';
import type { BackupTarget } from '../../shared/backups/index.ts';
import { AccountError } from '../../shared/account/index.ts';
import type { PublicProfileStore } from './public-profile.ts';

/** Social cleanup metadata authority; ciphertext belongs to the history reader. */
export class SocialCleanupAuthority {
  private readonly profiles: PublicProfileStore;
  constructor(profiles: PublicProfileStore) {
    this.profiles = profiles;
  }
  /** Immutable cleanup routing under shared admission; authority checks follow ordered account locks. */
  async participants(
    c: pg.PoolClient,
    account: string,
    ids: string[],
  ): Promise<string[]> {
    if (!ids.length) return [];
    const result = await c.query<{ sender: string; recipient: string }>(
      'SELECT sender,recipient FROM hash_talk.social_messages WHERE id=ANY($1::uuid[])',
      [ids],
    );
    const owners = await this.profiles.accountsFor(c, [
      ...new Set(result.rows.flatMap((row) => [row.sender, row.recipient])),
    ]);
    return result.rows.flatMap((row) => {
      const sender = owners.get(row.sender),
        recipient = owners.get(row.recipient);
      return sender && recipient && [sender, recipient].includes(account)
        ? [sender, recipient]
        : [];
    });
  }
  async validate(c: pg.PoolClient, account: string, item: BackupTarget) {
    const row = await this.target(c, account, item.id);
    if (row.hash !== item.hash)
      throw new AccountError(409, 'DM differs from the cleanup selection.');
    return row;
  }
  async target(c: pg.PoolClient, account: string, id: string) {
    const actor = await this.profiles.identity(c, account);
    const result = await c.query<{ hash: string; available: boolean }>(
      `SELECT hash,body IS NOT NULL AS available FROM hash_talk.social_messages WHERE id=$1 AND (sender=$2 OR recipient=$2)
       AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals r WHERE r.account_id=$3 AND r.kind='dm-message' AND r.id=$1)`,
      [id, actor.id, account],
    );
    const row = result.rows[0];
    if (!row?.available)
      throw new AccountError(410, 'DM unavailable in the personal vault.');
    return { hash: row.hash, actor: actor.id };
  }
}
