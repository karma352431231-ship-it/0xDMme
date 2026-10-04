import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Wallet } from 'ethers';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Database } from '../../src/server/database/index.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { ContactService } from '../../src/server/contacts/index.ts';
import { MessageService } from '../../src/server/messages/index.ts';
import { ObjectStore } from '../../src/server/object-store/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  StatusEncryption,
  openStatus,
} from '../../src/client/status-crypto/index.ts';
import {
  sealFile,
  openFile,
} from '../../src/client/attachment-crypto/index.ts';
import {
  createRecoveryKey,
  openRecoveryKey,
  openRoomKey,
} from '../../src/client/message-recovery/index.ts';
import { groupParticipant } from '../fixtures/group-participant.ts';
import { messageBody } from '../../src/shared/messages/index.ts';
import { contactBody } from '../../src/shared/contacts/index.ts';
import { sign, canonical } from '../../src/shared/devices/index.ts';
import { object, encode, base64 } from '../../src/shared/account/index.ts';
import {
  statusAudienceHead,
  statusPacket,
  statusEnvelope,
} from '../../src/shared/status/index.ts';
import { partLimit } from '../../src/shared/attachments/index.ts';
await test('status persistente: audiência congelada, novo contato, bloqueio, foto cifrada, expiração e coleta fora do backup', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  await db.migrate();
  await inspector.connect();
  const root = await realpath(await mkdtemp(join(tmpdir(), '0xdmme-status-'))),
    objects = new ObjectStore(root);
  await objects.initialize();
  const messages = new MessageService(db, db.devices, objects),
    devices = new DeviceService(db.devices),
    contacts = new ContactService(db.contacts, db.devices);
  const accounts = new AccountService({
    store: db.authentication,
    origin: 'http://127.0.0.1:45119',
  });
  const ids: string[] = [],
    posts: string[] = [];
  t.after(async () => {
    await messages.close();
    await rm(root, { recursive: true, force: true });
    await inspector.query('BEGIN');
    for (const table of ['status_media', 'status_pages', 'status_recipients'])
      await inspector.query(
        `DELETE FROM hash_talk.${table} WHERE status_id=ANY($1::uuid[])`,
        [posts],
      );
    await inspector.query(
      'DELETE FROM hash_talk.status_posts WHERE id=ANY($1::uuid[])',
      [posts],
    );
    await inspector.query(
      'DELETE FROM hash_talk.contact_relations WHERE lo=ANY($1::uuid[]) OR hi=ANY($1::uuid[])',
      [ids],
    );
    for (const table of [
      'contact_blocks',
      'contact_controls',
      'message_recovery_keys',
      'device_events',
      'device_directories',
      'login_sessions',
      'login_devices',
    ])
      await inspector.query(
        `DELETE FROM hash_talk.${table} WHERE account_id=ANY($1::uuid[])`,
        [ids],
      );
    await inspector.query(
      'DELETE FROM hash_talk.accounts WHERE id=ANY($1::uuid[])',
      [ids],
    );
    await inspector.query('COMMIT');
    await inspector.end();
    await db.close();
  });
  async function user() {
    const wallet = Wallet.createRandom(),
      challenge = await accounts.challenge({
        ecosystem: 'evm',
        address: wallet.address,
        chainId: 1,
        deviceId: crypto.randomUUID(),
      });
    const login = await accounts.login(
      {
        id: challenge.id,
        signature: await wallet.signMessage(challenge.message),
      },
      challenge.browserToken,
    );
    ids.push(login.session.accountId);
    const participant = await groupParticipant({
      accountId: login.session.accountId,
      deviceId: login.session.deviceId,
    });
    await devices.commit(login.session, {
      event: participant.directory,
      profile: null,
    });
    const authority = { ...participant.authority, session: login.session },
      recovery = await createRecoveryKey(authority);
    await db.messageRecovery.register(
      { session: login.session, directory: participant.head },
      recovery,
    );
    return {
      ...participant,
      wallet,
      session: login.session,
      authority,
      recovery,
    };
  }
  type User = Awaited<ReturnType<typeof user>>;
  const acl = (u: User) => ({ session: u.session, directory: u.head });
  async function op(u: User, name: string, payload: Record<string, unknown>) {
    const proof = { deviceId: u.deviceId, directory: u.head, payload };
    return messages.operate(name, u.session, {
      ...proof,
      signature: await sign(
        u.signing,
        messageBody(u.accountId, u.deviceId, name, proof),
      ),
    });
  }
  async function changeContact(
    u: User,
    name: string,
    payload: Record<string, unknown>,
  ) {
    const state = await db.contacts.state(acl(u)),
      proof = {
        directory: u.head,
        payload: { revision: state.revision, ...payload },
      };
    return contacts.operate(name, u.session, {
      ...proof,
      signature: await sign(
        u.signing,
        contactBody(u.accountId, u.deviceId, name, proof),
      ),
    });
  }
  async function approve(author: User, viewer: User) {
    await changeContact(viewer, 'configure', {
      mode: 'wallet',
      inviteHash: null,
    });
    await changeContact(author, 'request', {
      target: viewer.accountId,
      invite: null,
    });
    await changeContact(viewer, 'respond', {
      target: author.accountId,
      accept: true,
    });
  }
  const author = await user(),
    viewer = await user(),
    newContact = await user();
  await approve(author, viewer);
  const id = crypto.randomUUID();
  posts.push(id);
  const status = await StatusEncryption.create({
    authority: author.authority,
    id,
    kind: 'text',
    text: 'Status sintético privado',
  });
  t.after(() => status.close());
  await op(author, 'status-begin', { id });
  const audience = object(
    await op(author, 'status-contacts', { id, after: null }),
  );
  assert.deepEqual(audience['accounts'], [viewer.accountId]);
  await assert.rejects(
    op(author, 'status-recipient-directory', {
      id,
      accounts: [{ accountId: newContact.accountId, after: 0 }],
    }),
  );
  const envelopes = await Promise.all(
    [author, viewer].map((u) =>
      status.recipient({
        authority: author.authority,
        history: [u.directory],
        recovery: u.recovery,
      }),
    ),
  );
  const head = await statusAudienceHead(null, envelopes),
    page = { id, page: 1, previous: null, envelopes };
  const saved = object(await op(author, 'status-recipients', page));
  assert.equal(saved['head'], head);
  assert.deepEqual(await op(author, 'status-recipients', page), saved);
  await assert.rejects(
    op(author, 'status-recipients', {
      ...page,
      envelopes: [...envelopes].reverse(),
    }),
  );
  const ready = object(await op(author, 'status-ready', { id }));
  const packet = await status.publish({
    authority: author.authority,
    publishedAt: Number(ready['publishedAt']),
    audienceHead: head,
  });
  const published = await op(author, 'status-publish', { packet });
  assert.deepEqual(await op(author, 'status-publish', { packet }), published);
  const data = object(await op(viewer, 'status-read', { id })),
    recipient = statusEnvelope(data['envelope']);
  assert.ok(!canonical(recipient).includes(newContact.accountId));
  const secret = await openRecoveryKey(viewer.recovery, viewer.authority);
  try {
    assert.equal(
      await openStatus({
        authority: viewer.authority,
        packet: statusPacket(data['packet']),
        envelope: recipient,
        origin: author.directory,
        exported: openRoomKey(secret, recipient.recipient.archive),
        now: Date.now(),
      }),
      'Status sintético privado',
    );
  } finally {
    secret.free();
  }
  await assert.rejects(op(newContact, 'status-read', { id }));
  await approve(author, newContact);
  await assert.rejects(op(newContact, 'status-read', { id }));
  // Withdrawal is simulated in this fixture: an active frozen publication survives an unblocked contact edit.
  await inspector.query(
    "UPDATE hash_talk.contact_relations SET state='rejected' WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid)",
    [author.accountId, viewer.accountId],
  );
  await inspector.query(
    'UPDATE hash_talk.contact_controls SET revision=revision+1 WHERE account_id=ANY($1::uuid[])',
    [[author.accountId, viewer.accountId]],
  );
  assert.ok(object(await op(viewer, 'status-read', { id }))['packet']);
  await changeContact(author, 'block', {
    wallet: { ecosystem: 'evm', address: viewer.wallet.address },
    blocked: true,
  });
  await assert.rejects(op(viewer, 'status-read', { id }));
  assert.deepEqual(
    object(await op(viewer, 'status-list', { after: null }))['items'],
    [],
  );
  await changeContact(author, 'block', {
    wallet: { ecosystem: 'evm', address: viewer.wallet.address },
    blocked: false,
  });
  assert.ok(object(await op(viewer, 'status-read', { id }))['packet']);
  const stale = crypto.randomUUID();
  posts.push(stale);
  await op(author, 'status-begin', { id: stale });
  await changeContact(author, 'configure', {
    mode: 'wallet',
    inviteHash: null,
  });
  await assert.rejects(
    op(author, 'status-contacts', { id: stale, after: null }),
    { status: 409 },
  );
  await op(author, 'status-remove', { id: stale });
  const photo = Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3xkAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  const sealed = await sealFile(photo),
    photoId = crypto.randomUUID();
  posts.push(photoId);
  const encryption = await StatusEncryption.create({
    authority: author.authority,
    id: photoId,
    kind: 'photo',
    text: JSON.stringify({
      version: 1,
      name: 'foto.png',
      type: 'image/png',
      caption: '',
      image: true,
      file: sealed.file,
      thumbnail: null,
    }),
  });
  t.after(() => encryption.close());
  await op(author, 'status-begin', { id: photoId });
  const photoEnvelopes = await Promise.all(
    [author, newContact].map((u) =>
      encryption.recipient({
        authority: author.authority,
        history: [u.directory],
        recovery: u.recovery,
      }),
    ),
  );
  await op(author, 'status-recipients', {
    id: photoId,
    page: 1,
    previous: null,
    envelopes: photoEnvelopes,
  });
  await op(author, 'status-attachment-reserve', {
    statusId: photoId,
    refs: [sealed.file.ref],
  });
  await op(author, 'status-attachment-part', {
    statusId: photoId,
    id: sealed.file.ref.id,
    index: 0,
    ciphertext: encode(sealed.bytes),
  });
  const photoReady = object(await op(author, 'status-ready', { id: photoId })),
    photoPacket = await encryption.publish({
      authority: author.authority,
      publishedAt: Number(photoReady['publishedAt']),
      audienceHead: await statusAudienceHead(null, photoEnvelopes),
    });
  await assert.rejects(op(author, 'status-publish', { packet: photoPacket }));
  await op(author, 'status-attachment-finish', {
    statusId: photoId,
    id: sealed.file.ref.id,
  });
  await op(author, 'status-publish', { packet: photoPacket });
  await assert.rejects(op(viewer, 'status-read', { id: photoId }));
  const downloaded = object(
    await op(newContact, 'status-attachment-get', {
      statusId: photoId,
      id: sealed.file.ref.id,
      index: 0,
    }),
  );
  assert.deepEqual(
    await openFile(sealed.file, base64(downloaded['ciphertext'], partLimit)),
    photo,
  );
  assert.equal(
    (
      await inspector.query(
        'SELECT 1 FROM hash_talk.message_packets WHERE id=ANY($1::uuid[])',
        [posts],
      )
    ).rowCount,
    0,
  );
  await inspector.query(
    "UPDATE hash_talk.status_posts SET expires_at=clock_timestamp()-interval '1 second' WHERE id=ANY($1::uuid[])",
    [[id, photoId]],
  );
  await assert.rejects(op(newContact, 'status-read', { id: photoId }));
  await assert.rejects(
    op(newContact, 'status-attachment-get', {
      statusId: photoId,
      id: sealed.file.ref.id,
      index: 0,
    }),
  );
  await messages.cleanAttachments();
  await messages.cleanAttachments();
  assert.equal(
    (
      await inspector.query(
        'SELECT 1 FROM hash_talk.status_posts WHERE id=ANY($1::uuid[])',
        [posts],
      )
    ).rowCount,
    0,
  );
  await assert.rejects(objects.readStatusMedia(photoId));
});
