import pg from 'pg';
import assert from 'node:assert/strict';
import { vaultUsage } from '../../src/server/database/vault-quota.ts';
import { referenceVaultUsage } from './vault-usage-reference.ts';

async function seedControls(
  client: pg.Client,
  input: {
    first: string;
    second: string;
    device: string;
    packet: string;
    group: string;
    groupPacket: string;
  },
) {
  const { first, second, device, packet, group, groupPacket } = input;
  await client.query(
    'INSERT INTO hash_talk.daily_controls(account_id) VALUES($1)',
    [first],
  );
  await client.query(
    'INSERT INTO hash_talk.conversation_controls(account_id,peer) VALUES($1,$2)',
    [first, second],
  );
  await client.query(
    "INSERT INTO hash_talk.device_presence(account_id,device_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [first, device],
  );
  await client.query(
    "INSERT INTO hash_talk.push_subscriptions(account_id,device_id,endpoint,subscription,charge) VALUES($1,$2,'https://push.example.invalid/synthetic','{}',512)",
    [first, device],
  );
  await client.query(
    'INSERT INTO hash_talk.push_controls(account_id,device_id) VALUES($1,$2)',
    [first, device],
  );
  await client.query(
    'INSERT INTO hash_talk.call_controls(account_id,revision) VALUES($1,1)',
    [first],
  );
  await client.query(
    'INSERT INTO hash_talk.message_reads(account_id,message_id) VALUES($1,$2)',
    [first, packet],
  );
  await client.query(
    'INSERT INTO hash_talk.group_controls(account_id,group_id) VALUES($1,$2)',
    [first, group],
  );
  await client.query(
    'INSERT INTO hash_talk.group_reads(account_id,group_id,message_id) VALUES($1,$2,$3)',
    [first, group, groupPacket],
  );
}

async function seedStatus(
  client: pg.Client,
  input: { first: string; second: string; device: string },
) {
  const id = crypto.randomUUID(),
    { first, second, device } = input;
  await client.query(
    "INSERT INTO hash_talk.status_posts(id,author,device_id,directory,contact_revision) VALUES($1,$2,$3,repeat('a',64),1)",
    [id, first, device],
  );
  await client.query(
    "INSERT INTO hash_talk.status_recipients(status_id,account_id,author,envelope,hash,charge) VALUES($1,$2,$3,'{}',repeat('b',64),512)",
    [id, second, first],
  );
  await client.query(
    "INSERT INTO hash_talk.status_pages(status_id,page,author,head,hash,count) VALUES($1,1,$2,repeat('c',64),repeat('d',64),1)",
    [id, first],
  );
  await client.query(
    "INSERT INTO hash_talk.status_media(id,status_id,author,descriptor,bytes,charge) VALUES(gen_random_uuid(),$1,$2,'{}',1024,1536)",
    [id, first],
  );
}

async function seedMatrix(
  client: pg.Client,
  input: { first: string; second: string; device: string },
) {
  const { first, second, device } = input;
  await client.query(
    "INSERT INTO hash_talk.matrix_devices(account_id,device_id,binding,charge) VALUES($1,$2,'{}',512)",
    [first, device],
  );
  await client.query(
    "INSERT INTO hash_talk.matrix_one_time_keys(account_id,device_id,id,body,charge) VALUES($1,$2,'synthetic','{}',512)",
    [first, device],
  );
  await client.query(
    "INSERT INTO hash_talk.matrix_envelopes(id,sender,account_id,device_id,body,hash,charge) VALUES('synthetic',$1,$2,$3,'{}',repeat('e',64),512)",
    [second, first, device],
  );
}

async function seedRepresentatives(client: pg.Client, account: string) {
  const organization = crypto.randomUUID();
  await client.query(
    "INSERT INTO hash_talk.organizations(id,account_id,registration,descriptor_hash) VALUES($1,$2,'{}',repeat('a',64))",
    [organization, account],
  );
  await client.query(
    "INSERT INTO hash_talk.representative_credentials(id,organization_id,account_id,hash,issued_at,expires_at) VALUES(gen_random_uuid(),$1,$2,repeat('b',64),1,2)",
    [organization, account],
  );
  await client.query(
    "INSERT INTO hash_talk.organization_domains(organization_id,account_id,claim,record) VALUES($1,$2,'{}','0xdmme-verification='||repeat('c',64))",
    [organization, account],
  );
}

async function seedSocial(client: pg.Client, accounts: string[]) {
  const [first, second] = accounts,
    profiles = [crypto.randomUUID(), crypto.randomUUID()],
    device = crypto.randomUUID();
  await client.query(
    "INSERT INTO hash_talk.public_profiles(id,account_id,handle) VALUES($1,$2,'synthetic_a'),($3,$4,'synthetic_b')",
    [profiles[0], first, profiles[1], second],
  );
  await client.query(
    "INSERT INTO hash_talk.social_directories(profile_id,revision,body,hash,charge) SELECT p,1,'{}',repeat('a',64),1024 FROM unnest($1::uuid[]) p",
    [profiles],
  );
  await client.query(
    "INSERT INTO hash_talk.social_recovery(profile_id,epoch,id,body,charge) VALUES($1,1,gen_random_uuid(),'{}',1024)",
    [profiles[0]],
  );
  await client.query(
    'INSERT INTO hash_talk.social_devices(profile_id,device_id,private_device) VALUES($1,$2,gen_random_uuid())',
    [profiles[0], device],
  );
  await client.query(
    "INSERT INTO hash_talk.social_matrix_devices(profile_id,device_id,binding,charge) VALUES($1,$2,'{}',512)",
    [profiles[0], device],
  );
  await client.query(
    "INSERT INTO hash_talk.social_matrix_keys(profile_id,device_id,id,fallback,body,charge) VALUES($1,$2,'synthetic',false,'{}',512)",
    [profiles[0], device],
  );
  await client.query(
    "INSERT INTO hash_talk.social_matrix_envelopes(sender,sender_device,txn,recipient,device_id,hash,body,charge) VALUES($1,gen_random_uuid(),'synthetic',$2,$3,repeat('b',64),'{}',512)",
    [profiles[1], profiles[0], device],
  );
  await client.query(
    "INSERT INTO hash_talk.social_personal_secrets(profile_id,body,charge) VALUES($1,'{}',512)",
    [profiles[0]],
  );
  await client.query(
    `INSERT INTO hash_talk.social_messages(id,sender,recipient,hash,body,charge,sender_charge,recipient_charge)
    VALUES(gen_random_uuid(),$1,$2,repeat('c',64),'{"senderRevision":1,"recipientRevision":1}',5000,2000,3000)`,
    profiles,
  );
  await client.query(
    "INSERT INTO hash_talk.social_media(id,message_id,sender,recipient,descriptor,media,bytes,sender_charge,recipient_charge,charge) VALUES(gen_random_uuid(),gen_random_uuid(),$1,$2,'{}','photo',2048,2500,3500,6000)",
    profiles,
  );
  return profiles;
}

/** Every direct-account/profile source is populated before applying the counter migration. */
export async function seedPersonalQuota(client: pg.Client) {
  const accounts = Array.from({ length: 3 }, () => crypto.randomUUID());
  const [first, second] = accounts;
  assert.ok(first && second);
  await client.query(
    "INSERT INTO hash_talk.accounts(id,address) SELECT id,'0x'||substr(replace(id::text,'-','')||repeat('0',40),1,40) FROM unnest($1::uuid[]) id",
    [accounts],
  );
  await client.query(
    "UPDATE hash_talk.accounts SET profile_revision=1,profile_iv=decode(repeat('00',12),'hex'),profile_ciphertext=decode(repeat('00',16),'hex') WHERE id=$1",
    [first],
  );
  const operation = crypto.randomUUID(),
    packet = crypto.randomUUID(),
    device = crypto.randomUUID(),
    group = crypto.randomUUID(),
    groupPacket = crypto.randomUUID();
  await client.query(
    "INSERT INTO hash_talk.vault_operations(account_id,id,hash,object_hash,commit,charge,state,sequence) VALUES($1,$2,repeat('a',64),repeat('b',64),'{}',10000,'accepted',1)",
    [first, operation],
  );
  await client.query(
    "INSERT INTO hash_talk.message_packets(id,sender,recipient,sender_revision,recipient_revision,hash,body,charge,sender_charge,recipient_charge) VALUES($1,$2,$3,1,1,repeat('c',64),'{}',3000,1000,2000)",
    [packet, first, second],
  );
  await client.query(
    "INSERT INTO hash_talk.message_attachments(id,message_id,sender,recipient,descriptor,bytes,charge) VALUES(gen_random_uuid(),$1,$2,$3,'{}',1536,2048)",
    [packet, first, second],
  );
  await client.query(
    "INSERT INTO hash_talk.personal_removals(account_id,kind,id,hash,proof,retained_bytes,charge) VALUES($1,'message',$2,repeat('d',64),'{}',2048,2560)",
    [first, packet],
  );
  await client.query(
    "INSERT INTO hash_talk.message_recovery_keys(account_id,epoch,id,body,charge) VALUES($1,1,gen_random_uuid(),'{}',4096)",
    [first],
  );
  await client.query(
    "INSERT INTO hash_talk.groups(id,owner,revision,epoch,head,event,charge) VALUES($1,$2,1,1,repeat('e',64),'{}',1024)",
    [group, first],
  );
  await client.query(
    "INSERT INTO hash_talk.group_packets(id,group_id,epoch,sender,hash,body,pending_accounts,charge) VALUES($1,$2,1,$3,repeat('f',64),'{}','{}',1024)",
    [groupPacket, group, first],
  );
  const input = { first, second, device, packet, group, groupPacket };
  await seedControls(client, input);
  await seedStatus(client, input);
  await seedMatrix(client, input);
  await seedRepresentatives(client, first);
  const profiles = await seedSocial(client, accounts);
  return { accounts, first, second, operation, packet, profiles };
}

export async function assertPersonalQuotaMatches(
  client: pg.Client,
  accounts: string[],
) {
  for (const account of accounts)
    assert.equal(
      await vaultUsage(client, account),
      await referenceVaultUsage(client, account),
    );
  for (const scope of ['account', 'profile']) {
    const mismatch =
      await client.query(`SELECT coalesce(q.${scope}_id,t.${scope}_id) FROM hash_talk.${scope}_quota_usage q
      FULL JOIN hash_talk.${scope}_quota_totals t USING(${scope}_id) WHERE q.used_bytes IS DISTINCT FROM t.used_bytes`);
    assert.equal(
      mismatch.rowCount,
      0,
      'Direct-owner quota counters must reconcile.',
    );
  }
}
