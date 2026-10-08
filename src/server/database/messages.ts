import type { AttachmentStore } from './attachments.ts';
import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { canonical, directoryEvent } from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import { messagePageSize } from '../../shared/messages/index.ts';
import type {
  MessagePacket,
  MessageProof,
} from '../../shared/messages/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import { assertContentCapacity, assertVaultQuota } from './vault-quota.ts';
import { enqueuePush } from './daily.ts';
interface StoredMessage {
  id: string;
  sender: string;
  recipient: string;
  sequence: string;
  hash: string;
  body: MessagePacket | null;
  deletion: MessageProof | null;
  queue_active: boolean;
}
export interface MessageSnapshot {
  revision: number;
  directory: string;
  contacts: number;
}
/** All SQL stays in the schema owner, coordinated with consent and device locks. */
export class MessageStore {
  private readonly contacts: ContactStore;
  private readonly capacity: number;
  private readonly attachments: AttachmentStore;
  constructor(
    contacts: ContactStore,
    capacity: number,
    attachments: AttachmentStore,
  ) {
    this.contacts = contacts;
    this.capacity = capacity;
    this.attachments = attachments;
  }
  async profileKnown(
    authority: ContactAuthority,
    id: string,
    peer: string,
  ): Promise<boolean> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const result = await client.query(
        `SELECT 1 FROM hash_talk.message_packets WHERE id=$1 AND sender=$2 AND recipient=$3 AND kind='profile'`,
        [id, authority.session.accountId, peer],
      );
      return Boolean(result.rowCount);
    });
  }
  async accepted(
    authority: ContactAuthority,
    id: string,
    hash: string,
  ): Promise<boolean> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const existing = await this.record(client, id);
      if (!existing) return false;
      if (
        existing.sender !== authority.session.accountId ||
        existing.hash !== hash
      )
        throw new AccountError(409, 'Identificador de mensagem já utilizado.');
      const removed = await client.query(
        "SELECT 1 FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='message' AND id IN ($2,$3)",
        [authority.session.accountId, id, originalId(existing, id)],
      );
      if (removed.rowCount)
        throw new AccountError(410, 'Mensagem removida do cofre pessoal.');
      if (!existing.body) throw new AccountError(410, 'Mensagem já apagada.');
      return true;
    });
  }
  async admit(
    authority: ContactAuthority,
    packet: MessagePacket,
    hash: string,
  ): Promise<{ status: 'accepted'; hash: string }> {
    return this.contacts.withMessageConsent(
      authority,
      packet.recipient,
      async (client) => {
        if (
          packet.sender !== authority.session.accountId ||
          packet.deviceId !== authority.session.deviceId ||
          packet.senderDirectory !== authority.directory
        )
          throw new AccountError(403, 'Remetente de outra conta ou aparelho.');
        const existing = await this.record(client, packet.id);
        if (existing) {
          if (
            existing.hash !== hash ||
            existing.sender !== authority.session.accountId ||
            !existing.body
          )
            throw new AccountError(
              409,
              'Mensagem concorrente divergente ou apagada.',
            );
          return { status: 'accepted', hash };
        }
        await this.assertRelation(client, packet);
        const events = await this.currentDirectories(client, packet);
        await this.assertRecoverable(client, packet, events);
        await this.attachments.admit(client, packet);
        const removedFor = await removedAudience(client, packet);
        const serialized = JSON.stringify(packet);
        const personal = packet.archives.map((archive) =>
          removedFor.has(archive.accountId)
            ? 0
            : Buffer.byteLength(
                JSON.stringify({ ...packet, archives: [archive] }),
              ) + 512,
        );
        const references = events.flatMap((e) =>
          removedFor.has(e.accountId)
            ? []
            : e.devices.map((d) => ({ account: e.accountId, device: d.id })),
        );
        await client.query(
          'INSERT INTO hash_talk.message_packets(id,sender,recipient,hash,body,charge,sender_charge,recipient_charge,sender_revision,recipient_revision,kind,relation) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12::jsonb)',
          [
            packet.id,
            packet.sender,
            packet.recipient,
            hash,
            serialized,
            Buffer.byteLength(serialized) + 4096 + references.length * 256,
            personal[0],
            personal[1],
            packet.senderRevision,
            packet.recipientRevision,
            packet.kind,
            packet.relation ? JSON.stringify(packet.relation) : null,
          ],
        );
        await client.query(
          'INSERT INTO hash_talk.message_references(message_id,account_id,device_id) SELECT $1,account,device FROM jsonb_to_recordset($2::jsonb) AS r(account uuid,device uuid)',
          [packet.id, JSON.stringify(references)],
        );
        await assertVaultQuota(client, packet.sender);
        await assertVaultQuota(client, packet.recipient);
        await assertContentCapacity(client, this.capacity);
        await this.bump(client, [packet.sender, packet.recipient]);
        await admitNotification(client, packet);
        return { status: 'accepted', hash };
      },
    );
  }
  private async assertRelation(
    c: pg.PoolClient,
    packet: MessagePacket,
  ): Promise<void> {
    const relation = packet.relation;
    if (!relation) return;
    const target = await this.record(c, relation.id);
    assertRelationTarget(packet, target);
    const removed = await c.query(
      "SELECT 1 FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='message' AND id=$2",
      [packet.sender, relation.id],
    );
    if (removed.rowCount)
      throw new AccountError(
        410,
        'Mensagem original removida do cofre pessoal.',
      );
    const count = await c.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM hash_talk.message_packets WHERE relation->>'id'=$1",
      [relation.id],
    );
    if ((count.rows[0]?.count ?? 0) >= 64)
      throw new AccountError(
        413,
        'Esta mensagem atingiu 64 alterações; envie uma nova mensagem.',
      );
  }
  private async currentDirectories(
    client: pg.PoolClient,
    packet: MessagePacket,
  ): Promise<DirectoryEvent[]> {
    const result = await client.query<{
      account_id: string;
      head: string;
      event: unknown;
    }>(
      'SELECT account_id,head,event FROM hash_talk.device_directories WHERE account_id=ANY($1::uuid[])',
      [[packet.sender, packet.recipient]],
    );
    const sender = result.rows.find((r) => r.account_id === packet.sender),
      recipient = result.rows.find((r) => r.account_id === packet.recipient);
    if (
      !sender ||
      !recipient ||
      sender.head !== packet.senderDirectory ||
      recipient.head !== packet.recipientDirectory ||
      directoryEvent(sender.event).revision !== packet.senderRevision ||
      directoryEvent(recipient.event).revision !== packet.recipientRevision
    )
      throw new AccountError(
        409,
        'Aparelhos mudaram durante o envio. Refaça a cifragem.',
      );
    return [directoryEvent(sender.event), directoryEvent(recipient.event)];
  }
  private async assertRecoverable(
    client: pg.PoolClient,
    packet: MessagePacket,
    events: DirectoryEvent[],
  ): Promise<void> {
    const keys = await client.query<{
      id: string;
      account_id: string;
      epoch: number;
    }>(
      'SELECT id,account_id,epoch FROM hash_talk.message_recovery_keys WHERE id=ANY($1::uuid[])',
      [packet.archives.map((a) => a.keyId)],
    );
    for (const archive of packet.archives) {
      const key = keys.rows.find(
        (k) => k.id === archive.keyId && k.account_id === archive.accountId,
      );
      const event = events.find((e) => e.accountId === archive.accountId);
      if (!key || !event || key.epoch !== event.epoch)
        throw new AccountError(
          409,
          'Preservação recuperável não preparada para a época atual.',
        );
    }
  }
  private async record(
    client: pg.PoolClient,
    id: string,
  ): Promise<StoredMessage | null> {
    const result = await client.query<StoredMessage>(
      'SELECT id,sender,recipient,sequence::text,hash,body,deletion,queue_active FROM hash_talk.message_packets WHERE id=$1',
      [id],
    );
    return result.rows[0] ?? null;
  }
  private assertParticipant(
    authority: ContactAuthority,
    row: StoredMessage | null,
  ): asserts row is StoredMessage {
    if (
      !row ||
      ![row.sender, row.recipient].includes(authority.session.accountId)
    )
      throw new AccountError(404, 'Mensagem indisponível.');
  }
  private async bump(client: pg.PoolClient, accounts: string[]): Promise<void> {
    await client.query(
      'INSERT INTO hash_talk.message_heads(account_id,revision) SELECT unnest($1::uuid[]),1 ON CONFLICT(account_id) DO UPDATE SET revision=hash_talk.message_heads.revision+1',
      [accounts.sort()],
    );
    this.contacts.changed(client, accounts);
  }
  async remove(
    authority: ContactAuthority,
    id: string,
    hash: string,
    proof: MessageProof,
  ): Promise<void> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const row = await this.record(client, id);
      if (!row || row.sender !== authority.session.accountId)
        throw new AccountError(404, 'Mensagem própria indisponível.');
      if (row.hash !== hash)
        throw new AccountError(409, 'Conteúdo da exclusão divergente.');
      if (!row.body) return;
      // One original and at most 64 related actions; all automatic copies leave together.
      await client.query(
        "UPDATE hash_talk.message_packets SET body=NULL,deletion=$2::jsonb,queue_active=false,sender_charge=$3,recipient_charge=$3,charge=$3,deletion_revision=$4,deletion_account=$5 WHERE (id=$1 OR relation->>'id'=$1::text) AND body IS NOT NULL",
        [
          id,
          JSON.stringify(proof),
          Buffer.byteLength(JSON.stringify(proof)) + 512,
          proof.payload['revision'],
          row.sender,
        ],
      );
      await client.query(
        "DELETE FROM hash_talk.message_references WHERE message_id IN (SELECT id FROM hash_talk.message_packets WHERE id=$1 OR relation->>'id'=$1::text)",
        [id],
      );
      await client.query(
        "DELETE FROM hash_talk.message_reads WHERE message_id IN (SELECT id FROM hash_talk.message_packets WHERE id=$1 OR relation->>'id'=$1::text)",
        [id],
      );
      await client.query(
        "UPDATE hash_talk.message_attachments SET status='deleting' WHERE message_id=$1 AND status='accepted'",
        [id],
      );
      await this.bump(client, [row.sender, row.recipient]);
      this.contacts.removed(client, [row.sender, row.recipient]);
    });
  }
  async acknowledge(
    authority: ContactAuthority,
    id: string,
    hash: string,
  ): Promise<void> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const row = await this.record(client, id);
      this.assertParticipant(authority, row);
      if (!row.body || row.hash !== hash)
        throw new AccountError(
          409,
          'Mensagem apagada ou confirmação divergente.',
        );
      const removed = await client.query(
        "SELECT 1 FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='message' AND id IN ($2,$3)",
        [authority.session.accountId, id, originalId(row, id)],
      );
      if (removed.rowCount)
        throw new AccountError(410, 'Mensagem removida do cofre pessoal.');
      const { accountId, deviceId } = authority.session;
      const updated = await client.query(
        "UPDATE hash_talk.message_references SET status='received' WHERE message_id=$1 AND account_id=$2 AND device_id=$3 AND status='pending'",
        [id, accountId, deviceId],
      );
      if (!updated.rowCount) return;
      await this.retireRevoked(client, row);
      if (accountId === row.recipient)
        this.contacts.changed(client, [row.sender]);
    });
  }
  private async retireRevoked(
    client: pg.PoolClient,
    row: StoredMessage,
  ): Promise<void> {
    // Both recoverable capsules were admitted atomically. Only revoked references retire.
    await client.query(
      "UPDATE hash_talk.message_references r SET status='revoked' WHERE r.message_id=$1 AND r.status='pending' AND NOT EXISTS(SELECT 1 FROM hash_talk.device_directories d,jsonb_array_elements(d.event->'devices') member WHERE d.account_id=r.account_id AND member->>'id'=r.device_id::text)",
      [row.id],
    );
    await client.query(
      "UPDATE hash_talk.message_packets SET queue_active=false WHERE id=$1 AND queue_active AND NOT EXISTS(SELECT 1 FROM hash_talk.message_references WHERE message_id=$1 AND status='pending')",
      [row.id],
    );
  }
  async snapshot(authority: ContactAuthority): Promise<MessageSnapshot> {
    return this.contacts.withMessageAuthority(authority, (client) =>
      this.state(client, authority),
    );
  }
  private async state(
    client: pg.PoolClient,
    authority: ContactAuthority,
  ): Promise<MessageSnapshot> {
    const result = await client.query<{ revision: string; contacts: number }>(
      `SELECT coalesce((SELECT revision FROM hash_talk.message_heads WHERE account_id=$1),0)::text AS revision,coalesce((SELECT revision FROM hash_talk.contact_controls WHERE account_id=$1),0) AS contacts`,
      [authority.session.accountId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Estado de mensagens ausente.');
    return {
      revision: Number(row.revision),
      contacts: row.contacts,
      directory: authority.directory,
    };
  }
  private async expect(
    client: pg.PoolClient,
    authority: ContactAuthority,
    snapshot: MessageSnapshot,
  ): Promise<void> {
    if (canonical(snapshot) !== canonical(await this.state(client, authority)))
      throw new AccountError(
        409,
        'Mensagens ou permissões mudaram. Sincronize novamente.',
      );
  }
  async page(
    authority: ContactAuthority,
    input: { snapshot: MessageSnapshot; after: number },
  ): Promise<{ items: unknown[]; next: number | null }> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      await this.expect(client, authority, input.snapshot);
      const result = await client.query<{
        id: string;
        sender: string;
        recipient: string;
        sequence: string;
        hash: string;
        deleted: boolean;
        deletion: MessageProof | null;
        queue_active: boolean;
        status: string | null;
      }>(
        `SELECT m.id,m.kind,m.sender,m.recipient,m.sequence::text,m.hash,m.relation,m.deletion_account,(m.body IS NULL OR pr.id IS NOT NULL) AS deleted,m.deletion,pr.id AS removal_id,pr.hash AS removal_hash,pr.proof AS removal,pr.sequence::text AS removal_sequence,m.sender_revision,m.recipient_revision,m.queue_active,r.status FROM hash_talk.message_packets m LEFT JOIN LATERAL (SELECT * FROM hash_talk.personal_removals pr WHERE pr.account_id=$1 AND pr.kind='message' AND pr.id IN (m.id,(m.relation->>'id')::uuid) ORDER BY (pr.id=m.id) DESC LIMIT 1) pr ON true LEFT JOIN hash_talk.message_references r ON r.message_id=m.id AND r.account_id=$1 AND r.device_id=$2 WHERE (m.sender=$1 OR m.recipient=$1) AND m.sequence>$3 ORDER BY m.sequence LIMIT $4`,
        [
          authority.session.accountId,
          authority.session.deviceId,
          input.after,
          messagePageSize + 1,
        ],
      );
      const items = result.rows
        .slice(0, messagePageSize)
        .map((r) => ({ ...r, sequence: Number(r['sequence']) }));
      return {
        items,
        next:
          result.rows.length > messagePageSize
            ? Number(items.at(-1)?.sequence)
            : null,
      };
    });
  }
  async relations(
    a: ContactAuthority,
    ids: string[],
    snapshot: MessageSnapshot,
  ): Promise<{ items: unknown[]; next: null }> {
    return this.contacts.withMessageAuthority(a, async (c) => {
      await this.expect(c, a, snapshot);
      const r = await c.query<Record<string, unknown>>(
        `SELECT * FROM (SELECT DISTINCT ON (m.relation->>'id',m.relation->>'type',m.sender) m.id,m.kind,m.sender,m.recipient,m.sequence::text,m.hash,m.relation,m.sender_revision,m.recipient_revision,m.queue_active,false AS deleted,NULL AS deletion,r.status FROM hash_talk.message_packets m LEFT JOIN hash_talk.message_references r ON r.message_id=m.id AND r.account_id=$1 AND r.device_id=$2 WHERE (m.sender=$1 OR m.recipient=$1) AND m.relation->>'id'=ANY($3::text[]) AND m.body IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals pr WHERE pr.account_id=$1 AND pr.kind='message' AND pr.id IN (m.id,(m.relation->>'id')::uuid)) ORDER BY m.relation->>'id',m.relation->>'type',m.sender,m.sequence DESC) current ORDER BY sequence::bigint`,
        [a.session.accountId, a.session.deviceId, ids],
      );
      return {
        items: r.rows.map((r) => ({ ...r, sequence: Number(r['sequence']) })),
        next: null,
      };
    });
  }
  async confirmSnapshot(
    authority: ContactAuthority,
    snapshot: MessageSnapshot,
  ): Promise<void> {
    return this.contacts.withMessageAuthority(authority, (client) =>
      this.expect(client, authority, snapshot),
    );
  }
  async delivery(
    authority: ContactAuthority,
    input: { snapshot: MessageSnapshot; ids: string[] },
  ): Promise<unknown[]> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      await this.expect(client, authority, input.snapshot);
      const rows = await client.query(
        "SELECT m.id,m.hash,m.queue_active,EXISTS(SELECT 1 FROM hash_talk.message_references r WHERE r.message_id=m.id AND r.account_id=m.recipient AND r.status='received') AS recipient_received FROM hash_talk.message_packets m WHERE m.id=ANY($1::uuid[]) AND (m.sender=$2 OR m.recipient=$2) AND m.body IS NOT NULL",
        [input.ids, authority.session.accountId],
      );
      return rows.rows as unknown[];
    });
  }
  async history(
    authority: ContactAuthority,
    input: { accountId: string; after: number; through: number },
  ): Promise<unknown[]> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      if (
        input.accountId !== authority.session.accountId &&
        !(await this.contacts.messageDeliveryAllowed(
          client,
          authority.session.accountId,
          input.accountId,
        ))
      ) {
        const result = await client.query<{ revision: number | null }>(
          `SELECT max(greatest(sender_revision,coalesce(deletion_revision,0))) AS revision FROM hash_talk.message_packets WHERE (sender=$1 AND recipient=$2) OR (deletion_account=$1 AND (sender=$2 OR recipient=$2))`,
          [input.accountId, authority.session.accountId],
        );
        if (input.through > (result.rows[0]?.revision ?? 0))
          throw new AccountError(
            403,
            'Diretório fora do histórico autorizado.',
          );
      }
      const events = await client.query<{ event: unknown }>(
        'SELECT event FROM hash_talk.device_events WHERE account_id=$1 AND revision>$2 AND revision<=$3 ORDER BY revision LIMIT 8',
        [input.accountId, input.after, input.through],
      );
      return events.rows.map((r) => r.event);
    });
  }
  async object(
    authority: ContactAuthority,
    id: string,
    snapshot: MessageSnapshot,
  ): Promise<MessagePacket> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      await this.expect(client, authority, snapshot);
      return this.openObject(client, authority, id);
    });
  }
  async backupWindow(
    authority: ContactAuthority,
    ids: string[],
    snapshot: MessageSnapshot,
  ) {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      await this.expect(client, authority, snapshot);
      const rows: {
        id: string;
        packet?: MessagePacket;
        unavailable?: number;
      }[] = [];
      let bytes = 0;
      for (const id of ids) {
        const result = await this.backupObject(client, authority, id);
        const size = Buffer.byteLength(JSON.stringify(result));
        if (rows.length && bytes + size > 16_000_000) break;
        bytes += size;
        rows.push(result);
      }
      return rows;
    });
  }
  private async backupObject(
    client: pg.PoolClient,
    authority: ContactAuthority,
    id: string,
  ) {
    try {
      return { id, packet: await this.openObject(client, authority, id) };
    } catch (error: unknown) {
      if (
        !(error instanceof AccountError) ||
        ![410, 423].includes(error.status)
      )
        throw error;
      return { id, unavailable: error.status };
    }
  }
  private async openObject(
    client: pg.PoolClient,
    authority: ContactAuthority,
    id: string,
  ): Promise<MessagePacket> {
    const row = await this.record(client, id);
    this.assertParticipant(authority, row);
    const removed = await client.query(
      "SELECT 1 FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='message' AND id IN ($2,$3)",
      [authority.session.accountId, id, originalId(row, id)],
    );
    if (!row.body || removed.rowCount)
      throw new AccountError(
        410,
        'Mensagem apagada ou removida do cofre pessoal.',
      );
    const { accountId, deviceId } = authority.session;
    const ref = await client.query<{ status: string }>(
      'SELECT status FROM hash_talk.message_references WHERE message_id=$1 AND account_id=$2 AND device_id=$3',
      [id, accountId, deviceId],
    );
    const peer = row.sender === accountId ? row.recipient : row.sender;
    if (
      ref.rows[0]?.status !== 'received' &&
      !(await this.contacts.messageDeliveryAllowed(client, accountId, peer))
    )
      throw new AccountError(
        423,
        'Entrega suspensa. É necessário novo consentimento.',
      );
    const inserted = await client.query(
      'INSERT INTO hash_talk.message_references(message_id,account_id,device_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [id, accountId, deviceId],
    );
    if (inserted.rowCount) {
      await client.query(
        'UPDATE hash_talk.message_packets SET charge=charge+256 WHERE id=$1',
        [id],
      );
      await assertContentCapacity(client, this.capacity);
    }
    return row.body;
  }
}

function originalId(row: StoredMessage, id: string): string {
  return row.body?.relation?.id ?? id;
}
async function removedAudience(
  c: pg.PoolClient,
  packet: MessagePacket,
): Promise<Set<string>> {
  if (!packet.relation) return new Set();
  const rows = await c.query<{ account_id: string }>(
    "SELECT account_id FROM hash_talk.personal_removals WHERE account_id=ANY($1::uuid[]) AND kind='message' AND id=$2",
    [[packet.sender, packet.recipient], packet.relation.id],
  );
  return new Set(rows.rows.map((row) => row.account_id));
}
async function admitNotification(
  c: pg.PoolClient,
  packet: MessagePacket,
): Promise<void> {
  if (packet.kind !== 'profile' && !packet.relation)
    await enqueuePush(c, packet.recipient, packet.sender);
}
function assertRelationTarget(
  packet: MessagePacket,
  target: StoredMessage | null,
): void {
  const relation = packet.relation!;
  if (!target || !target.body)
    throw new AccountError(409, 'Mensagem original indisponível.');
  if (
    target.body.relation ||
    target.hash !== relation.hash ||
    target.sender !== relation.author ||
    !sameParticipants(target, packet)
  )
    throw new AccountError(409, 'Mensagem original divergente.');
  assertActionOwner(packet, target.body);
}
function sameParticipants(
  target: StoredMessage,
  packet: MessagePacket,
): boolean {
  const ids = [target.sender, target.recipient];
  return ids.includes(packet.sender) && ids.includes(packet.recipient);
}
function assertActionOwner(
  packet: MessagePacket,
  original: MessagePacket,
): void {
  if (packet.kind !== 'text' || original.kind === 'profile')
    throw new AccountError(403, 'Alteração não permitida.');
  if (
    packet.relation?.type === 'edit' &&
    (original.sender !== packet.sender || original.kind !== 'text')
  )
    throw new AccountError(403, 'Somente o autor pode editar texto.');
}
