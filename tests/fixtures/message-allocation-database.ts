import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import { Wallet } from 'ethers';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import {
  createIdentity,
  createRecovery,
  newSecret,
} from '../../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../../src/client/device-operations/index.ts';
import { eventHash } from '../../src/shared/devices/index.ts';
import type { MessagePacket } from '../../src/shared/messages/index.ts';
import { vaultAllocationFixture } from './vault-allocation-database.ts';
import { globalBytes, globalSourceSnapshot } from './global-usage-database.ts';

export async function messageAllocationFixture(t: TestContext) {
  let before: { rows: unknown; total: bigint; catalog: unknown } | undefined;
  let after: { rows: unknown; total: bigint } | undefined;
  const c = await vaultAllocationFixture(
    t,
    undefined,
    async (client) => {
      const sources = (
        await client.query<{
          name: string;
        }>(`SELECT DISTINCT c.relname AS name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE t.tgfoid='hash_talk.track_statement_content_usage()'::regprocedure ORDER BY c.relname`)
      ).rows;
      before = {
        rows: await globalSourceSnapshot(client, sources),
        total: await globalBytes(client),
        catalog: (
          await client.query(
            'SELECT * FROM hash_talk.schema_migrations ORDER BY version',
          )
        ).rows,
      };
    },
    async (client) => {
      const sources = (
        await client.query<{ name: string }>(`SELECT DISTINCT c.relname AS name
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE t.tgfoid='hash_talk.track_statement_content_usage()'::regprocedure ORDER BY c.relname`)
      ).rows;
      after = {
        rows: await globalSourceSnapshot(client, sources),
        total: await globalBytes(client),
      };
    },
  );
  assert.ok(before);
  assert.ok(after);
  return { ...c, upgrade: { ...before, after } };
}
export type MessageAllocationFixture = Awaited<
  ReturnType<typeof messageAllocationFixture>
>;
export async function messageUser(
  c: Pick<MessageAllocationFixture, 'db' | 'inspector'>,
) {
  const accounts = new AccountService({
      store: c.db.authentication,
      origin: 'http://127.0.0.1:45117',
    }),
    wallet = Wallet.createRandom(),
    deviceId = crypto.randomUUID();
  const challenge = await accounts.challenge({
      address: wallet.address,
      chainId: 1,
      deviceId,
    }),
    login = await accounts.login(
      {
        id: challenge.id,
        signature: await wallet.signMessage(challenge.message),
      },
      challenge.browserToken,
    ),
    identity = await createIdentity(deviceId, 'Synthetic admission'),
    recovery = await createRecovery(login.session.accountId, newSecret()),
    event = await prepareEvent({
      accountId: login.session.accountId,
      previous: null,
      kind: 'initialize',
      signer: 'recovery',
      signing: recovery.signing,
      root: recovery.root,
      identities: [identity.public],
      ring: freshKeyring(login.session.accountId),
      profile: null,
    });
  await new DeviceService(c.db.devices).commit(login.session, {
    event,
    profile: null,
  });
  const directory = await eventHash(event),
    key = crypto.randomUUID();
  await c.inspector.query(
    `INSERT INTO hash_talk.message_recovery_keys(id,account_id,epoch,body,charge)
    VALUES($1,$2,1,'{}',4096)`,
    [key, login.session.accountId],
  );
  return { session: login.session, directory, key, event };
}
export type MessageUser = Awaited<ReturnType<typeof messageUser>>;
export async function messagePair(
  c: Pick<MessageAllocationFixture, 'db' | 'inspector'>,
) {
  const sender = await messageUser(c),
    recipient = await messageUser(c);
  await c.inspector.query(
    `INSERT INTO hash_talk.contact_relations(lo,hi,requester,state)
    VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'approved')`,
    [sender.session.accountId, recipient.session.accountId],
  );
  return { sender, recipient };
}
/** Database-contract fixture only; the assembled suite separately verifies real Olm/Megolm and signatures. */
export function admissionPacket(pair: {
  sender: MessageUser;
  recipient: MessageUser;
}): MessagePacket {
  const { sender, recipient } = pair,
    device = sender.session.deviceId;
  return {
    version: 1,
    id: crypto.randomUUID(),
    kind: 'text',
    sender: sender.session.accountId,
    recipient: recipient.session.accountId,
    deviceId: device,
    senderDirectory: sender.directory,
    recipientDirectory: recipient.directory,
    senderRevision: 1,
    recipientRevision: 1,
    content: {
      algorithm: 'm.megolm.v1.aes-sha2',
      sender_key: 'a'.repeat(43),
      session_id: 'b'.repeat(43),
      device_id: device,
      ciphertext: 'c'.repeat(128),
    },
    binding: {
      accountId: sender.session.accountId,
      deviceId: device,
      directory: sender.directory,
      authorityRevision: 1,
      public: {
        user_id: 'synthetic',
        device_id: device,
        algorithms: [],
        keys: {},
        signatures: {},
      },
      signature: 'synthetic',
    },
    archives: [sender, recipient].map((user) => ({
      accountId: user.session.accountId,
      keyId: user.key,
      ciphertext: 'a'.repeat(64),
      ephemeral: 'b'.repeat(43),
      mac: 'c'.repeat(11),
    })),
    signature: 'synthetic',
  };
}
export async function bindMessage(
  c: MessageAllocationFixture,
  input: { packet: MessagePacket; bytes?: number },
) {
  const grant = await c.allocator.reserve(
    c.writer,
    input.bytes ?? 1_000_000,
    'message-admit',
  );
  await c.writer.query(
    `SELECT set_config('hash_talk.content_allocation',$1,true),set_config('hash_talk.content_account',$2,true),
    set_config('hash_talk.content_peer',$3,true),set_config('hash_talk.content_operation',$4,true),set_config('hash_talk.content_message_attachments',$5,true)`,
    [
      grant.transactionId,
      input.packet.sender,
      input.packet.recipient,
      input.packet.id,
      JSON.stringify((input.packet.attachments ?? []).map((r) => r.id)),
    ],
  );
  return grant;
}
export async function insertAdmissionPacket(
  client: pg.Client,
  packet: MessagePacket,
) {
  await client.query(
    `INSERT INTO hash_talk.message_packets(id,sender,recipient,sender_revision,recipient_revision,hash,body,charge,sender_charge,recipient_charge,kind)
    VALUES($1,$2,$3,1,1,repeat('a',64),$4,4096,512,512,$5)`,
    [
      packet.id,
      packet.sender,
      packet.recipient,
      JSON.stringify(packet),
      packet.kind,
    ],
  );
}
