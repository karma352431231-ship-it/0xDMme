import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type {
  DailyPreferences,
  PushRegistration,
} from '../../shared/daily/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import { assertContentCapacity, assertVaultQuota } from './vault-quota.ts';

export interface PushJob {
  account_id: string;
  device_id: string;
  generation: string;
  subscription: PushRegistration;
  attempts: number;
}
const eligible = `EXISTS(SELECT 1 FROM hash_talk.message_packets m
  LEFT JOIN hash_talk.conversation_controls cc ON cc.account_id=s.account_id AND cc.peer=m.sender
  WHERE m.recipient=s.account_id AND m.body IS NOT NULL AND m.kind<>'profile' AND m.relation IS NULL
  AND NOT EXISTS(SELECT 1 FROM hash_talk.message_reads mr WHERE mr.account_id=m.recipient AND mr.message_id=m.id) AND coalesce(cc.muted_until,0)<=(extract(epoch FROM now())*1000)::bigint
  AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals pr WHERE pr.account_id=s.account_id AND pr.kind='message' AND pr.id=m.id)
  AND EXISTS(SELECT 1 FROM hash_talk.contact_relations cr WHERE cr.lo=least(m.sender,m.recipient) AND cr.hi=greatest(m.sender,m.recipient) AND cr.state='approved'))`;
const authorizedDevice = `EXISTS(SELECT 1 FROM hash_talk.device_directories d,jsonb_array_elements(d.event->'devices') member WHERE d.account_id=s.account_id AND member->>'id'=s.device_id::text)`;
export class DailyStore {
  private readonly pool: pg.Pool;
  private readonly contacts: ContactStore;
  private readonly capacity: number;
  constructor(pool: pg.Pool, contacts: ContactStore, capacity: number) {
    this.pool = pool;
    this.contacts = contacts;
    this.capacity = capacity;
  }
  private async budget(c: pg.PoolClient, account: string): Promise<void> {
    await assertVaultQuota(c, account);
    await assertContentCapacity(c, this.capacity);
  }
  async configure(
    a: ContactAuthority,
    revision: number,
    preferences: DailyPreferences,
  ): Promise<void> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      const row = await c.query<{ profile_revision: number }>(
        'SELECT profile_revision FROM hash_talk.accounts WHERE id=$1',
        [a.session.accountId],
      );
      if (row.rows[0]?.profile_revision !== revision)
        throw new AccountError(
          409,
          'Perfil mudou; recarregue suas preferências.',
        );
      await c.query(
        `INSERT INTO hash_talk.daily_controls(account_id,profile_revision,online,last_seen,read_receipts) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(account_id) DO UPDATE SET profile_revision=$2,online=$3,last_seen=$4,read_receipts=$5,receipt_epoch=CASE WHEN NOT $5 AND hash_talk.daily_controls.read_receipts THEN hash_talk.daily_controls.receipt_epoch+1 ELSE hash_talk.daily_controls.receipt_epoch END,seen_at=CASE WHEN $4 THEN hash_talk.daily_controls.seen_at ELSE NULL END,revision=hash_talk.daily_controls.revision+1
        WHERE (hash_talk.daily_controls.profile_revision,hash_talk.daily_controls.online,hash_talk.daily_controls.last_seen,hash_talk.daily_controls.read_receipts) IS DISTINCT FROM ($2,$3,$4,$5)`,
        [
          a.session.accountId,
          revision,
          preferences.online,
          preferences.lastSeen,
          preferences.readReceipts,
        ],
      );
      if (!preferences.online)
        await c.query(
          'DELETE FROM hash_talk.device_presence WHERE account_id=$1',
          [a.session.accountId],
        );
      await this.budget(c, a.session.accountId);
    });
  }
  async state(a: ContactAuthority, peer: string) {
    const rows = await this.states(a, [peer]);
    if (!rows.length) throw new AccountError(404, 'Contato indisponível.');
    return rows[0];
  }
  async states(a: ContactAuthority, peers: string[]): Promise<unknown[]> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      const rows = await c.query(
        `SELECT root.peer,coalesce(cc.revision,0) AS revision,coalesce(cc.muted_until,0)::text AS "mutedUntil",
        (SELECT count(*)::integer FROM hash_talk.message_packets m WHERE m.sender=root.peer AND m.recipient=$1 AND m.kind<>'profile' AND m.relation IS NULL AND m.body IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hash_talk.message_reads mr WHERE mr.account_id=m.recipient AND mr.message_id=m.id) AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals pr WHERE pr.account_id=$1 AND pr.kind='message' AND pr.id=m.id)) AS unread,
        coalesce(dc.online,false) AND EXISTS(SELECT 1 FROM hash_talk.device_presence p JOIN hash_talk.device_directories d ON d.account_id=p.account_id WHERE p.account_id=root.peer AND p.expires_at>now() AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.event->'devices') member WHERE member->>'id'=p.device_id::text)) AS online,
        CASE WHEN dc.last_seen THEN dc.seen_at ELSE NULL END AS "lastSeen"
        FROM unnest($2::uuid[]) root(peer) LEFT JOIN hash_talk.conversation_controls cc ON cc.account_id=$1 AND cc.peer=root.peer LEFT JOIN hash_talk.daily_controls dc ON dc.account_id=root.peer WHERE EXISTS(SELECT 1 FROM hash_talk.contact_relations cr WHERE cr.lo=least($1::uuid,root.peer) AND cr.hi=greatest($1::uuid,root.peer) AND cr.state='approved')`,
        [a.session.accountId, peers],
      );
      return rows.rows as unknown[];
    });
  }
  async mute(
    a: ContactAuthority,
    peer: string,
    input: { revision: number; mutedUntil: number },
  ): Promise<void> {
    return this.contacts.withMessageConsent(a, peer, async (c) => {
      const r = await c.query<{ revision: number }>(
        'SELECT revision FROM hash_talk.conversation_controls WHERE account_id=$1 AND peer=$2',
        [a.session.accountId, peer],
      );
      if ((r.rows[0]?.revision ?? 0) !== input.revision)
        throw new AccountError(409, 'Mute mudou em outro aparelho; atualize.');
      await c.query(
        `INSERT INTO hash_talk.conversation_controls(account_id,peer,revision,muted_until) VALUES($1,$2,1,$3) ON CONFLICT(account_id,peer) DO UPDATE SET revision=hash_talk.conversation_controls.revision+1,muted_until=$3 WHERE hash_talk.conversation_controls.muted_until<>$3`,
        [a.session.accountId, peer, input.mutedUntil],
      );
      await this.budget(c, a.session.accountId);
    });
  }
  async heartbeat(a: ContactAuthority, active: boolean): Promise<void> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      const result = await c.query<{ online: boolean; last_seen: boolean }>(
        'SELECT online,last_seen FROM hash_talk.daily_controls WHERE account_id=$1',
        [a.session.accountId],
      );
      const prefs = result.rows[0];
      if (active && prefs?.last_seen)
        await c.query(
          "UPDATE hash_talk.daily_controls SET seen_at=now() WHERE account_id=$1 AND (seen_at IS NULL OR seen_at<now()-interval '25 seconds')",
          [a.session.accountId],
        );
      if (active && prefs?.online)
        await c.query(
          `INSERT INTO hash_talk.device_presence(account_id,device_id,expires_at) VALUES($1,$2,now()+interval '75 seconds') ON CONFLICT(account_id,device_id) DO UPDATE SET expires_at=excluded.expires_at WHERE hash_talk.device_presence.expires_at<now()+interval '45 seconds'`,
          [a.session.accountId, a.session.deviceId],
        );
      else
        await c.query(
          'DELETE FROM hash_talk.device_presence WHERE account_id=$1 AND device_id=$2',
          [a.session.accountId, a.session.deviceId],
        );
      await this.budget(c, a.session.accountId);
    });
  }
  async read(a: ContactAuthority, peer: string, ids: string[]): Promise<void> {
    return this.contacts.withMessageConsent(a, peer, async (c) => {
      const m = await c.query(
        `SELECT m.id FROM hash_talk.message_packets m JOIN hash_talk.message_references r ON r.message_id=m.id AND r.account_id=$1 AND r.device_id=$3 AND r.status='received' WHERE m.id=ANY($4::uuid[]) AND m.sender=$2 AND m.recipient=$1 AND m.body IS NOT NULL AND m.relation IS NULL AND m.kind<>'profile' AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals pr WHERE pr.account_id=$1 AND pr.kind='message' AND pr.id=m.id)`,
        [a.session.accountId, peer, a.session.deviceId, ids],
      );
      if (m.rows.length !== new Set(ids).size)
        throw new AccountError(
          409,
          'Leitura exige mensagens recebidas e preservadas neste aparelho.',
        );
      const updated = await c.query<{ share_epoch: number | null }>(
        `INSERT INTO hash_talk.message_reads(account_id,message_id,share_epoch) SELECT $1,unnest($2::uuid[]),CASE WHEN dc.read_receipts THEN dc.receipt_epoch ELSE NULL END FROM (SELECT 1) root LEFT JOIN hash_talk.daily_controls dc ON dc.account_id=$1 ON CONFLICT(account_id,message_id) DO UPDATE SET share_epoch=excluded.share_epoch WHERE hash_talk.message_reads.share_epoch IS DISTINCT FROM excluded.share_epoch RETURNING share_epoch`,
        [a.session.accountId, ids],
      );
      await this.budget(c, a.session.accountId);
      if (updated.rowCount) this.contacts.changed(c, [a.session.accountId]);
      if (updated.rows.some((row) => row.share_epoch !== null))
        this.contacts.changed(c, [peer]);
    });
  }
  async receipts(a: ContactAuthority, ids: string[]): Promise<string[]> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      const rows = await c.query<{ id: string }>(
        `SELECT m.id FROM hash_talk.message_packets m JOIN hash_talk.message_reads r ON r.message_id=m.id AND r.account_id=m.recipient JOIN hash_talk.daily_controls dc ON dc.account_id=m.recipient AND dc.read_receipts AND dc.receipt_epoch=r.share_epoch WHERE m.sender=$1 AND m.id=ANY($2::uuid[]) AND m.body IS NOT NULL AND EXISTS(SELECT 1 FROM hash_talk.contact_relations cr WHERE cr.lo=least(m.sender,m.recipient) AND cr.hi=greatest(m.sender,m.recipient) AND cr.state='approved')`,
        [a.session.accountId, ids],
      );
      return rows.rows.map((row) => row.id);
    });
  }
  async subscribe(
    a: ContactAuthority,
    subscription: PushRegistration | null,
  ): Promise<void> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      if (!subscription) {
        await c.query(
          'DELETE FROM hash_talk.push_subscriptions WHERE account_id=$1 AND device_id=$2',
          [a.session.accountId, a.session.deviceId],
        );
        return;
      }
      const claimed = await c.query(
        'SELECT 1 FROM hash_talk.push_subscriptions WHERE endpoint=$1 AND (account_id<>$2 OR device_id<>$3)',
        [subscription.endpoint, a.session.accountId, a.session.deviceId],
      );
      if (claimed.rowCount)
        throw new AccountError(
          409,
          'Inscrição já vinculada; remova-a na conta anterior.',
        );
      const text = JSON.stringify(subscription);
      await c.query(
        `INSERT INTO hash_talk.push_subscriptions(account_id,device_id,endpoint,subscription,charge) VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(account_id,device_id) DO UPDATE SET endpoint=$3,subscription=$4::jsonb,charge=$5,attempts=0 WHERE hash_talk.push_subscriptions.subscription<>$4::jsonb`,
        [
          a.session.accountId,
          a.session.deviceId,
          subscription.endpoint,
          text,
          Buffer.byteLength(text) + 512,
        ],
      );
      await this.budget(c, a.session.accountId);
    });
  }
  async check(a: ContactAuthority): Promise<boolean> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      const r = await c.query(
        `SELECT 1 FROM hash_talk.push_subscriptions s WHERE s.account_id=$1 AND s.device_id=$2 AND ${authorizedDevice} AND ${eligible}`,
        [a.session.accountId, a.session.deviceId],
      );
      return Boolean(r.rowCount);
    });
  }
  async jobs(): Promise<PushJob[]> {
    await this.pool.query(
      `DELETE FROM hash_talk.device_presence WHERE (account_id,device_id) IN (SELECT account_id,device_id FROM hash_talk.device_presence WHERE expires_at<now() LIMIT 16)`,
    );
    await this.pool.query(
      `DELETE FROM hash_talk.push_subscriptions s WHERE (s.account_id,s.device_id) IN (SELECT s.account_id,s.device_id FROM hash_talk.push_subscriptions s WHERE NOT ${authorizedDevice} LIMIT 16)`,
    );
    return (
      await this.pool.query<PushJob>(
        `SELECT account_id,device_id,generation::text,subscription,attempts FROM hash_talk.push_subscriptions s WHERE pending AND attempts<3 AND next_attempt<=now() ORDER BY next_attempt LIMIT 16`,
      )
    ).rows;
  }
  async eligible(job: PushJob): Promise<boolean> {
    return Boolean(
      (
        await this.pool.query(
          `SELECT 1 FROM hash_talk.push_subscriptions s WHERE s.account_id=$1 AND s.device_id=$2 AND s.generation=$3 AND ${authorizedDevice} AND ${eligible}`,
          [job.account_id, job.device_id, job.generation],
        )
      ).rowCount,
    );
  }
  async finish(
    job: PushJob,
    outcome: 'sent' | 'retry' | 'gone',
  ): Promise<void> {
    const args = [job.account_id, job.device_id, job.generation];
    if (outcome === 'gone') {
      await this.pool.query(
        'DELETE FROM hash_talk.push_subscriptions WHERE account_id=$1 AND device_id=$2 AND generation=$3',
        args,
      );
      return;
    }
    await this.pool.query(
      `UPDATE hash_talk.push_subscriptions SET pending=CASE WHEN $4='retry' AND attempts<2 THEN true ELSE false END,attempts=CASE WHEN $4='retry' THEN least(attempts+1,3) ELSE 0 END,next_attempt=now()+interval '60 seconds' WHERE account_id=$1 AND device_id=$2 AND generation=$3`,
      [...args, outcome],
    );
  }
}
/** Called inside message admission: one coalesced marker per subscribed device. */
export async function enqueuePush(
  c: pg.PoolClient,
  recipient: string,
  sender: string,
): Promise<void> {
  await c.query(
    `UPDATE hash_talk.push_subscriptions SET pending=true,generation=generation+1,attempts=0 WHERE account_id=$1 AND NOT EXISTS(SELECT 1 FROM hash_talk.conversation_controls cc WHERE cc.account_id=$1 AND cc.peer=$2 AND cc.muted_until>(extract(epoch FROM now())*1000)::bigint)`,
    [recipient, sender],
  );
}
