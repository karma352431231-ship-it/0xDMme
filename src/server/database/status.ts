import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import {
  statusPacket,
  statusEnvelope,
  statusEnvelopes,
  statusAudienceHead,
  statusEnvelopeHash,
  verifyStatusPacket,
  verifyStatusEnvelope,
  statusLifetime,
} from '../../shared/status/index.ts';
import type {
  StatusPacket,
  StatusEnvelope,
} from '../../shared/status/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { DeviceStore } from './devices.ts';
import type { MessageRecoveryStore } from './message-recovery.ts';
import { assertVaultQuota, assertContentCapacity } from './vault-quota.ts';
export interface StatusRow {
  id: string;
  author: string;
  device_id: string;
  directory: string;
  contact_revision: number;
  content_hash: string | null;
  audience_head: string | null;
  pages: number;
  audience_count: number;
  state: 'draft' | 'published' | 'deleting';
  body: unknown;
  hash: string | null;
  published_at: Date | null;
  expires_at: Date | null;
}
interface StatusServices {
  devices: DeviceStore;
  recovery: MessageRecoveryStore;
  capacity: number;
}
function unavailable(): never {
  throw new AccountError(404, 'Status indisponível ou expirado.');
}
/** Owns frozen publication ACLs. Media operations coordinate through the explicit transaction contracts below. */
export class StatusStore {
  private readonly pool: pg.Pool;
  private readonly contacts: ContactStore;
  private readonly services: StatusServices;
  private after: string | null = null;
  constructor(pool: pg.Pool, contacts: ContactStore, services: StatusServices) {
    this.pool = pool;
    this.contacts = contacts;
    this.services = services;
  }
  private async row(client: pg.PoolClient, id: string): Promise<StatusRow> {
    const result = await client.query<StatusRow>(
      'SELECT * FROM hash_talk.status_posts WHERE id=$1 FOR UPDATE',
      [id],
    );
    return result.rows[0] ?? unavailable();
  }
  private owned(row: StatusRow, a: ContactAuthority): void {
    if (row.author !== a.session.accountId) unavailable();
  }
  private async draft(
    client: pg.PoolClient,
    a: ContactAuthority,
    id: string,
  ): Promise<StatusRow> {
    const row = await this.row(client, id);
    this.owned(row, a);
    if (
      row.state !== 'draft' ||
      row.device_id !== a.session.deviceId ||
      row.directory !== a.directory
    )
      throw new AccountError(409, 'Publicação ou aparelho mudou.');
    if (
      row.contact_revision !==
      (await this.contacts.publicationRevision(client, row.author))
    )
      throw new AccountError(
        409,
        'Contatos mudaram durante a publicação. Confira a audiência e tente novamente.',
      );
    return row;
  }
  async withDraft<T>(
    a: ContactAuthority,
    id: string,
    work: (client: pg.PoolClient, row: StatusRow) => Promise<T>,
  ): Promise<T> {
    return this.contacts.withMessageAuthority(a, async (client) =>
      work(client, await this.draft(client, a, id)),
    );
  }
  async withReadable<T>(
    a: ContactAuthority,
    id: string,
    work: (client: pg.PoolClient, row: StatusRow) => Promise<T>,
  ): Promise<T> {
    return this.contacts.withMessageAuthority(a, async (client) => {
      const row = await this.row(client, id);
      if (
        row.state !== 'published' ||
        !row.expires_at ||
        row.expires_at.getTime() <= Date.now()
      )
        unavailable();
      const audience = await client.query(
        'SELECT 1 FROM hash_talk.status_recipients WHERE status_id=$1 AND account_id=$2',
        [id, a.session.accountId],
      );
      if (!audience.rowCount) unavailable();
      if (
        row.author !== a.session.accountId &&
        (
          await this.contacts.messageBlockedBatch(client, a.session.accountId, [
            row.author,
          ])
        ).has(row.author)
      )
        unavailable();
      return work(client, row);
    });
  }
  async begin(a: ContactAuthority, id: string): Promise<unknown> {
    return this.contacts.withMessageAuthority(a, async (client) => {
      const existing = await client.query<StatusRow>(
        'SELECT * FROM hash_talk.status_posts WHERE id=$1',
        [id],
      );
      if (existing.rows[0]) {
        this.owned(existing.rows[0], a);
        return this.summary(existing.rows[0]);
      }
      const pending = await client.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM hash_talk.status_posts WHERE author=$1 AND state='draft'",
        [a.session.accountId],
      );
      if ((pending.rows[0]?.count ?? 0) >= 4)
        throw new AccountError(
          429,
          'Conclua ou cancele as publicações em andamento.',
        );
      const revision = await this.contacts.publicationRevision(
        client,
        a.session.accountId,
      );
      const result = await client.query<StatusRow>(
        'INSERT INTO hash_talk.status_posts(id,author,device_id,directory,contact_revision) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [id, a.session.accountId, a.session.deviceId, a.directory, revision],
      );
      await assertVaultQuota(client, a.session.accountId);
      await assertContentCapacity(client, this.services.capacity);
      const row = result.rows[0];
      if (!row) throw new Error('Publicação não persistida.');
      return this.summary(row);
    });
  }
  private summary(row: StatusRow) {
    return {
      id: row.id,
      state: row.state,
      head: row.audience_head,
      pages: row.pages,
      count: row.audience_count,
      publishedAt: row.published_at?.getTime() ?? null,
    };
  }
  async contactsPage(
    a: ContactAuthority,
    input: { id: string; after: string | null },
  ): Promise<unknown> {
    return this.withDraft(a, input.id, async (client, row) =>
      this.contacts.publicationContacts(client, row.author, input.after),
    );
  }
  async recipientDirectory(
    a: ContactAuthority,
    input: { id: string; accounts: { accountId: string; after: number }[] },
  ): Promise<unknown> {
    return this.withDraft(a, input.id, async (client, row) => {
      const targets = input.accounts
        .map((r) => r.accountId)
        .filter((id) => id !== row.author);
      const allowed = await this.contacts.messageDeliveryBatch(
        client,
        row.author,
        targets,
      );
      if (targets.some((id) => !allowed.has(id))) unavailable();
      return {
        directories: await this.services.devices.historyBatch(
          client,
          input.accounts,
        ),
        recovery: await this.services.recovery.currentBatch(
          client,
          input.accounts.map((r) => r.accountId),
        ),
      };
    });
  }
  async append(
    a: ContactAuthority,
    input: {
      id: string;
      page: number;
      previous: string | null;
      envelopes: StatusEnvelope[];
    },
  ): Promise<unknown> {
    const envelopes = statusEnvelopes(input.envelopes),
      hash = await digest(canonical(envelopes)),
      head = await statusAudienceHead(input.previous, envelopes);
    return this.withDraft(a, input.id, async (client, row) => {
      const existing = await client.query<{
        hash: string;
        head: string;
        count: number;
      }>(
        'SELECT hash,head,count FROM hash_talk.status_pages WHERE status_id=$1 AND page=$2',
        [input.id, input.page],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].hash !== hash || existing.rows[0].head !== head)
          throw new AccountError(
            409,
            'Página de audiência repetida divergente.',
          );
        return { head, count: row.audience_count, pages: row.pages };
      }
      if (
        row.pages + 1 !== input.page ||
        row.audience_head !== input.previous ||
        row.published_at
      )
        throw new AccountError(409, 'Audiência mudou ou já foi finalizada.');
      const contentHash = await this.validateEnvelopes(client, a, {
        row,
        envelopes,
      });
      await this.saveEnvelopes(client, envelopes);
      await client.query(
        'INSERT INTO hash_talk.status_pages(status_id,page,author,previous,head,hash,count) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          row.id,
          input.page,
          row.author,
          input.previous,
          head,
          hash,
          envelopes.length,
        ],
      );
      await client.query(
        'UPDATE hash_talk.status_posts SET audience_head=$2,pages=$3,audience_count=audience_count+$4,content_hash=$5 WHERE id=$1',
        [row.id, head, input.page, envelopes.length, contentHash],
      );
      await assertVaultQuota(client, row.author);
      await assertContentCapacity(client, this.services.capacity);
      return {
        head,
        count: row.audience_count + envelopes.length,
        pages: input.page,
      };
    });
  }
  private async validateEnvelopes(
    client: pg.PoolClient,
    a: ContactAuthority,
    input: { row: StatusRow; envelopes: StatusEnvelope[] },
  ): Promise<string> {
    const accounts = input.envelopes.map((e) => e.recipient.accountId);
    await this.services.devices.lockDirectories(client, accounts);
    const allowed = await this.contacts.messageDeliveryBatch(
      client,
      input.row.author,
      accounts.filter((id) => id !== input.row.author),
    );
    const origin = await this.services.devices.currentInTransaction(
      client,
      input.row.author,
    );
    const contentHash = input.envelopes[0]?.contentHash;
    if (!contentHash) throw new Error('Audiência vazia.');
    if (input.row.content_hash && input.row.content_hash !== contentHash)
      unavailable();
    for (const e of input.envelopes) {
      this.assertEnvelopeOrigin(e, input.row, a, contentHash);
      if (
        e.recipient.accountId !== input.row.author &&
        !allowed.has(e.recipient.accountId)
      )
        unavailable();
      await verifyStatusEnvelope(e, origin);
    }
    const request = input.envelopes.map((e) => ({
      account: e.recipient.accountId,
      directory: e.recipient.directory,
      revision: e.recipient.authorityRevision,
      key_id: e.recipient.archive.keyId,
    }));
    const matches = await client.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM jsonb_to_recordset($1::jsonb) AS r(account uuid,directory text,revision integer,key_id uuid) JOIN hash_talk.device_directories d ON d.account_id=r.account AND d.head=r.directory AND d.revision=r.revision JOIN hash_talk.message_recovery_keys k ON k.account_id=r.account AND k.id=r.key_id AND k.epoch=(d.event->>'epoch')::integer`,
      [JSON.stringify(request)],
    );
    if (matches.rows[0]?.count !== request.length)
      throw new AccountError(
        409,
        'Chaves do destinatário mudaram. Confira novamente.',
      );
    return contentHash;
  }
  private assertEnvelopeOrigin(
    envelope: StatusEnvelope,
    row: StatusRow,
    a: ContactAuthority,
    contentHash: string,
  ): void {
    if (
      envelope.id !== row.id ||
      envelope.author !== row.author ||
      envelope.deviceId !== a.session.deviceId ||
      envelope.directory !== a.directory ||
      envelope.contentHash !== contentHash
    )
      unavailable();
  }
  private async saveEnvelopes(
    client: pg.PoolClient,
    envelopes: StatusEnvelope[],
  ): Promise<void> {
    const duplicates = await client.query(
      'SELECT 1 FROM hash_talk.status_recipients WHERE status_id=$1 AND account_id=ANY($2::uuid[])',
      [envelopes[0]?.id, envelopes.map((e) => e.recipient.accountId)],
    );
    if (duplicates.rowCount)
      throw new AccountError(409, 'Destinatário já incluído nesta publicação.');
    const rows = await Promise.all(
      envelopes.map(async (e) => ({
        status_id: e.id,
        account_id: e.recipient.accountId,
        author: e.author,
        envelope: e,
        hash: await statusEnvelopeHash(e),
        charge: Buffer.byteLength(JSON.stringify(e)) + 512,
      })),
    );
    await client.query(
      'INSERT INTO hash_talk.status_recipients(status_id,account_id,author,envelope,hash,charge) SELECT status_id,account_id,author,envelope,hash,charge FROM jsonb_to_recordset($1::jsonb) AS r(status_id uuid,account_id uuid,author uuid,envelope jsonb,hash text,charge integer)',
      [JSON.stringify(rows)],
    );
  }
  async ready(a: ContactAuthority, id: string): Promise<unknown> {
    return this.withDraft(a, id, async (client, row) => {
      const own = await client.query(
        'SELECT 1 FROM hash_talk.status_recipients WHERE status_id=$1 AND account_id=$2',
        [id, row.author],
      );
      if (!own.rowCount || !row.audience_head)
        throw new AccountError(
          409,
          'Recuperação do autor e audiência ainda não preservadas.',
        );
      if (row.published_at) return this.summary(row);
      const publishedAt = new Date(Date.now()),
        expires = new Date(publishedAt.getTime() + statusLifetime);
      const result = await client.query<StatusRow>(
        'UPDATE hash_talk.status_posts SET published_at=$2,expires_at=$3 WHERE id=$1 RETURNING *',
        [id, publishedAt, expires],
      );
      const saved = result.rows[0];
      if (!saved) throw new Error('Data de publicação não persistida.');
      return this.summary(saved);
    });
  }
  async publish(
    a: ContactAuthority,
    input: StatusPacket,
    admitMedia: (client: pg.PoolClient, packet: StatusPacket) => Promise<void>,
  ): Promise<unknown> {
    const packet = statusPacket(input),
      hash = await digest(canonical(packet));
    return this.contacts.withMessageAuthority(a, async (client) => {
      const row = await this.row(client, packet.id);
      this.owned(row, a);
      if (row.state === 'published' && row.hash === hash)
        return { status: 'published', hash };
      const draft = await this.draft(client, a, packet.id);
      await this.validatePublication(client, a, { draft, packet });
      await admitMedia(client, packet);
      const body = JSON.stringify(packet);
      await client.query(
        "UPDATE hash_talk.status_posts SET state='published',body=$2::jsonb,hash=$3,charge=$4,notice_pending=true,notice_after=NULL WHERE id=$1",
        [packet.id, body, hash, Buffer.byteLength(body) + 512],
      );
      await assertVaultQuota(client, draft.author);
      await assertContentCapacity(client, this.services.capacity);
      // The signal dispatcher pages recipient hints immediately after this commit.
      this.contacts.changed(client, [draft.author]);
      return { status: 'published', hash };
    });
  }
  private async validatePublication(
    client: pg.PoolClient,
    a: ContactAuthority,
    input: { draft: StatusRow; packet: StatusPacket },
  ): Promise<void> {
    const { draft, packet } = input;
    if (
      packet.author !== a.session.accountId ||
      packet.deviceId !== a.session.deviceId ||
      packet.directory !== a.directory ||
      packet.audienceHead !== draft.audience_head ||
      packet.publishedAt !== draft.published_at?.getTime() ||
      !draft.expires_at ||
      draft.expires_at.getTime() <= Date.now() ||
      (await digest(canonical(packet.content))) !== draft.content_hash
    )
      throw new AccountError(
        409,
        'Publicação diverge da audiência ou do conteúdo preparado.',
      );
    await verifyStatusPacket(
      packet,
      await this.services.devices.currentInTransaction(client, draft.author),
    );
  }
  async read(a: ContactAuthority, id: string): Promise<unknown> {
    return this.withReadable(a, id, async (client, row) => {
      const result = await client.query<{ envelope: unknown }>(
        'SELECT envelope FROM hash_talk.status_recipients WHERE status_id=$1 AND account_id=$2',
        [id, a.session.accountId],
      );
      const envelope = result.rows[0]?.envelope;
      if (!envelope) unavailable();
      return {
        packet: statusPacket(row.body),
        envelope: statusEnvelope(envelope),
      };
    });
  }
  async origin(
    a: ContactAuthority,
    input: { id: string; after: number },
  ): Promise<unknown> {
    return this.withReadable(a, input.id, async (client, row) => {
      const histories = await this.services.devices.historyBatch(client, [
        { accountId: row.author, after: input.after },
      ]);
      return histories[0] ?? unavailable();
    });
  }
  async list(a: ContactAuthority, after: string | null): Promise<unknown> {
    return this.contacts.withMessageAuthority(a, async (client) => {
      const rows = await client.query<{
        id: string;
        author: string;
        published_at: Date;
        expires_at: Date;
        kind: string;
      }>(
        "SELECT p.id,p.author,p.published_at,p.expires_at,p.body->>'kind' AS kind FROM hash_talk.status_posts p JOIN hash_talk.status_recipients r ON r.status_id=p.id AND r.account_id=$1 WHERE p.state='published' AND p.expires_at>clock_timestamp() AND ($2::uuid IS NULL OR p.id>$2) ORDER BY p.id LIMIT 16",
        [a.session.accountId, after],
      );
      const denied = await this.contacts.messageBlockedBatch(
        client,
        a.session.accountId,
        [
          ...new Set(
            rows.rows
              .map((r) => r.author)
              .filter((id) => id !== a.session.accountId),
          ),
        ],
      );
      return {
        items: rows.rows
          .filter((r) => !denied.has(r.author))
          .map((r) => ({
            id: r.id,
            author: r.author,
            publishedAt: r.published_at.getTime(),
            expiresAt: r.expires_at.getTime(),
            kind: r.kind,
          })),
        next: rows.rows.at(-1)?.id ?? null,
      };
    });
  }
  async remove(a: ContactAuthority, id: string): Promise<void> {
    await this.contacts.withMessageAuthority(a, async (client) => {
      const row = await this.row(client, id);
      this.owned(row, a);
      if (row.state === 'deleting') return;
      await client.query(
        "UPDATE hash_talk.status_posts SET state='deleting',body=NULL,charge=512,notice_pending=true,notice_after=NULL WHERE id=$1",
        [id],
      );
      this.contacts.changed(client, [row.author]);
    });
  }
  async garbage(): Promise<{ id: string }[]> {
    const candidates = await this.pool.query<{ id: string }>(
      "SELECT id FROM hash_talk.status_posts WHERE (state='deleting' OR expires_at<=clock_timestamp() OR (state='draft' AND created_at<=clock_timestamp()-interval '24 hours')) AND ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 4",
      [this.after],
    );
    this.after = candidates.rows.at(-1)?.id ?? null;
    const retired: { id: string }[] = [];
    for (const candidate of candidates.rows) {
      const done = await this.contacts.withMaintenance(async (client) => {
        const row = await this.row(client, candidate.id);
        await client.query(
          "UPDATE hash_talk.status_posts SET state='deleting',body=NULL,charge=512 WHERE id=$1 AND state<>'deleting'",
          [row.id],
        );
        const viewers = await client.query<{ account_id: string }>(
          'SELECT account_id FROM hash_talk.status_recipients WHERE status_id=$1 ORDER BY account_id LIMIT 64',
          [row.id],
        );
        this.contacts.changed(
          client,
          viewers.rows.map((r) => r.account_id),
        );
        await client.query(
          'DELETE FROM hash_talk.status_recipients WHERE (status_id,account_id) IN (SELECT status_id,account_id FROM hash_talk.status_recipients WHERE status_id=$1 ORDER BY account_id LIMIT 64)',
          [row.id],
        );
        await client.query(
          'DELETE FROM hash_talk.status_pages WHERE (status_id,page) IN (SELECT status_id,page FROM hash_talk.status_pages WHERE status_id=$1 ORDER BY page LIMIT 64)',
          [row.id],
        );
        const remaining = await client.query(
          'SELECT 1 WHERE EXISTS(SELECT 1 FROM hash_talk.status_recipients WHERE status_id=$1) OR EXISTS(SELECT 1 FROM hash_talk.status_pages WHERE status_id=$1)',
          [row.id],
        );
        this.contacts.changed(client, [row.author]);
        return !remaining.rowCount;
      });
      if (done) retired.push(candidate);
    }
    return retired;
  }
  /** Durable fanout cursor; each short transaction emits at most 64 ciphertext-free hints. */
  async notifyBatch(): Promise<boolean> {
    return this.contacts.withMaintenance(async (client) => {
      const posts = await client.query<{
        id: string;
        notice_after: string | null;
      }>(
        'SELECT id,notice_after FROM hash_talk.status_posts WHERE notice_pending ORDER BY id LIMIT 1 FOR UPDATE',
      );
      const post = posts.rows[0];
      if (!post) return false;
      const recipients = await client.query<{ account_id: string }>(
        'SELECT account_id FROM hash_talk.status_recipients WHERE status_id=$1 AND ($2::uuid IS NULL OR account_id>$2) ORDER BY account_id LIMIT 64',
        [post.id, post.notice_after],
      );
      this.contacts.changed(
        client,
        recipients.rows.map((r) => r.account_id),
      );
      await client.query(
        'UPDATE hash_talk.status_posts SET notice_after=$2,notice_pending=$3 WHERE id=$1',
        [
          post.id,
          recipients.rows.at(-1)?.account_id ?? post.notice_after,
          recipients.rows.length === 64,
        ],
      );
      return true;
    });
  }
  /** Physical media must already have durable collection receipts. */
  async collected(id: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM hash_talk.status_posts p WHERE id=$1 AND state='deleting' AND NOT EXISTS(SELECT 1 FROM hash_talk.status_media m WHERE m.status_id=p.id) AND NOT EXISTS(SELECT 1 FROM hash_talk.status_recipients r WHERE r.status_id=p.id) AND NOT EXISTS(SELECT 1 FROM hash_talk.status_pages s WHERE s.status_id=p.id)",
      [id],
    );
  }
}
