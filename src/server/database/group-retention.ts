import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';
import {
  groupMediaTarget,
  groupMediaWarning,
} from '../../shared/group-quota/index.ts';
import {
  groupCleanupNotice,
  selectMediaCleanupBatch,
} from '../../shared/group-retention/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { GroupStore } from './groups.ts';
import type { GroupScope } from './group-media.ts';
import { assertGroupTextQuota } from './group-quota.ts';
import { assertContentCapacity } from './vault-quota.ts';
import { admitGroupNotification } from './daily.ts';
const clearableGroup = `(EXISTS(SELECT 1 FROM hash_talk.group_packets p WHERE p.group_id=g.id AND p.body IS NOT NULL) OR EXISTS(SELECT 1 FROM hash_talk.group_media m WHERE m.group_id=g.id AND m.status NOT IN ('writing','deleting')) OR EXISTS(SELECT 1 FROM hash_talk.group_key_sets k WHERE k.group_id=g.id) OR EXISTS(SELECT 1 FROM hash_talk.group_matrix_envelopes e WHERE e.group_id=g.id AND e.body IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM hash_talk.group_media m WHERE m.group_id=g.id))`;
const dueGroups = `((g.clearing AND ${clearableGroup}) OR
 (g.deleted AND (EXISTS(SELECT 1 FROM hash_talk.group_packets p WHERE p.group_id=g.id AND p.body IS NOT NULL) OR EXISTS(SELECT 1 FROM hash_talk.group_media m WHERE m.group_id=g.id AND m.status NOT IN ('writing','deleting')) OR EXISTS(SELECT 1 FROM hash_talk.group_matrix_envelopes e WHERE e.group_id=g.id AND e.body IS NOT NULL))) OR
 EXISTS(SELECT 1 FROM hash_talk.group_cleanups c WHERE c.group_id=g.id AND (c.due_at IS NULL OR c.due_at<=clock_timestamp())) OR
 (NOT g.deleted AND NOT EXISTS(SELECT 1 FROM hash_talk.group_cleanups c WHERE c.group_id=g.id) AND (SELECT coalesce(sum(m.bytes),0) FROM hash_talk.group_media m WHERE m.group_id=g.id AND m.status='accepted')>=$1))`;
interface CleanupRow {
  id: string;
  remaining: number;
  after_sequence: string;
  due_at: Date | null;
}
export class GroupRetentionStore {
  private readonly pool: pg.Pool;
  private readonly contacts: ContactStore;
  private readonly groups: GroupStore;
  private readonly capacity: number;
  private after: string | null = null;
  private retiredAfter: string | null = null;
  constructor(
    pool: pg.Pool,
    contacts: ContactStore,
    groups: GroupStore,
    capacity: number,
  ) {
    this.pool = pool;
    this.contacts = contacts;
    this.groups = groups;
    this.capacity = capacity;
  }
  async retiredScopes(): Promise<{ id: string }[]> {
    const result = await this.pool.query<{ id: string }>(
      'SELECT id FROM hash_talk.groups g WHERE deleted AND NOT media_scope_retired AND ($1::uuid IS NULL OR id>$1) AND NOT EXISTS(SELECT 1 FROM hash_talk.group_media m WHERE m.group_id=g.id) ORDER BY id LIMIT 4',
      [this.retiredAfter],
    );
    this.retiredAfter = result.rows.at(-1)?.id ?? null;
    return result.rows;
  }
  async collectedScope(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE hash_talk.groups g SET media_scope_retired=true WHERE id=$1 AND deleted AND NOT media_scope_retired AND NOT EXISTS(SELECT 1 FROM hash_talk.group_media m WHERE m.group_id=g.id)',
      [id],
    );
  }
  async notice(
    authority: ContactAuthority,
    input: GroupScope & { after: number },
  ): Promise<unknown> {
    return this.groups.withGroupAuthority(
      authority,
      input,
      async (client, state) => {
        const result = await client.query<{
          id: string;
          due_at: Date;
          selected_bytes: number;
        }>(
          'SELECT id,due_at,selected_bytes FROM hash_talk.group_cleanups WHERE group_id=$1 AND due_at IS NOT NULL',
          [input.groupId],
        );
        const row = result.rows[0];
        if (!row) return { notice: null, items: [], next: null };
        const joined = state.members.find(
          (m) => m.accountId === authority.session.accountId,
        )?.joined;
        if (!joined) throw new AccountError(403, 'Participação indisponível.');
        const items = await client.query<{
          message_id: string;
          sequence: string;
          bytes: number;
        }>(
          'SELECT message_id,min(sequence)::text AS sequence,sum(bytes)::integer AS bytes FROM hash_talk.group_media WHERE group_id=$1 AND cleanup=$2 AND epoch>=$3 GROUP BY message_id HAVING min(sequence)>$4 ORDER BY min(sequence) LIMIT 16',
          [input.groupId, row.id, joined, input.after],
        );
        return {
          notice: {
            id: row.id,
            dueAt: row.due_at.getTime(),
            bytes: row.selected_bytes,
          },
          items: items.rows.map((m) => ({
            message: m.message_id,
            sequence: Number(m.sequence),
            bytes: m.bytes,
          })),
          next: items.rows.length ? Number(items.rows.at(-1)?.sequence) : null,
        };
      },
    );
  }
  async clear(authority: ContactAuthority, scope: GroupScope): Promise<void> {
    await this.groups.withGroupAuthority(
      authority,
      scope,
      async (client, state) => {
        if (state.owner !== authority.session.accountId)
          throw new AccountError(
            403,
            'Somente o dono limpa o cofre compartilhado.',
          );
        const changed = await client.query(
          'UPDATE hash_talk.groups SET clearing=true WHERE id=$1 AND NOT clearing',
          [scope.groupId],
        );
        if (changed.rowCount)
          this.contacts.changed(
            client,
            state.members.map((m) => m.accountId),
          );
      },
    );
  }
  /** Each tick touches at most four groups and 64 messages per group; no filesystem I/O here. */
  async tick(): Promise<void> {
    const candidates = await this.pool.query<{ id: string }>(
      `SELECT g.id FROM hash_talk.groups g WHERE ${dueGroups}
       AND ($2::uuid IS NULL OR g.id>$2) ORDER BY g.id LIMIT 4`,
      [groupMediaWarning, this.after],
    );
    this.after = candidates.rows.at(-1)?.id ?? null;
    for (const group of candidates.rows)
      await this.groups.withMaintenance(group.id, async (client, state) =>
        this.process(client, state),
      );
  }
  async nextCollection(): Promise<number | null> {
    const result = await this.pool.query<{ at: Date | null }>(
      `SELECT min(at) AS at FROM (
       SELECT clock_timestamp() AS at WHERE EXISTS(SELECT 1 FROM hash_talk.groups g WHERE ${dueGroups})
       UNION ALL SELECT due_at FROM hash_talk.group_cleanups WHERE due_at>clock_timestamp()
       UNION ALL SELECT clock_timestamp() WHERE EXISTS(SELECT 1 FROM hash_talk.groups g WHERE g.deleted AND NOT g.media_scope_retired AND NOT EXISTS(SELECT 1 FROM hash_talk.group_media m WHERE m.group_id=g.id))
       ) deadlines`,
      [groupMediaWarning],
    );
    return result.rows[0]?.at?.getTime() ?? null;
  }
  private async process(
    client: pg.PoolClient,
    state: GroupEvent,
  ): Promise<void> {
    const result = await client.query<{ clearing: boolean }>(
      'SELECT clearing FROM hash_talk.groups WHERE id=$1',
      [state.groupId],
    );
    if (state.kind === 'delete' || result.rows[0]?.clearing) {
      await this.clearBatch(client, state);
      return;
    }
    const job = await this.job(client, state.groupId);
    if (!job) return;
    if (job.due_at) {
      if (job.due_at.getTime() <= Date.now())
        await this.expireBatch(client, state, job);
      return;
    }
    await this.selectBatch(client, state, job);
  }
  private async job(
    client: pg.PoolClient,
    groupId: string,
  ): Promise<CleanupRow | null> {
    let result = await client.query<CleanupRow>(
      'SELECT * FROM hash_talk.group_cleanups WHERE group_id=$1 FOR UPDATE',
      [groupId],
    );
    if (result.rows[0]) return result.rows[0];
    const usage = await client.query<{ bytes: number }>(
      "SELECT coalesce(sum(bytes),0)::integer AS bytes FROM hash_talk.group_media WHERE group_id=$1 AND status='accepted'",
      [groupId],
    );
    const bytes = usage.rows[0]?.bytes ?? 0;
    if (bytes < groupMediaWarning) return null;
    result = await client.query<CleanupRow>(
      'INSERT INTO hash_talk.group_cleanups(group_id,id,remaining) VALUES($1,$2,$3) RETURNING *',
      [groupId, randomUUID(), bytes - groupMediaTarget],
    );
    await assertGroupTextQuota(client, groupId);
    await assertContentCapacity(client, this.capacity);
    return result.rows[0] ?? null;
  }
  private async selectBatch(
    client: pg.PoolClient,
    state: GroupEvent,
    job: CleanupRow,
  ): Promise<void> {
    const rows = await client.query<{
      id: string;
      sequence: string;
      bytes: number;
    }>(
      "SELECT message_id AS id,min(sequence)::text AS sequence,sum(bytes)::integer AS bytes FROM hash_talk.group_media WHERE group_id=$1 AND status='accepted' AND cleanup IS NULL GROUP BY message_id HAVING min(sequence)>$2 ORDER BY min(sequence) LIMIT 64",
      [state.groupId, job.after_sequence],
    );
    const batch = selectMediaCleanupBatch({
      remainingBytes: job.remaining,
      after: Number(job.after_sequence),
      items: rows.rows.map((r) => ({ ...r, sequence: Number(r.sequence) })),
    });
    await client.query(
      "UPDATE hash_talk.group_media SET cleanup=$2 WHERE group_id=$1 AND message_id=ANY($3::uuid[]) AND status='accepted' AND cleanup IS NULL",
      [state.groupId, job.id, batch.selected.map((r) => r.id)],
    );
    const frozen = !batch.remainingBytes || !rows.rows.length;
    const dueAt = frozen ? new Date(Date.now() + groupCleanupNotice) : null;
    await client.query(
      'UPDATE hash_talk.group_cleanups SET remaining=$2,after_sequence=$3,selected_bytes=selected_bytes+$4,due_at=$5 WHERE group_id=$1',
      [
        state.groupId,
        batch.remainingBytes,
        batch.after,
        batch.selected.reduce((n, r) => n + r.bytes, 0),
        dueAt,
      ],
    );
    if (frozen) {
      await admitGroupNotification(client, {
        groupId: state.groupId,
        sender: null,
        kind: 'cleanup',
        accounts: state.members.map((m) => m.accountId),
      });
      this.contacts.changed(
        client,
        state.members.map((m) => m.accountId),
      );
    }
  }
  private async expireBatch(
    client: pg.PoolClient,
    state: GroupEvent,
    job: CleanupRow,
  ): Promise<void> {
    const expired = await client.query(
      "UPDATE hash_talk.group_media SET status='deleting' WHERE id IN (SELECT id FROM hash_talk.group_media WHERE group_id=$1 AND cleanup=$2 AND status='accepted' ORDER BY sequence LIMIT 64) RETURNING id",
      [state.groupId, job.id],
    );
    if (expired.rowCount)
      this.contacts.changed(
        client,
        state.members.map((m) => m.accountId),
      );
    const remaining = await client.query(
      'SELECT 1 FROM hash_talk.group_media WHERE group_id=$1 AND cleanup=$2 LIMIT 1',
      [state.groupId, job.id],
    );
    if (!remaining.rowCount)
      await client.query(
        'DELETE FROM hash_talk.group_cleanups WHERE group_id=$1',
        [state.groupId],
      );
    // Packet routing arrays are untouched: expiry is never a delivery receipt.
  }
  private async clearBatch(
    client: pg.PoolClient,
    state: GroupEvent,
  ): Promise<void> {
    await client.query(
      "UPDATE hash_talk.group_media SET status='deleting' WHERE id IN (SELECT id FROM hash_talk.group_media WHERE group_id=$1 AND status NOT IN ('writing','deleting') ORDER BY sequence LIMIT 64)",
      [state.groupId],
    );
    const cleared = await client.query(
      `UPDATE hash_talk.group_packets SET body=NULL,key_hash=NULL,deletion=jsonb_build_object('reason','vault-clean','at',floor(extract(epoch FROM clock_timestamp())*1000)),charge=512+16*(cardinality(pending_accounts)+cardinality(received_accounts)) WHERE id IN (SELECT id FROM hash_talk.group_packets WHERE group_id=$1 AND body IS NOT NULL ORDER BY sequence LIMIT 64)`,
      [state.groupId],
    );
    await client.query(
      'DELETE FROM hash_talk.group_key_sets WHERE hash IN (SELECT k.hash FROM hash_talk.group_key_sets k WHERE k.group_id=$1 AND NOT EXISTS(SELECT 1 FROM hash_talk.group_packets p WHERE p.key_hash=k.hash) LIMIT 64)',
      [state.groupId],
    );
    await client.query(
      'UPDATE hash_talk.group_matrix_envelopes SET body=NULL,charge=512 WHERE sequence IN (SELECT sequence FROM hash_talk.group_matrix_envelopes WHERE group_id=$1 AND body IS NOT NULL ORDER BY sequence LIMIT 64)',
      [state.groupId],
    );
    if (cleared.rowCount)
      this.contacts.changed(
        client,
        state.members.map((m) => m.accountId),
      );
    const pending = await client.query(
      `SELECT 1 WHERE EXISTS(SELECT 1 FROM hash_talk.group_packets WHERE group_id=$1 AND body IS NOT NULL) OR EXISTS(SELECT 1 FROM hash_talk.group_media WHERE group_id=$1) OR EXISTS(SELECT 1 FROM hash_talk.group_key_sets WHERE group_id=$1) OR EXISTS(SELECT 1 FROM hash_talk.group_matrix_envelopes WHERE group_id=$1 AND body IS NOT NULL)`,
      [state.groupId],
    );
    if (!pending.rowCount) {
      await client.query(
        'UPDATE hash_talk.groups SET clearing=false WHERE id=$1 AND clearing AND (NOT deleted OR media_scope_retired)',
        [state.groupId],
      );
      await client.query(
        'DELETE FROM hash_talk.group_cleanups WHERE group_id=$1',
        [state.groupId],
      );
      this.contacts.changed(
        client,
        state.members.map((m) => m.accountId),
      );
    }
  }
}
