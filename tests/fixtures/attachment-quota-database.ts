import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { groupQuotaPredecessor } from './group-quota-database.ts';
import {
  seedPersonalQuota,
  assertPersonalQuotaMatches,
} from './personal-quota-database.ts';

export async function attachmentQuotaPredecessor(client: pg.Client) {
  await groupQuotaPredecessor(client);
  await client.query('BEGIN');
  try {
    for (const file of [
      '070-group-quota-accounting.sql',
      '071-personal-quota-accounting.sql',
      '072-quota-lock-order.sql',
    ]) {
      const sql = await readFile(
        new URL(
          '../../src/server/database/migrations/' + file,
          import.meta.url,
        ),
        'utf8',
      );
      await client.query(sql);
      await client.query(
        'INSERT INTO hash_talk.schema_migrations(version,checksum) VALUES($1,$2)',
        [
          Number(file.slice(0, 3)),
          createHash('sha256').update(sql).digest('hex'),
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function seedAttachmentQuota(client: pg.Client) {
  const fixture = await seedPersonalQuota(client),
    message = crypto.randomUUID(),
    attachments = [crypto.randomUUID(), crypto.randomUUID()];
  await client.query(
    `INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge,status)
    VALUES($1,$3,$4,$5,'{}',512,1024,'reserved'),($2,$3,$4,$5,'{}',1024,2048,'ready')`,
    [...attachments, message, fixture.first, fixture.second],
  );
  await client.query(
    "UPDATE hash_talk.message_attachments SET status='accepted' WHERE message_id=$1",
    [fixture.packet],
  );
  return { ...fixture, message, attachments, third: fixture.accounts[2]! };
}

export async function assertAttachmentReconciled(
  client: pg.Client,
  accounts: string[],
) {
  const totals = await client.query(`SELECT coalesce(q.account_id,t.account_id)
    FROM hash_talk.attachment_quota_usage q FULL JOIN hash_talk.attachment_quota_totals t USING(account_id)
    WHERE q.used_bytes IS DISTINCT FROM t.used_bytes`);
  assert.equal(
    totals.rowCount,
    0,
    'Attachment totals must match the historical formula.',
  );
  const messages = await client.query(`WITH expected AS (
    SELECT a.message_id,p.account_id,sum(a.charge)::bigint AS used_bytes
    FROM hash_talk.message_attachments a CROSS JOIN LATERAL (VALUES(a.sender),(a.recipient)) p(account_id)
    WHERE NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals r
      WHERE r.account_id=p.account_id AND r.kind='message' AND r.id=a.message_id)
    GROUP BY a.message_id,p.account_id HAVING sum(a.charge)>0)
    SELECT coalesce(q.message_id,t.message_id) FROM hash_talk.attachment_quota_messages q
    FULL JOIN expected t USING(message_id,account_id) WHERE q.used_bytes IS DISTINCT FROM t.used_bytes`);
  assert.equal(
    messages.rowCount,
    0,
    'Per-message state must match visible charged attachments.',
  );
  await assertPersonalQuotaMatches(client, accounts);
}

export async function insertAttachment(
  client: pg.Client,
  input: { message: string; sender: string; recipient: string },
) {
  await client.query(
    "INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge) VALUES(gen_random_uuid(),$1,$2,$3,'{}',512,1024)",
    [input.message, input.sender, input.recipient],
  );
}

export async function removeAttachmentMessage(
  client: pg.Client,
  input: { message: string; account: string },
) {
  await client.query(
    "INSERT INTO hash_talk.personal_removals(account_id,kind,id,hash,proof,charge) VALUES($1,'message',$2,repeat('a',64),'{}',512)",
    [input.account, input.message],
  );
}
