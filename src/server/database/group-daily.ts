import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { GroupStore } from './groups.ts';
import type { GroupScope } from './group-media.ts';
import { assertVaultQuota, assertContentCapacity } from './vault-quota.ts';
export class GroupDailyStore {
  private readonly pool: pg.Pool;
  private readonly groups: GroupStore;
  private readonly contacts: ContactStore;
  private readonly capacity: number;
  constructor(
    pool: pg.Pool,
    groups: GroupStore,
    contacts: ContactStore,
    capacity: number,
  ) {
    this.pool = pool;
    this.groups = groups;
    this.contacts = contacts;
    this.capacity = capacity;
  }
  private async budget(client: pg.PoolClient, account: string): Promise<void> {
    await assertVaultQuota(client, account);
    await assertContentCapacity(client, this.capacity);
  }
  async state(a: ContactAuthority, scope: GroupScope): Promise<unknown> {
    const rows = await this.states(a, [scope]);
    return rows[0];
  }
  async states(a: ContactAuthority, scopes: GroupScope[]): Promise<unknown[]> {
    return this.contacts.withMessageAuthority(a, async (client) => {
      const states = await this.groups.authorizedScopes(
        client,
        a.session.accountId,
        scopes,
      );
      const request = states.map((s) => ({
        group: s.groupId,
        joined: s.members.find((m) => m.accountId === a.session.accountId)
          ?.joined,
        epoch: s.epoch,
      }));
      const data = await client.query(
        `SELECT root."group" AS peer,coalesce(c.revision,0) AS revision,coalesce(c.muted_until,0)::text AS "mutedUntil",(extract(epoch FROM cleanup.due_at)*1000)::bigint::text AS "cleanupDueAt",cleanup.selected_bytes AS "cleanupBytes",(SELECT count(*)::integer FROM hash_talk.group_packets p WHERE p.group_id=root."group" AND p.epoch>=root.joined AND p.epoch<=root.epoch AND p.sender<>$1 AND p.kind<>'profile' AND p.body IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hash_talk.group_reads r WHERE r.account_id=$1 AND r.message_id=p.id)) AS unread FROM jsonb_to_recordset($2::jsonb) root("group" uuid,joined integer,epoch integer) LEFT JOIN hash_talk.group_controls c ON c.account_id=$1 AND c.group_id=root."group" LEFT JOIN hash_talk.group_cleanups cleanup ON cleanup.group_id=root."group" AND cleanup.due_at IS NOT NULL`,
        [a.session.accountId, JSON.stringify(request)],
      );
      return data.rows as unknown[];
    });
  }
  async mute(
    a: ContactAuthority,
    input: GroupScope & { revision: number; mutedUntil: number },
  ): Promise<void> {
    await this.groups.withGroupAuthority(a, input, async (client) => {
      const old = await client.query<{ revision: number }>(
        'SELECT revision FROM hash_talk.group_controls WHERE account_id=$1 AND group_id=$2',
        [a.session.accountId, input.groupId],
      );
      if ((old.rows[0]?.revision ?? 0) !== input.revision)
        throw new AccountError(
          409,
          'Silêncio do grupo mudou em outro aparelho. Atualize.',
        );
      await client.query(
        'INSERT INTO hash_talk.group_controls(account_id,group_id,revision,muted_until) VALUES($1,$2,1,$3) ON CONFLICT(account_id,group_id) DO UPDATE SET revision=hash_talk.group_controls.revision+1,muted_until=$3 WHERE hash_talk.group_controls.muted_until<>$3',
        [a.session.accountId, input.groupId, input.mutedUntil],
      );
      await this.budget(client, a.session.accountId);
      this.contacts.changed(client, [a.session.accountId]);
    });
  }
  async read(
    a: ContactAuthority,
    input: GroupScope & { ids: string[] },
  ): Promise<void> {
    await this.groups.withGroupAuthority(a, input, async (client, state) => {
      const joined = state.members.find(
        (m) => m.accountId === a.session.accountId,
      )?.joined;
      const known = await client.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM hash_talk.group_packets WHERE group_id=$1 AND id=ANY($2::uuid[]) AND epoch>=$3 AND epoch<=$4 AND body IS NOT NULL AND $5::uuid=ANY(received_accounts)',
        [input.groupId, input.ids, joined, state.epoch, a.session.accountId],
      );
      if (known.rows[0]?.count !== input.ids.length)
        throw new AccountError(
          409,
          'Leitura exige conteúdo recebido e preservado neste aparelho.',
        );
      const changed = await client.query<{ share_epoch: number | null }>(
        `INSERT INTO hash_talk.group_reads(account_id,group_id,message_id,share_epoch) SELECT $1,$2,unnest($3::uuid[]),CASE WHEN d.read_receipts THEN d.receipt_epoch ELSE NULL END FROM (SELECT 1) root LEFT JOIN hash_talk.daily_controls d ON d.account_id=$1 ON CONFLICT(account_id,message_id) DO UPDATE SET share_epoch=excluded.share_epoch WHERE hash_talk.group_reads.share_epoch IS DISTINCT FROM excluded.share_epoch RETURNING share_epoch`,
        [a.session.accountId, input.groupId, input.ids],
      );
      await this.budget(client, a.session.accountId);
      if (changed.rowCount)
        this.contacts.changed(client, [a.session.accountId]);
      if (changed.rows.some((r) => r.share_epoch !== null))
        this.contacts.changed(
          client,
          state.members.map((m) => m.accountId),
        );
    });
  }
  async receipts(
    a: ContactAuthority,
    input: GroupScope & { ids: string[] },
  ): Promise<unknown> {
    return this.groups.withGroupAuthority(a, input, async (client, state) => {
      const joined = state.members.find(
        (m) => m.accountId === a.session.accountId,
      )?.joined;
      const result = await client.query(
        `SELECT p.id,(cardinality(p.pending_accounts)=0) AS received,(cardinality(p.pending_accounts)=0 AND NOT EXISTS(SELECT 1 FROM unnest(p.received_accounts) root(account) LEFT JOIN hash_talk.group_reads r ON r.account_id=root.account AND r.message_id=p.id LEFT JOIN hash_talk.daily_controls d ON d.account_id=root.account WHERE root.account<>p.sender AND (r.message_id IS NULL OR NOT coalesce(d.read_receipts,false) OR d.receipt_epoch IS DISTINCT FROM r.share_epoch))) AS read FROM hash_talk.group_packets p WHERE p.group_id=$1 AND p.id=ANY($2::uuid[]) AND p.sender=$3 AND p.epoch>=$4 AND p.epoch<=$5 AND p.body IS NOT NULL`,
        [input.groupId, input.ids, a.session.accountId, joined, state.epoch],
      );
      return result.rows as unknown[];
    });
  }
  async clean(): Promise<void> {
    await this.pool.query(
      'DELETE FROM hash_talk.group_reads r WHERE (r.account_id,r.message_id) IN (SELECT r.account_id,r.message_id FROM hash_talk.group_reads r JOIN hash_talk.group_packets p ON p.id=r.message_id WHERE p.body IS NULL LIMIT 64)',
    );
  }
  async nextCollection(): Promise<number | null> {
    const result = await this.pool.query(
      'SELECT 1 FROM hash_talk.group_reads r JOIN hash_talk.group_packets p ON p.id=r.message_id WHERE p.body IS NULL LIMIT 1',
    );
    return result.rowCount ? Date.now() : null;
  }
}
