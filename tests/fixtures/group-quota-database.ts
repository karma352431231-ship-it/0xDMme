import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

/** Recreate the pre-counter schema in an exclusive database for upgrade coverage. */
export async function groupQuotaPredecessor(
  client: pg.Client,
  through: 72 | 90 = 72,
) {
  const directory = new URL(
    '../../src/server/database/migrations/',
    import.meta.url,
  );
  const files = (await readdir(directory))
    .filter(
      (name) =>
        /^\d{3}.*\.sql$/u.test(name) && Number(name.slice(0, 3)) <= through,
    )
    .sort();
  assert.equal(files.length, through);
  await client.query('BEGIN');
  try {
    await client.query('CREATE SCHEMA hash_talk');
    await client.query(
      `CREATE TABLE hash_talk.schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    for (const [index, file] of files.entries()) {
      const sql = await readFile(new URL(file, directory), 'utf8');
      await client.query(sql);
      await client.query(
        'INSERT INTO hash_talk.schema_migrations(version,checksum) VALUES($1,$2)',
        [index + 1, createHash('sha256').update(sql).digest('hex')],
      );
    }
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function seedGroupQuota(client: pg.Client) {
  const account = crypto.randomUUID(),
    first = crypto.randomUUID(),
    second = crypto.randomUUID(),
    packet = crypto.randomUUID(),
    media = crypto.randomUUID();
  await client.query(
    'INSERT INTO hash_talk.accounts(id,address) VALUES($1,$2)',
    [account, '0x' + first.replaceAll('-', '').padEnd(40, '0')],
  );
  await client.query(
    "INSERT INTO hash_talk.groups(id,owner,revision,epoch,head,event,charge) SELECT id,$1,1,1,repeat('a',64),'{}',1024 FROM unnest($2::uuid[]) id",
    [account, [first, second]],
  );
  await client.query(
    "INSERT INTO hash_talk.group_events(group_id,revision,epoch,hash,event,charge) VALUES($1,1,1,repeat('b',64),'{}',1024)",
    [first],
  );
  await client.query(
    "INSERT INTO hash_talk.group_members(group_id,account_id,role,joined) VALUES($1,$2,'owner',1)",
    [first, account],
  );
  await client.query(
    "INSERT INTO hash_talk.group_consents(id,group_id,target,actor,kind,head,proof,charge) VALUES(gen_random_uuid(),$1,$2,$2,'invite',repeat('c',64),'{}',512)",
    [first, account],
  );
  await client.query(
    "INSERT INTO hash_talk.group_key_sets(hash,group_id,epoch,sender,body,charge) VALUES(repeat('d',64),$1,1,$2,'{}',1024)",
    [first, account],
  );
  await client.query(
    "INSERT INTO hash_talk.group_packets(id,group_id,epoch,sender,key_hash,hash,body,pending_accounts,charge) VALUES($1,$2,1,$3,repeat('d',64),repeat('e',64),'{}','{}',1024)",
    [packet, first, account],
  );
  await client.query(
    "INSERT INTO hash_talk.group_matrix_envelopes(group_id,epoch,id,sender,account_id,device_id,body,hash,charge) VALUES($1,1,'synthetic',$2,$2,gen_random_uuid(),'{}',repeat('f',64),512)",
    [first, account],
  );
  await client.query(
    "INSERT INTO hash_talk.group_media(id,group_id,epoch,message_id,sender,descriptor,bytes,text_charge,charge) VALUES($1,$2,1,$3,$4,'{}',2048,1024,3072)",
    [media, first, packet, account],
  );
  await client.query(
    'INSERT INTO hash_talk.group_cleanups(group_id,id,remaining) VALUES($1,gen_random_uuid(),0)',
    [first],
  );
  await client.query(
    "INSERT INTO hash_talk.group_links(group_id,proof,charge) VALUES($1,'{}',512)",
    [first],
  );
  return { account, first, second, packet, media };
}

export async function assertGroupReconciled(client: pg.Client) {
  const result =
    await client.query(`SELECT coalesce(q.group_id,t.group_id) AS id
    FROM hash_talk.group_quota_usage q FULL JOIN hash_talk.group_quota_totals t USING(group_id)
    WHERE q.text_bytes IS DISTINCT FROM t.text_bytes OR q.media_bytes IS DISTINCT FROM t.media_bytes
    OR q.accepted_media_bytes IS DISTINCT FROM t.accepted_media_bytes`);
  assert.equal(
    result.rowCount,
    0,
    'Derived group counters must match the charged history.',
  );
}
