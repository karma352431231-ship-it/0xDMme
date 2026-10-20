import type { MessageOpeningAllocations } from './message-opening-allocations.ts';
import { MessageOpening } from './message-opening.ts';
import { deleteMessageCopies } from './message-deletion.ts';
import type { MessageRemovalAllocations } from './message-removal-allocations.ts';
import type { MessageAllocations } from './message-allocations.ts';
import type { ContentCapacity } from './content-capacity.ts';
import { recordMessageChanges, readMessageChanges } from './message-changes.ts';
import { latestMessageItems, messageIndexPage } from './message-index.ts';
import type { AttachmentStore } from './attachments.ts';
import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { canonical, directoryEvent } from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
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
interface MessageReceiptRecord {
  id: string;
  sender: string;
  recipient: string;
  hash: string;
  available: boolean;
  original_id: string;
}
export interface MessageSnapshot {
  revision: number;
  directory: string;
  contacts: number;
}
/** All SQL stays in the schema owner, coordinated with consent and device locks. */
export class MessageStore {
  private readonly contacts: ContactStore;
  private readonly capacity: ContentCapacity;
  private readonly attachments: AttachmentStore;
  private readonly allocations: MessageAllocations | undefined;
  private readonly removals: MessageRemovalAllocations | undefined;
  private readonly opening: MessageOpening;
  constructor(
    contacts: ContactStore,
    capacity: ContentCapacity,
    attachments: AttachmentStore,
    writers?: {
      admission: MessageAllocations | undefined;
      removals: MessageRemovalAllocations | undefined;
      openings?: MessageOpeningAllocations | undefined;
    },
  ) {
    this.contacts = contacts;
    this.opening = new MessageOpening(contacts, capacity, writers?.openings);
    this.capacity = capacity;
    this.attachments = attachments;
    this.allocations = writers?.admission;
    this.removals = writers?.removals;
  }
  async profileKnown(
    authority: ContactAuthority,
    id: string,
    peer: string,
  ): Promise<boolean> {
    return this.contacts.withMessageRead(authority, async (client) => {
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
    return this.contacts.withMessageRead(authority, async (client) => {
      const existing = await this.record(client, id);
      if (!existing) return false;
      if (
        existing.sender !== authority.session.accountId ||
        existing.hash !== hash
      )
        throw new AccountError(409, 'Message identifier already used.');
      const removed = await client.query(
        "SELECT 1 FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='message' AND id IN ($2,$3)",
        [authority.session.accountId, id, originalId(existing, id)],
      );
      if (removed.rowCount)
        throw new AccountError(410, 'Message removed from the personal vault.');
      if (!existing.body)
        throw new AccountError(410, 'Message already deleted.');
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
          throw new AccountError(
            403,
            'Sender belongs to another account or device.',
          );
        const existing = await this.record(client, packet.id);
        if (existing) {
          if (
            existing.hash !== hash ||
            existing.sender !== authority.session.accountId ||
            !existing.body
          )
            throw new AccountError(
              409,
              'Concurrent message differs or was deleted.',
            );
          return { status: 'accepted', hash };
        }
        await this.assertRelation(client, packet);
        const events = await this.currentDirectories(client, packet);
        await this.assertRecoverable(client, packet, events);
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
        await this.allocations?.admit(client, packet, references.length);
        await this.attachments.admit(client, packet);
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
        await this.bump(client, [packet.sender, packet.recipient], [packet.id]);
        await assertVaultQuota(client, packet.sender);
        await assertVaultQuota(client, packet.recipient);
        await assertContentCapacity(client, this.capacity);
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
        'Original message removed from the personal vault.',
      );
    const count = await c.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM hash_talk.message_packets WHERE relation->>'id'=$1",
      [relation.id],
    );
    if ((count.rows[0]?.count ?? 0) >= 64)
      throw new AccountError(
        413,
        'This message reached 64 changes; send a new message.',
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
        'Devices changed during sending. Encrypt again.',
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
          'Recoverable preservation not prepared for the current epoch.',
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
  private assertParticipant<T extends { sender: string; recipient: string }>(
    authority: ContactAuthority,
    row: T | null,
  ): asserts row is T {
    if (
      !row ||
      ![row.sender, row.recipient].includes(authority.session.accountId)
    )
      throw new AccountError(404, 'Message unavailable.');
  }
  private async bump(
    client: pg.PoolClient,
    accounts: string[],
    ids: string[],
  ): Promise<void> {
    await recordMessageChanges(client, accounts, ids);
    this.contacts.changed(client, accounts);
  }
  async remove(
    authority: ContactAuthority,
    id: string,
    hash: string,
    proof: MessageProof,
  ): Promise<void> {
    return this.contacts.withMessageParticipants(
      authority,
      (client) => this.messagePeer(client, authority, id),
      async (client, participants) => {
        const row = await this.receiptRecord(client, id);
        if (
          !row ||
          row.sender !== authority.session.accountId ||
          !participants.includes(row.sender) ||
          !participants.includes(row.recipient)
        )
          throw new AccountError(404, 'Own message unavailable.');
        if (row.hash !== hash)
          throw new AccountError(409, 'Deletion content does not match.');
        if (!row.available) return;
        await this.removals?.remove(client, {
          accountId: authority.session.accountId,
          participants,
          id,
          hash,
          proof,
        });
        await deleteMessageCopies(client, {
          id,
          proof,
          sender: row.sender,
          recipient: row.recipient,
        });
        this.contacts.removed(client, [row.sender, row.recipient]);
      },
    );
  }
  async acknowledge(
    authority: ContactAuthority,
    id: string,
    hash: string,
  ): Promise<void> {
    return this.contacts.withMessageParticipants(
      authority,
      (client) => this.messagePeer(client, authority, id),
      async (client, participants) => {
        const row = await this.receiptRecord(client, id);
        this.assertParticipant(authority, row);
        if (
          !participants.includes(row.sender) ||
          !participants.includes(row.recipient)
        )
          throw new AccountError(404, 'Message unavailable.');
        if (!row.available || row.hash !== hash)
          throw new AccountError(
            409,
            'Message deleted or confirmation does not match.',
          );
        const removed = await client.query(
          "SELECT 1 FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='message' AND id IN ($2,$3)",
          [authority.session.accountId, id, row.original_id],
        );
        if (removed.rowCount)
          throw new AccountError(
            410,
            'Message removed from the personal vault.',
          );
        const { accountId, deviceId } = authority.session;
        const updated = await client.query(
          "UPDATE hash_talk.message_references SET status='received' WHERE message_id=$1 AND account_id=$2 AND device_id=$3 AND status='pending'",
          [id, accountId, deviceId],
        );
        if (!updated.rowCount) return;
        await this.retireRevoked(client, row.id);
        if (accountId === row.recipient)
          this.contacts.changed(client, [row.sender]);
      },
    );
  }
  private async messagePeer(
    client: pg.PoolClient,
    authority: ContactAuthority,
    id: string,
  ): Promise<string> {
    const row = await this.receiptRecord(client, id),
      actor = authority.session.accountId;
    // Missing/foreign rows resolve to the actor so session/directory failures
    // retain their priority; the authorized callback performs the actual check.
    if (row?.sender === actor) return row.recipient;
    if (row?.recipient === actor) return row.sender;
    return actor;
  }
  private async receiptRecord(
    client: pg.PoolClient,
    id: string,
  ): Promise<MessageReceiptRecord | null> {
    const result = await client.query<MessageReceiptRecord>(
      `SELECT id,sender,recipient,hash,body IS NOT NULL AS available,coalesce(relation->>'id',id::text) AS original_id
       FROM hash_talk.message_packets WHERE id=$1`,
      [id],
    );
    return result.rows[0] ?? null;
  }
  private async retireRevoked(
    client: pg.PoolClient,
    id: string,
  ): Promise<void> {
    // Both recoverable capsules were admitted atomically. Only revoked references retire.
    await client.query(
      "UPDATE hash_talk.message_references r SET status='revoked' WHERE r.message_id=$1 AND r.status='pending' AND NOT EXISTS(SELECT 1 FROM hash_talk.device_directories d,jsonb_array_elements(d.event->'devices') member WHERE d.account_id=r.account_id AND member->>'id'=r.device_id::text)",
      [id],
    );
    await client.query(
      "UPDATE hash_talk.message_packets SET queue_active=false WHERE id=$1 AND queue_active AND NOT EXISTS(SELECT 1 FROM hash_talk.message_references WHERE message_id=$1 AND status='pending')",
      [id],
    );
  }
  async snapshot(authority: ContactAuthority): Promise<MessageSnapshot> {
    return this.contacts.withMessageRead(authority, (client) =>
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
    if (!row) throw new Error('Message state missing.');
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
        'Messages or permissions changed. Sync again.',
      );
  }
  async page(
    authority: ContactAuthority,
    input: { snapshot: MessageSnapshot; after: number },
  ): Promise<{ items: unknown[]; next: number | null }> {
    return this.contacts.withMessageRead(authority, async (client) => {
      await this.expect(client, authority, input.snapshot);
      return messageIndexPage(client, authority, input.after);
    });
  }
  async changes(
    authority: ContactAuthority,
    range: { from: MessageSnapshot; snapshot: MessageSnapshot },
  ) {
    return this.contacts.withMessageRead(authority, async (client) => {
      await this.expect(client, authority, range.snapshot);
      return readMessageChanges(client, authority, range);
    });
  }
  async preview(
    authority: ContactAuthority,
    input: { peers: string[]; snapshot: MessageSnapshot },
  ) {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      await this.expect(client, authority, input.snapshot);
      return latestMessageItems(client, authority, input.peers);
    });
  }
  async relations(
    a: ContactAuthority,
    ids: string[],
    snapshot: MessageSnapshot,
  ): Promise<{ items: unknown[]; next: null }> {
    return this.contacts.withMessageRead(a, async (c) => {
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
    return this.contacts.withMessageRead(authority, (client) =>
      this.expect(client, authority, snapshot),
    );
  }
  async delivery(
    authority: ContactAuthority,
    input: { snapshot: MessageSnapshot; ids: string[] },
  ): Promise<unknown[]> {
    return this.contacts.withMessageRead(authority, async (client) => {
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
    return this.contacts.withMessageRead(authority, async (client) => {
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
          throw new AccountError(403, 'Directory outside authorized history.');
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
    return this.opening.object({
      authority,
      id,
      expect: (client) => this.expect(client, authority, snapshot),
    });
  }
  async backupWindow(
    authority: ContactAuthority,
    ids: string[],
    snapshot: MessageSnapshot,
  ) {
    return this.opening.backupWindow({
      authority,
      ids,
      expect: (client) => this.expect(client, authority, snapshot),
    });
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
    throw new AccountError(409, 'Original message unavailable.');
  if (
    target.body.relation ||
    target.hash !== relation.hash ||
    target.sender !== relation.author ||
    !sameParticipants(target, packet)
  )
    throw new AccountError(409, 'Original message does not match.');
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
    throw new AccountError(403, 'Change not allowed.');
  if (
    packet.relation?.type === 'edit' &&
    (original.sender !== packet.sender || original.kind !== 'text')
  )
    throw new AccountError(403, 'Only the author can edit text.');
}
