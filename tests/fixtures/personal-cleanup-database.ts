import type { MessageReceiptFixture } from './message-receipt-database.ts';
import type { MessageUser } from './message-allocation-database.ts';
import { messagePair } from './message-allocation-database.ts';
import { accept, target } from './message-removal-database.ts';
import type { BackupTarget } from '../../src/shared/backups/index.ts';
const hash = 'a'.repeat(64);
type Pair = Awaited<ReturnType<typeof messagePair>>;
async function profile(c: MessageReceiptFixture, user: MessageUser) {
  const existing = await c.inspector.query<{ id: string }>(
    'SELECT id FROM hash_talk.public_profiles WHERE account_id=$1',
    [user.session.accountId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  await c.db.publicProfiles.create(
    user,
    's' + crypto.randomUUID().replaceAll('-', '').slice(0, 12),
  );
  return (
    await c.inspector.query<{ id: string }>(
      'SELECT id FROM hash_talk.public_profiles WHERE account_id=$1',
      [user.session.accountId],
    )
  ).rows[0]!.id;
}
export async function social(
  c: MessageReceiptFixture,
  pair: Pair,
  ciphertext = 'synthetic ciphertext',
) {
  const sender = await profile(c, pair.sender),
    recipient = await profile(c, pair.recipient),
    id = crypto.randomUUID(),
    media = crypto.randomUUID();
  const body = JSON.stringify({ sender, recipient, content: { ciphertext } });
  await c.inspector.query(
    'INSERT INTO hash_talk.social_messages(id,sender,recipient,hash,body,charge,sender_charge,recipient_charge) VALUES($1,$2,$3,$4,$5::jsonb,$6,1024,1024)',
    [id, sender, recipient, hash, body, Buffer.byteLength(body) + 512],
  );
  await c.inspector.query(
    "INSERT INTO hash_talk.social_media(id,message_id,sender,recipient,descriptor,media,status,bytes,sender_charge,recipient_charge,charge) VALUES($1,$2,$3,$4,'{}','photo','accepted',128,640,640,640)",
    [media, id, sender, recipient],
  );
  await c.inspector.query(
    'INSERT INTO hash_talk.social_receipts(message_id,profile_id,device_id,received) VALUES($1,$2,$3,true),($1,$4,$5,true)',
    [
      id,
      sender,
      pair.sender.session.deviceId,
      recipient,
      pair.recipient.session.deviceId,
    ],
  );
  return { kind: 'dm-message' as const, id, hash, sender, recipient, media };
}
export async function vault(
  c: MessageReceiptFixture,
  user: MessageUser,
): Promise<BackupTarget> {
  const id = crypto.randomUUID();
  await c.inspector.query(
    `INSERT INTO hash_talk.vault_operations(account_id,id,hash,object_hash,commit,charge,state,sequence)
    VALUES($1,$2::uuid,$3,repeat(md5($2::uuid::text),2),' {"block":{"bytes":128}}'::jsonb,4224,'accepted',1+(SELECT coalesce(max(sequence),0) FROM hash_talk.vault_operations WHERE account_id=$1))`,
    [user.session.accountId, id, hash],
  );
  return { kind: 'vault', id, hash };
}
export async function selection(c: MessageReceiptFixture, pair: Pair) {
  const dm = await social(c, pair),
    packet = await accept(c, pair),
    block = await vault(c, pair.sender),
    attachment = crypto.randomUUID();
  await c.inspector.query(
    "INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge,status) VALUES($1,$2,$3,$4,'{}',128,640,'accepted')",
    [attachment, packet.id, packet.sender, packet.recipient],
  );
  return {
    dm,
    packet,
    block,
    attachment,
    items: [{ kind: dm.kind, id: dm.id, hash }, target(packet.id), block],
  };
}
