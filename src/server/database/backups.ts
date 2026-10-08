import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { cleanupSelection } from '../../shared/backups/index.ts';
import type { BackupTarget } from '../../shared/backups/index.ts';
import type { MessageProof } from '../../shared/messages/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import { vaultUsage, assertContentCapacity } from './vault-quota.ts';
interface SocialCleanup {
  clean: (
    c: pg.PoolClient,
    account: string,
    item: BackupTarget,
  ) => Promise<number>;
  collect: (c: pg.PoolClient, id: string) => Promise<void>;
}

/** Owns personal removal receipts and coordinates bounded schema-owner transactions. */
export class BackupStore {
  private readonly pool: pg.Pool;
  private readonly contacts: ContactStore;
  private readonly capacity: number;
  private readonly social: SocialCleanup;
  constructor(
    pool: pg.Pool,
    contacts: ContactStore,
    capacity: number,
    social: SocialCleanup,
  ) {
    this.pool = pool;
    this.contacts = contacts;
    this.capacity = capacity;
    this.social = social;
  }
  async page(a: ContactAuthority, after: number) {
    return this.contacts.withMessageAuthority(a, async (c) => {
      const rows = await c.query<{
        kind: string;
        id: string;
        hash: string;
        sequence: string;
        proof: unknown;
      }>(
        'SELECT kind,id,hash,sequence::text,proof FROM hash_talk.personal_removals WHERE account_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 17',
        [a.session.accountId, after],
      );
      const items = rows.rows
        .slice(0, 16)
        .map((r) => ({ ...r, sequence: Number(r.sequence) }));
      return {
        items,
        next: rows.rows.length > 16 ? items.at(-1)?.sequence : null,
      };
    });
  }
  async clean(a: ContactAuthority, proof: MessageProof) {
    const selection = cleanupSelection(proof);
    return this.contacts.withMessageAuthority(a, async (c) => {
      const confirmed = await c.query(
        'SELECT token_hash FROM hash_talk.login_sessions WHERE account_id=$1 AND device_id=$2 AND csrf=$3 AND expires_at>now() AND wallet_confirmed',
        [a.session.accountId, a.session.deviceId, a.session.csrf],
      );
      if (!confirmed.rowCount)
        throw new AccountError(
          403,
          'Confirme a wallet nesta sessão antes de resetar o cofre.',
        );
      const current = await c.query<{ revision: number }>(
        'SELECT revision FROM hash_talk.device_directories WHERE account_id=$1',
        [a.session.accountId],
      );
      if (current.rows[0]?.revision !== selection.revision)
        throw new AccountError(409, 'Autoridade da limpeza mudou.');
      const before = await vaultUsage(c, a.session.accountId);
      let changed = false;
      for (const item of selection.items)
        changed = (await this.removeOne(c, a, item, proof)) || changed;
      if (changed)
        await c.query(
          'INSERT INTO hash_talk.message_heads(account_id,revision) VALUES($1,1) ON CONFLICT(account_id) DO UPDATE SET revision=hash_talk.message_heads.revision+1',
          [a.session.accountId],
        );
      await assertContentCapacity(c, this.capacity);
      const used = await vaultUsage(c, a.session.accountId);
      const receipts = await c.query<{
        kind: string;
        id: string;
        hash: string;
        sequence: string;
        proof: unknown;
      }>(
        'SELECT r.kind,r.id,r.hash,r.sequence::text,r.proof FROM hash_talk.personal_removals r JOIN jsonb_to_recordset($2::jsonb) AS selected(kind text,id uuid) ON selected.kind=r.kind AND selected.id=r.id WHERE r.account_id=$1 ORDER BY r.sequence',
        [a.session.accountId, JSON.stringify(selection.items)],
      );
      return {
        status: 'cleaned',
        used,
        released: Math.max(0, before - used),
        items: receipts.rows.map((r) => ({
          ...r,
          sequence: Number(r.sequence),
        })),
      };
    });
  }
  private async removeOne(
    c: pg.PoolClient,
    a: ContactAuthority,
    item: BackupTarget,
    proof: MessageProof,
  ): Promise<boolean> {
    const account = a.session.accountId;
    const prior = await c.query<{ hash: string }>(
      'SELECT hash FROM hash_talk.personal_removals WHERE account_id=$1 AND kind=$2 AND id=$3',
      [account, item.kind, item.id],
    );
    if (prior.rows.length) {
      if (prior.rows[0]?.hash !== item.hash)
        throw new AccountError(409, 'Seleção de limpeza divergente.');
      return false;
    }
    const retained =
      item.kind === 'vault'
        ? await this.cleanVault(c, account, item)
        : item.kind === 'dm-message'
          ? await this.social.clean(c, account, item)
          : await this.cleanMessage(c, account, item);
    await c.query(
      'INSERT INTO hash_talk.personal_removals(account_id,kind,id,hash,proof,retained_bytes,charge) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',
      [
        account,
        item.kind,
        item.id,
        item.hash,
        JSON.stringify(proof),
        retained,
        retained + Buffer.byteLength(JSON.stringify(proof)) + 512,
      ],
    );
    if (item.kind === 'message') await this.collectMessage(c, item.id);
    if (item.kind === 'dm-message') await this.social.collect(c, item.id);
    if (item.kind === 'message') this.contacts.removed(c, [account]);
    else this.contacts.changed(c, [account]);
    return true;
  }
  private async cleanVault(
    c: pg.PoolClient,
    account: string,
    item: BackupTarget,
  ): Promise<number> {
    const row = await c.query<{ hash: string; bytes: number }>(
      "SELECT hash,(commit->'block'->>'bytes')::integer AS bytes FROM hash_talk.vault_operations WHERE account_id=$1 AND id=$2 AND state='accepted' FOR UPDATE",
      [account, item.id],
    );
    const v = row.rows[0];
    if (!v || v.hash !== item.hash)
      throw new AccountError(409, 'Versão do cofre ausente ou divergente.');
    await c.query(
      'UPDATE hash_talk.vault_operations SET charge=charge-$3 WHERE account_id=$1 AND id=$2',
      [account, item.id, v.bytes],
    );
    return v.bytes;
  }
  private async cleanMessage(
    c: pg.PoolClient,
    account: string,
    item: BackupTarget,
  ): Promise<number> {
    const row = await c.query<{
      hash: string;
      sender: string;
      recipient: string;
      body: unknown;
    }>(
      'SELECT hash,sender,recipient,body FROM hash_talk.message_packets WHERE id=$1 FOR UPDATE',
      [item.id],
    );
    const m = row.rows[0];
    if (
      !m ||
      !m.body ||
      m.hash !== item.hash ||
      ![m.sender, m.recipient].includes(account)
    )
      throw new AccountError(409, 'Mensagem ausente ou divergente.');
    await c.query(
      `UPDATE hash_talk.message_packets SET sender_charge=CASE WHEN sender=$2 THEN 0 ELSE sender_charge END,recipient_charge=CASE WHEN recipient=$2 THEN 0 ELSE recipient_charge END WHERE id=$1 OR relation->>'id'=$1::text`,
      [item.id, account],
    );
    await c.query(
      `WITH removed AS (DELETE FROM hash_talk.message_references WHERE account_id=$2 AND message_id IN (SELECT id FROM hash_talk.message_packets WHERE id=$1 OR relation->>'id'=$1::text) RETURNING message_id), counts AS (SELECT message_id,count(*)::integer AS n FROM removed GROUP BY message_id) UPDATE hash_talk.message_packets m SET charge=m.charge-counts.n*256 FROM counts WHERE m.id=counts.message_id`,
      [item.id, account],
    );
    await c.query(
      `DELETE FROM hash_talk.message_reads WHERE account_id=$2 AND message_id IN (SELECT id FROM hash_talk.message_packets WHERE id=$1 OR relation->>'id'=$1::text)`,
      [item.id, account],
    );
    await c.query(
      `UPDATE hash_talk.message_packets m SET queue_active=false WHERE (id=$1 OR relation->>'id'=$1::text) AND queue_active AND NOT EXISTS(SELECT 1 FROM hash_talk.message_references r WHERE r.message_id=m.id AND r.status='pending')`,
      [item.id],
    );
    return 0;
  }
  private async collectMessage(c: pg.PoolClient, id: string): Promise<void> {
    const result = await c.query(
      "UPDATE hash_talk.message_packets m SET body=NULL,personal_collected=true,queue_active=false,charge=4096 WHERE id=$1 AND body IS NOT NULL AND (SELECT count(*) FROM hash_talk.personal_removals r WHERE r.kind='message' AND r.id=m.id AND r.account_id IN (m.sender,m.recipient))=2",
      [id],
    );
    if (result.rowCount)
      await c.query(
        `UPDATE hash_talk.message_packets SET body=NULL,personal_collected=true,queue_active=false,charge=4096 WHERE relation->>'id'=$1::text AND body IS NOT NULL`,
        [id],
      );
    if (result.rowCount)
      await c.query(
        "UPDATE hash_talk.message_attachments SET status='deleting' WHERE message_id=$1 AND status='accepted'",
        [id],
      );
  }
  async garbage() {
    return (
      await this.pool.query<{
        account_id: string;
        id: string;
        object_hash: string;
      }>(
        "SELECT r.account_id,r.id,v.object_hash FROM hash_talk.personal_removals r JOIN hash_talk.vault_operations v ON v.account_id=r.account_id AND v.id=r.id WHERE r.kind='vault' AND r.retained_bytes>0 ORDER BY r.sequence LIMIT 8",
      )
    ).rows;
  }
  async nextCollection(): Promise<number | null> {
    const result = await this.pool.query(
      "SELECT 1 FROM hash_talk.personal_removals WHERE kind='vault' AND retained_bytes>0 LIMIT 1",
    );
    return result.rowCount ? Date.now() : null;
  }
  async collected(account: string, id: string): Promise<void> {
    await this.pool.query(
      "UPDATE hash_talk.personal_removals SET charge=charge-retained_bytes,retained_bytes=0 WHERE account_id=$1 AND kind='vault' AND id=$2 AND retained_bytes>0",
      [account, id],
    );
  }
}
