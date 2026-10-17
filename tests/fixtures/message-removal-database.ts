import type { MessageProof } from '../../src/shared/messages/index.ts';
import type { BackupTarget } from '../../src/shared/backups/index.ts';
import type { MessageReceiptFixture } from './message-receipt-database.ts';
import { messagePair, admissionPacket } from './message-allocation-database.ts';
import type { MessageUser } from './message-allocation-database.ts';
import { globalBytes, globalSourceSnapshot } from './global-usage-database.ts';
type Pair = Awaited<ReturnType<typeof messagePair>>;
export const removalHash = 'a'.repeat(64);
const hash = removalHash;
export function proof(user: MessageUser, items?: BackupTarget[]): MessageProof {
  return {
    deviceId: user.session.deviceId,
    directory: user.directory,
    signature: 'synthetic',
    payload: items ? { backup: hash, revision: 1, items } : { revision: 1 },
  };
}
export async function accept(c: MessageReceiptFixture, pair: Pair) {
  const packet = admissionPacket(pair);
  await c.db.messages.admit(pair.sender, packet, hash);
  return packet;
}
export function target(id: string): BackupTarget {
  return { kind: 'message', id, hash };
}
export async function message(c: MessageReceiptFixture, id: string) {
  return (
    await c.inspector.query<{
      available: boolean;
      personal_collected: boolean;
      charge: number;
      sender_charge: number;
      recipient_charge: number;
      queue_active: boolean;
    }>(
      'SELECT body IS NOT NULL AS available,personal_collected,charge,sender_charge,recipient_charge,queue_active FROM hash_talk.message_packets WHERE id=$1',
      [id],
    )
  ).rows[0]!;
}
export async function snapshots(c: MessageReceiptFixture) {
  const sources = (
    await c.inspector.query<{ name: string }>(
      `SELECT DISTINCT c.relname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE t.tgfoid='hash_talk.track_statement_content_usage()'::regprocedure ORDER BY name`,
    )
  ).rows;
  return {
    sources: await globalSourceSnapshot(c.inspector, sources),
    bytes: await globalBytes(c.inspector),
  };
}

/** Raw protocol fixture for source guards, savepoints and ordinary-role checks. */
export async function bindRemoval(
  c: MessageReceiptFixture,
  input: {
    actor: MessageUser;
    participants: string[];
    kind: 'delete' | 'clean';
    items: BackupTarget[];
    bytes?: number;
  },
  client = c.writer,
) {
  await client.query(
    "SELECT pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'))",
  );
  await client.query(
    'SELECT id FROM hash_talk.accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [input.participants],
  );
  const p = proof(
      input.actor,
      input.kind === 'clean' ? input.items : undefined,
    ),
    serialized = JSON.stringify(p);
  const row = (
    await client.query<{ bytes: string; operation: string }>(
      'SELECT bytes::text,operation::text FROM hash_talk.prepare_message_removal($1,$2,$3::jsonb,$4::jsonb,$5,$6::uuid[])',
      [
        input.kind,
        input.actor.session.accountId,
        JSON.stringify(input.items),
        serialized,
        Buffer.byteLength(serialized),
        input.participants,
      ],
    )
  ).rows[0]!;
  const grant = await c.allocator.reserve(
    client,
    input.bytes ?? Number(row.bytes),
    'message-remove',
  );
  await client.query(
    `SELECT set_config('hash_talk.content_allocation',$1,true),set_config('hash_talk.content_account',$2,true),set_config('hash_talk.content_operation',$3,true)`,
    [grant.transactionId, input.actor.session.accountId, row.operation],
  );
  return { grant, proof: p, plannedBytes: Number(row.bytes) };
}

/** Future-history metadata stress; cryptographic transport remains in the assembled suite. */
export async function seedRemovalBatch(
  c: MessageReceiptFixture,
  input: {
    pair: Pair;
    roots: number;
    actions: number;
    devices: number;
    peerDevices?: number;
  },
) {
  const rootIds = Array.from({ length: input.roots }, () =>
    crypto.randomUUID(),
  );
  const packets = rootIds.flatMap((id) =>
    Array.from({ length: input.actions + 1 }, (_, index) => {
      const packet = {
        ...admissionPacket(input.pair),
        id: index ? crypto.randomUUID() : id,
        ...(index
          ? {
              relation: {
                type: 'edit' as const,
                id,
                hash,
                author: input.pair.sender.session.accountId,
              },
            }
          : {}),
      };
      const charges = packet.archives.map(
        (archive) =>
          Buffer.byteLength(
            JSON.stringify({ ...packet, archives: [archive] }),
          ) + 512,
      );
      return {
        packet,
        charge:
          Buffer.byteLength(JSON.stringify(packet)) +
          4096 +
          (input.devices + (input.peerDevices ?? 1)) * 256,
        sender_charge: charges[0],
        recipient_charge: charges[1],
      };
    }),
  );
  await c.inspector.query(
    `INSERT INTO hash_talk.message_packets(id,sender,recipient,hash,body,charge,sender_charge,recipient_charge,sender_revision,recipient_revision,kind,relation)
    SELECT (e->'packet'->>'id')::uuid,$2,$3,$4,e->'packet',(e->>'charge')::integer,(e->>'sender_charge')::integer,(e->>'recipient_charge')::integer,1,1,'text',e->'packet'->'relation'
    FROM jsonb_array_elements($1::jsonb) e`,
    [
      JSON.stringify(packets),
      input.pair.sender.session.accountId,
      input.pair.recipient.session.accountId,
      hash,
    ],
  );
  const devices = [
      input.pair.sender.session.deviceId,
      ...Array.from({ length: input.devices - 1 }, () => crypto.randomUUID()),
    ],
    recipientDevices = [
      input.pair.recipient.session.deviceId,
      ...Array.from({ length: (input.peerDevices ?? 1) - 1 }, () =>
        crypto.randomUUID(),
      ),
    ],
    ids = packets.map((e) => e.packet.id);
  await c.inspector.query(
    `INSERT INTO hash_talk.message_references(message_id,account_id,device_id,status)
    SELECT id,$2::uuid,device,CASE WHEN device=$4::uuid THEN 'pending' ELSE 'revoked' END FROM unnest($1::uuid[]) id CROSS JOIN unnest($3::uuid[]) device
    UNION ALL SELECT id,$5::uuid,device,CASE WHEN device=$6::uuid THEN 'pending' ELSE 'revoked' END FROM unnest($1::uuid[]) id CROSS JOIN unnest($7::uuid[]) device`,
    [
      ids,
      input.pair.sender.session.accountId,
      devices,
      input.pair.sender.session.deviceId,
      input.pair.recipient.session.accountId,
      input.pair.recipient.session.deviceId,
      recipientDevices,
    ],
  );
  return {
    rootIds,
    ids,
    items: rootIds.map(target),
    removedReferences: ids.length * input.devices,
    remainingReferences: ids.length * (input.peerDevices ?? 1),
  };
}
