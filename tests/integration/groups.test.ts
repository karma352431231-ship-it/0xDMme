import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ObjectStore } from '../../src/server/object-store/index.ts';
import {
  sealFile,
  openFile,
} from '../../src/client/attachment-crypto/index.ts';
import {
  attachmentRef,
  partLimit,
} from '../../src/shared/attachments/index.ts';
import { Wallet } from 'ethers';
import { Database } from '../../src/server/database/index.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { ContactService } from '../../src/server/contacts/index.ts';
import { MessageService } from '../../src/server/messages/index.ts';
import { NotificationService } from '../../src/server/notifications/index.ts';
import { localGroupEligibility } from '../../src/server/groups/index.ts';
import { messageBody } from '../../src/shared/messages/index.ts';
import { MessageCrypto } from '../../src/client/message-crypto/index.ts';
import {
  createRecoveryKey,
  openRecoveryKey,
  openRoomKey,
} from '../../src/client/message-recovery/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { groupParticipant } from '../fixtures/group-participant.ts';
import { contactBody } from '../../src/shared/contacts/index.ts';
import { object, base64, encode } from '../../src/shared/account/index.ts';
import {
  groupConsentProof,
  groupEventProof,
  groupEventHash,
} from '../../src/shared/groups/index.ts';
import type {
  GroupEvent,
  GroupConsent,
} from '../../src/shared/groups/index.ts';
import { sign } from '../../src/shared/devices/index.ts';

await test('governança persistente: criação atômica, convites, transferência, remoção e frequência sobrevivem à exclusão', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de teste necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  await db.migrate();
  await inspector.connect();
  const accounts = new AccountService({
      store: db.authentication,
      origin: 'http://127.0.0.1:45119',
    }),
    devices = new DeviceService(db.devices),
    contacts = new ContactService(db.contacts, db.devices);
  const ids: string[] = [],
    groupIds: string[] = [],
    machines: MessageCrypto[] = [];
  const mediaDirectory = await realpath(
    await mkdtemp(join(tmpdir(), '0xdmme-group-media-')),
  );
  const objects = new ObjectStore(mediaDirectory);
  await objects.initialize();
  const notifications = new NotificationService({
    store: db.daily,
    devices: db.devices,
    config: null,
  });
  const messages = new MessageService(db, db.devices, objects, {
    groupEligibility: localGroupEligibility(config, true),
    notifications,
  });
  const publicMessages = new MessageService(db, db.devices);
  t.after(async () => {
    for (const machine of machines) machine.close();
    await messages.close();
    await notifications.close();
    await rm(mediaDirectory, { recursive: true, force: true });
    await inspector.query('BEGIN');
    for (const table of [
      'group_reads',
      'group_controls',
      'group_media',
      'group_cleanups',
      'group_packets',
      'group_key_sets',
      'group_matrix_envelopes',
      'group_consents',
      'group_members',
      'group_events',
      'group_creation_window',
    ])
      await inspector.query(
        `DELETE FROM hash_talk.${table} WHERE group_id=ANY($1::uuid[])`,
        [groupIds],
      );
    await inspector.query(
      'DELETE FROM hash_talk.groups WHERE id=ANY($1::uuid[])',
      [groupIds],
    );
    await inspector.query(
      'DELETE FROM hash_talk.contact_relations WHERE lo=ANY($1::uuid[]) OR hi=ANY($1::uuid[])',
      [ids],
    );
    for (const table of [
      'contact_controls',
      'contact_blocks',
      'message_recovery_keys',
      'matrix_devices',
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
    return { ...participant, session: login.session, wallet };
  }
  type User = Awaited<ReturnType<typeof user>>;
  async function message(
    service: MessageService,
    u: User,
    op: string,
    payload: Record<string, unknown> = {},
  ) {
    const proof = { deviceId: u.deviceId, directory: u.head, payload };
    return service.operate(op, u.session, {
      ...proof,
      signature: await sign(
        u.signing,
        messageBody(u.accountId, u.deviceId, op, proof),
      ),
    });
  }
  const authority = (u: User) => ({ session: u.session, directory: u.head });
  const fields = (u: User) => ({
    actor: u.accountId,
    deviceId: u.deviceId,
    directory: u.head,
    authorityRevision: 1,
  });
  const evidence = (u: User, balance = 10_000n) => ({
    accountId: u.accountId,
    balance,
    decimals: 0,
    expiresAt: Date.now() + 60_000,
  });
  async function contact(
    u: User,
    op: string,
    payload: Record<string, unknown> = {},
  ) {
    const proof = { directory: u.head, payload };
    return contacts.operate(op, u.session, {
      ...proof,
      signature: await sign(
        u.signing,
        contactBody(u.accountId, u.deviceId, op, proof),
      ),
    });
  }
  async function changeContact(
    u: User,
    op: string,
    payload: Record<string, unknown>,
  ) {
    const state = object(await contact(u, 'state'));
    return contact(u, op, { revision: state['revision'], ...payload });
  }
  async function event(
    u: User,
    previous: GroupEvent | null,
    values: Partial<GroupEvent> = {},
  ) {
    const groupId = previous?.groupId ?? crypto.randomUUID();
    if (!groupIds.includes(groupId)) groupIds.push(groupId);
    const e: GroupEvent = {
      version: 1,
      groupId,
      revision: 1,
      epoch: 1,
      previous: null,
      kind: 'create',
      ...fields(u),
      target: null,
      owner: u.accountId,
      members: [{ accountId: u.accountId, role: 'owner', joined: 1 }],
      consent: null,
      signature: '',
      ...(previous
        ? {
            ...previous,
            ...fields(u),
            revision: previous.revision + 1,
            epoch: previous.epoch + 1,
            previous: await groupEventHash(previous),
            consent: null,
          }
        : {}),
      ...values,
    };
    e.members.sort((a, b) => a.accountId.localeCompare(b.accountId));
    e.signature = await sign(u.signing, groupEventProof(e));
    return e;
  }
  async function proposal(
    u: User,
    state: GroupEvent,
    target: User,
    kind: GroupConsent['kind'],
  ) {
    const p: GroupConsent = {
      version: 1,
      id: crypto.randomUUID(),
      kind,
      groupId: state.groupId,
      head: await groupEventHash(state),
      ...fields(u),
      target: target.accountId,
      targetDirectory: target.head,
      targetRevision: target.directory.revision,
      signature: '',
    };
    p.signature = await sign(u.signing, groupConsentProof(p));
    await db.groups.propose(authority(u), p);
    return p;
  }
  const owner = await user(),
    member = await user(),
    outsider = await user();
  await changeContact(member, 'configure', {
    mode: 'wallet',
    inviteHash: null,
  });
  await changeContact(owner, 'request', {
    target: member.accountId,
    invite: null,
  });
  await changeContact(member, 'respond', {
    target: owner.accountId,
    accept: true,
  });
  const first = await event(owner, null);
  assert.deepEqual(await message(messages, owner, 'group-mode'), {
    mode: 'fixture',
  });
  assert.deepEqual(await message(publicMessages, owner, 'group-mode'), {
    mode: 'unavailable',
  });
  await assert.rejects(
    message(publicMessages, owner, 'group-commit', { event: first }),
    /token do projeto/u,
  );
  await assert.rejects(
    message(messages, owner, 'group-commit', {
      event: first,
      eligibility: { balance: '100000' },
    }),
  );
  await message(messages, owner, 'group-commit', { event: first });
  await message(publicMessages, owner, 'group-commit', { event: first });
  await assert.rejects(
    message(messages, outsider, 'group-current', { groupId: first.groupId }),
  );
  await assert.rejects(db.groups.current(authority(outsider), first.groupId));
  const invite = await proposal(owner, first, member, 'invite');
  assert.equal(
    (await db.groups.incoming(authority(member), null)).items.length,
    1,
  );
  await changeContact(owner, 'block', {
    wallet: { ecosystem: 'evm', address: member.wallet.address },
    blocked: true,
  });
  assert.equal(
    (await db.groups.incoming(authority(member), null)).items.length,
    0,
  );
  await assert.rejects(
    db.groups.history(authority(member), { groupId: first.groupId, after: 0 }),
  );
  await changeContact(owner, 'block', {
    wallet: { ecosystem: 'evm', address: member.wallet.address },
    blocked: false,
  });
  await changeContact(owner, 'request', {
    target: member.accountId,
    invite: null,
  });
  await changeContact(member, 'respond', {
    target: owner.accountId,
    accept: true,
  });
  const joined = await event(member, first, {
    kind: 'join',
    target: member.accountId,
    consent: invite,
    members: [
      ...first.members,
      { accountId: member.accountId, role: 'member', joined: 2 },
    ],
  });
  const commits = await Promise.allSettled([
    db.groups.commit(authority(member), { event: joined }),
    db.groups.commit(authority(member), { event: joined }),
  ]);
  assert.ok(commits.every((r) => r.status === 'fulfilled'));
  assert.equal((await db.groups.list(authority(member), null)).items.length, 1);
  const participants = [owner, member].sort((a, b) =>
    a.accountId.localeCompare(b.accountId),
  );
  const ownVault = (u: User) => ({ ...u.authority, session: u.session });
  const recovery = await Promise.all(
    participants.map(async (u) => {
      const key = await createRecoveryKey(ownVault(u));
      await message(messages, u, 'recovery-register', { key });
      return key;
    }),
  );
  const machine = async (u: User) => {
    const result = await MessageCrypto.create({
      accountId: u.accountId,
      deviceId: u.deviceId,
      store: null,
      transport: (op, payload) => message(messages, u, op, payload),
    });
    machines.push(result);
    await result.prepare(ownVault(u));
    return result;
  };
  const sender = await machine(owner),
    reader = await machine(member),
    groupHead = await groupEventHash(joined);
  await changeContact(owner, 'block', {
    wallet: { ecosystem: 'evm', address: member.wallet.address },
    blocked: true,
  });
  await assert.rejects(
    message(messages, owner, 'matrix-query', {
      sdk: { device_keys: { [`@${member.accountId}:0xdmme.app`]: [] } },
    }),
  );
  const groupTransport = (
    op: 'matrix-upload' | 'matrix-query' | 'matrix-claim' | 'matrix-send',
    payload: Record<string, unknown>,
  ) =>
    op === 'matrix-upload'
      ? message(messages, owner, op, payload)
      : message(messages, owner, 'group-' + op, {
          groupId: joined.groupId,
          head: groupHead,
          payload,
        });
  const encrypted = await sender.encryptGroup({
    authority: ownVault(owner),
    state: joined,
    histories: participants.map((u) => [u.directory]),
    recovery,
    transport: groupTransport,
    id: crypto.randomUUID(),
    text: 'Conteúdo fictício dentro do grupo bloqueado',
  });
  const published = object(
    await message(messages, owner, 'group-message-publish', {
      packet: encrypted.packet,
      keys: encrypted.keys,
    }),
  );
  assert.deepEqual(
    await message(messages, owner, 'group-message-publish', {
      packet: encrypted.packet,
      keys: null,
    }),
    published,
  );
  const page = object(
    await message(messages, member, 'group-message-page', {
      groupId: joined.groupId,
      head: groupHead,
      after: 0,
    }),
  );
  assert.equal((page['items'] as unknown[]).length, 1);
  const key = recovery[participants.indexOf(member)];
  assert.ok(key);
  const secret = await openRecoveryKey(key, ownVault(member));
  const archive = encrypted.keys.archives.find(
    (a) => a.accountId === member.accountId,
  );
  assert.ok(archive);
  try {
    assert.equal(
      await reader.decryptGroup({
        packet: encrypted.packet,
        keys: encrypted.keys,
        period: joined,
        senderEvent: owner.directory,
        exported: openRoomKey(secret, archive),
      }),
      'Conteúdo fictício dentro do grupo bloqueado',
    );
  } finally {
    secret.free();
  }
  await assert.rejects(
    message(messages, outsider, 'group-message-page', {
      groupId: joined.groupId,
      head: groupHead,
      after: 0,
    }),
  );
  await assert.rejects(
    message(messages, member, 'group-message-received', {
      groupId: joined.groupId,
      head: groupHead,
      items: [{ id: encrypted.packet.id, hash: 'a'.repeat(64) }],
    }),
  );
  const wakeups: string[][] = [];
  const unobserve = db.changes.observe({
    notify: (change) => wakeups.push([...change.accounts]),
    failed: () => assert.fail('Falha no aviso de recebimento.'),
  });
  try {
    const receipt = {
      groupId: joined.groupId,
      head: groupHead,
      items: [{ id: encrypted.packet.id, hash: published['hash'] }],
    };
    await message(messages, member, 'group-message-received', receipt);
    assert.deepEqual(wakeups, [[owner.accountId]]);
    await message(messages, member, 'group-message-received', receipt);
    assert.deepEqual(
      wakeups,
      [[owner.accountId]],
      'ACK repetido não gera novo aviso',
    );
  } finally {
    unobserve();
  }
  const delivered = await inspector.query<{
    pending: number;
    received: number;
  }>(
    'SELECT cardinality(pending_accounts) AS pending,cardinality(received_accounts) AS received FROM hash_talk.group_packets WHERE id=$1',
    [encrypted.packet.id],
  );
  assert.deepEqual(delivered.rows[0], { pending: 0, received: 2 });
  await t.test(
    'nome cifrado é publicado apenas por administradores e não conta como mensagem não lida',
    async () => {
      const make = async (u: User, m: MessageCrypto) =>
        m.encryptGroup({
          authority: ownVault(u),
          state: joined,
          histories: participants.map((p) => [p.directory]),
          recovery,
          transport: (op, payload) =>
            op === 'matrix-upload'
              ? message(messages, u, op, payload)
              : message(messages, u, 'group-' + op, {
                  groupId: joined.groupId,
                  head: groupHead,
                  payload,
                }),
          id: crypto.randomUUID(),
          text: JSON.stringify({ version: 1, title: 'Grupo sintético' }),
          kind: 'profile',
        });
      const refused = await make(member, reader);
      await assert.rejects(
        message(messages, member, 'group-message-publish', {
          packet: refused.packet,
          keys: refused.keys,
        }),
        { status: 403 },
      );
      const profile = await make(owner, sender);
      await message(messages, owner, 'group-message-publish', {
        packet: profile.packet,
        keys: profile.keys,
      });
      const page = object(
        await message(messages, member, 'group-profile', {
          groupId: joined.groupId,
          head: groupHead,
        }),
      );
      assert.equal(
        (page['items'] as { id: string }[])[0]?.id,
        profile.packet.id,
      );
      assert.equal(JSON.stringify(page).includes('Grupo sintético'), false);
    },
  );
  await t.test(
    'controles do grupo preservam privacidade, silêncio e recebimento antes da leitura',
    async () => {
      const scope = { groupId: joined.groupId, head: groupHead },
        ids = [encrypted.packet.id];
      const state = object(
        await message(messages, member, 'group-daily-state', scope),
      );
      assert.equal(state['unread'], 1);
      await assert.rejects(
        message(messages, outsider, 'group-daily-states', { groups: [scope] }),
        { status: 409 },
      );
      assert.equal(
        (
          (await message(messages, member, 'group-daily-states', {
            groups: [scope],
          })) as unknown[]
        ).length,
        1,
      );
      await message(messages, member, 'group-daily-mute', {
        ...scope,
        revision: 0,
        mutedUntil: Date.now() + 86400000,
      });
      await assert.rejects(
        message(messages, member, 'group-daily-mute', {
          ...scope,
          revision: 0,
          mutedUntil: 0,
        }),
        { status: 409 },
      );
      await message(messages, member, 'group-daily-read', { ...scope, ids });
      assert.equal(
        object(await message(messages, member, 'group-daily-state', scope))[
          'unread'
        ],
        0,
      );
      const read = async () =>
        (
          (await message(messages, owner, 'group-daily-receipts', {
            ...scope,
            ids,
          })) as { read: boolean; received: boolean }[]
        )[0];
      assert.deepEqual(await read(), {
        id: ids[0],
        received: true,
        read: false,
      });
      const preferences = {
        online: false,
        lastSeen: false,
        readReceipts: true,
      };
      await message(messages, member, 'daily-configure', {
        revision: member.session.profileRevision,
        preferences,
      });
      assert.equal((await read())?.read, false);
      await message(messages, member, 'group-daily-read', { ...scope, ids });
      assert.equal((await read())?.read, true);
      await message(messages, member, 'daily-configure', {
        revision: member.session.profileRevision,
        preferences: { ...preferences, readReceipts: false },
      });
      await message(messages, member, 'daily-configure', {
        revision: member.session.profileRevision,
        preferences,
      });
      assert.equal((await read())?.read, false);
      assert.equal(
        await message(messages, owner, 'group-message-accepted', {
          ...scope,
          id: encrypted.packet.id,
          hash: published['hash'],
        }),
        true,
      );
      await assert.rejects(
        message(messages, owner, 'group-message-accepted', {
          ...scope,
          id: encrypted.packet.id,
          hash: 'a'.repeat(64),
        }),
        { status: 409 },
      );
    },
  );
  const repeated = await sender.encryptGroup({
    authority: ownVault(owner),
    state: joined,
    histories: participants.map((u) => [u.directory]),
    recovery,
    transport: groupTransport,
    id: crypto.randomUUID(),
    text: 'Outra mensagem sem duplicar a recuperação',
  });
  await message(messages, owner, 'group-message-publish', {
    packet: repeated.packet,
    keys: null,
  });
  const bundles = await inspector.query<{ count: number }>(
    'SELECT count(*)::integer AS count FROM hash_talk.group_key_sets WHERE group_id=$1',
    [joined.groupId],
  );
  assert.equal(bundles.rows[0]?.count, 1);
  const photo = Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3xkAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  const sealed = await sealFile(photo);
  const mediaMessage = await sender.encryptGroup({
    authority: ownVault(owner),
    state: joined,
    histories: participants.map((u) => [u.directory]),
    recovery,
    transport: groupTransport,
    id: crypto.randomUUID(),
    kind: 'attachment',
    text: JSON.stringify({
      version: 1,
      name: 'foto.png',
      type: 'image/png',
      caption: 'Foto sintética',
      image: true,
      file: sealed.file,
      thumbnail: null,
    }),
  });
  const mediaScope = { groupId: joined.groupId, head: groupHead };
  const mediaReserve = {
    ...mediaScope,
    message: mediaMessage.packet.id,
    refs: [sealed.file.ref],
  };
  await assert.rejects(
    message(messages, outsider, 'group-attachment-reserve', mediaReserve),
  );
  await message(messages, owner, 'group-attachment-reserve', mediaReserve);
  await assert.rejects(
    message(messages, owner, 'group-message-publish', {
      packet: mediaMessage.packet,
      keys: null,
    }),
  );
  const badBytes = sealed.bytes.slice();
  badBytes[0] = (badBytes[0] ?? 0) ^ 1;
  await assert.rejects(
    message(messages, owner, 'group-attachment-part', {
      ...mediaScope,
      id: sealed.file.ref.id,
      index: 0,
      ciphertext: encode(badBytes),
    }),
  );
  await message(messages, owner, 'group-attachment-part', {
    ...mediaScope,
    id: sealed.file.ref.id,
    index: 0,
    ciphertext: encode(sealed.bytes),
  });
  await message(messages, owner, 'group-attachment-finish', {
    ...mediaScope,
    id: sealed.file.ref.id,
  });
  await message(messages, owner, 'group-message-publish', {
    packet: mediaMessage.packet,
    keys: null,
  });
  const mediaRead = {
    ...mediaScope,
    message: mediaMessage.packet.id,
    id: sealed.file.ref.id,
    index: 0,
  };
  const downloaded = object(
    await message(messages, member, 'group-attachment-get', mediaRead),
  );
  assert.deepEqual(
    await openFile(sealed.file, base64(downloaded['ciphertext'], partLimit)),
    photo,
  );
  await assert.rejects(
    message(messages, outsider, 'group-attachment-get', mediaRead),
  );
  await assert.rejects(
    message(messages, member, 'group-vault-clear', mediaScope),
  );
  await t.test(
    'limpeza avisa por 24h, congela os mais antigos, mantém texto e não inventa entrega',
    async () => {
      // Synthetic quota rows avoid allocating 675 MB; the real encrypted upload above owns the I/O contract.
      const synthetic = Array.from({ length: 225 }, () => ({
        id: crypto.randomUUID(),
        message_id: crypto.randomUUID(),
        descriptor: attachmentRef({
          id: crypto.randomUUID(),
          hash: 'f'.repeat(64),
          bytes: 3_000_000,
          parts: Array.from({ length: 12 }, (_, i) => ({
            hash: 'f'.repeat(64),
            bytes: Math.min(partLimit, 3_000_000 - i * partLimit),
          })),
        }),
      }));
      await inspector.query(
        "INSERT INTO hash_talk.group_media(id,group_id,epoch,message_id,sender,descriptor,bytes,text_charge,charge,status,accepted_at) SELECT r.id,$1,$2,r.message_id,$3,r.descriptor,3000000,4096,3004096,'accepted',clock_timestamp() FROM jsonb_to_recordset($4::jsonb) AS r(id uuid,message_id uuid,descriptor jsonb)",
        [
          joined.groupId,
          joined.epoch,
          owner.accountId,
          JSON.stringify(synthetic),
        ],
      );
      const nearFull = synthetic.slice(0, 24).map((r) => ({
        ...r,
        id: crypto.randomUUID(),
        message_id: crypto.randomUUID(),
      }));
      await inspector.query(
        "INSERT INTO hash_talk.group_media(id,group_id,epoch,message_id,sender,descriptor,bytes,text_charge,charge,status,accepted_at) SELECT r.id,$1,$2,r.message_id,$3,r.descriptor,3000000,4096,3004096,'accepted',clock_timestamp() FROM jsonb_to_recordset($4::jsonb) AS r(id uuid,message_id uuid,descriptor jsonb)",
        [
          joined.groupId,
          joined.epoch,
          owner.accountId,
          JSON.stringify(nearFull),
        ],
      );
      const refused = attachmentRef({
        ...synthetic[0]?.descriptor,
        id: crypto.randomUUID(),
      });
      await assert.rejects(
        db.groupMedia.reserve(authority(owner), {
          ...mediaScope,
          message: crypto.randomUUID(),
          refs: [refused],
        }),
        { status: 413 },
      );
      assert.equal(
        (
          await inspector.query(
            'SELECT 1 FROM hash_talk.group_media WHERE id=$1',
            [refused.id],
          )
        ).rowCount,
        0,
      );
      await inspector.query(
        'DELETE FROM hash_talk.group_media WHERE id=ANY($1::uuid[])',
        [nearFull.map((r) => r.id)],
      );
      await db.groupRetention.tick();
      const notice = object(
        await message(messages, member, 'group-cleanup-notice', {
          ...mediaScope,
          after: 0,
        }),
      );
      const warning = object(notice['notice']);
      const state = object(
        await message(messages, member, 'group-daily-state', mediaScope),
      );
      assert.equal(Number(state['cleanupDueAt']), warning['dueAt']);
      assert.equal(state['cleanupBytes'], warning['bytes']);
      assert.ok(Number(warning['dueAt']) >= Date.now() + 86_390_000);
      const selected = await inspector.query<{ ids: string[]; bytes: number }>(
        'SELECT array_agg(id ORDER BY sequence) AS ids,sum(bytes)::integer AS bytes FROM hash_talk.group_media WHERE group_id=$1 AND cleanup=$2',
        [joined.groupId, warning['id']],
      );
      assert.ok((selected.rows[0]?.bytes ?? 0) >= 150_000_000);
      assert.ok((selected.rows[0]?.bytes ?? 0) < 153_000_100);
      await db.groupRetention.tick();
      const frozen = await inspector.query<{ ids: string[] }>(
        'SELECT array_agg(id ORDER BY sequence) AS ids FROM hash_talk.group_media WHERE group_id=$1 AND cleanup=$2',
        [joined.groupId, warning['id']],
      );
      assert.deepEqual(frozen.rows[0]?.ids, selected.rows[0]?.ids);
      await inspector.query(
        "UPDATE hash_talk.group_cleanups SET due_at=clock_timestamp()-interval '1 second' WHERE group_id=$1",
        [joined.groupId],
      );
      // Advance the fair maintenance cursor, then collect the frozen selection.
      await db.groupRetention.tick();
      await db.groupRetention.tick();
      await assert.rejects(
        message(messages, member, 'group-attachment-get', mediaRead),
      );
      const preserved = await inspector.query<{
        body: unknown;
        pending: number;
      }>(
        'SELECT body,cardinality(pending_accounts) AS pending FROM hash_talk.group_packets WHERE id=$1',
        [mediaMessage.packet.id],
      );
      assert.ok(preserved.rows[0]?.body);
      assert.equal(preserved.rows[0]?.pending, 1);
      const textPreserved = await inspector.query(
        'SELECT 1 FROM hash_talk.group_packets WHERE id=$1 AND body IS NOT NULL',
        [repeated.packet.id],
      );
      assert.equal(textPreserved.rowCount, 1);
      await messages.cleanAttachments();
      const physical = await inspector.query(
        'SELECT 1 FROM hash_talk.group_media WHERE id=$1',
        [sealed.file.ref.id],
      );
      assert.equal(physical.rowCount, 0);
    },
  );
  await assert.rejects(
    message(messages, owner, 'group-directory', {
      groupId: joined.groupId,
      head: groupHead,
      accounts: [{ accountId: outsider.accountId, after: 0 }],
    }),
  );
  const directory = object(
    await message(messages, member, 'group-directory', {
      groupId: joined.groupId,
      head: groupHead,
      accounts: participants.map((u) => ({ accountId: u.accountId, after: 0 })),
    }),
  );
  assert.equal((directory['directories'] as unknown[]).length, 2);
  assert.equal((directory['recovery'] as unknown[]).length, 2);
  const transfer = await proposal(owner, joined, member, 'transfer');
  const transferred = await event(member, joined, {
    kind: 'transfer',
    target: member.accountId,
    owner: member.accountId,
    consent: transfer,
    members: joined.members.map((m) => ({
      ...m,
      role: m.accountId === member.accountId ? 'owner' : 'member',
    })),
  });
  await assert.rejects(
    db.groups.commit(authority(member), {
      event: transferred,
      eligibility: evidence(member, 9_999n),
    }),
  );
  await db.groups.commit(authority(member), {
    event: transferred,
    eligibility: evidence(member),
  });
  assert.equal(
    (await db.groups.current(authority(member), first.groupId)).owner,
    member.accountId,
  );
  await assert.rejects(
    db.groups.propose(authority(owner), {
      ...transfer,
      id: crypto.randomUUID(),
      head: await groupEventHash(transferred),
    }),
  );
  await assert.rejects(db.groups.commit(authority(owner), { event: joined }));
  const left = await event(owner, transferred, {
    kind: 'leave',
    target: owner.accountId,
    members: transferred.members.filter((m) => m.accountId !== owner.accountId),
  });
  await db.groups.commit(authority(owner), { event: left });
  await assert.rejects(
    message(messages, owner, 'group-attachment-get', {
      ...mediaRead,
      head: await groupEventHash(left),
    }),
  );
  await assert.rejects(
    message(messages, owner, 'group-message-page', {
      groupId: first.groupId,
      head: await groupEventHash(left),
      after: 0,
    }),
  );
  await assert.rejects(
    db.groups.history(authority(owner), { groupId: first.groupId, after: 0 }),
  );
  const deleted = await event(member, left, {
    kind: 'delete',
    target: null,
    members: [],
  });
  await message(messages, member, 'group-vault-clear', {
    groupId: left.groupId,
    head: await groupEventHash(left),
  });
  await db.groupRetention.tick();
  await db.groupRetention.tick();
  assert.equal(
    (
      await inspector.query(
        'SELECT 1 FROM hash_talk.group_packets WHERE group_id=$1 AND body IS NOT NULL',
        [left.groupId],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await inspector.query(
        'SELECT 1 FROM hash_talk.group_key_sets WHERE group_id=$1',
        [left.groupId],
      )
    ).rowCount,
    0,
  );
  await db.groups.commit(authority(member), { event: deleted });
  await messages.cleanAttachments();
  assert.equal(
    (
      await stat(join(mediaDirectory, `group-${deleted.groupId}`))
    ).isDirectory(),
    true,
  );
  let retired = false;
  for (let pass = 0; pass < 64 && !retired; pass++) {
    await messages.cleanAttachments();
    const row = (
      await inspector.query<{
        clearing: boolean;
        media_scope_retired: boolean;
      }>(
        'SELECT clearing,media_scope_retired FROM hash_talk.groups WHERE id=$1',
        [deleted.groupId],
      )
    ).rows[0];
    retired = !!row && !row.clearing && row.media_scope_retired;
  }
  assert.equal(retired, true);
  await assert.rejects(stat(join(mediaDirectory, `group-${deleted.groupId}`)), {
    code: 'ENOENT',
  });
  assert.deepEqual(
    (
      await inspector.query(
        'SELECT clearing,media_scope_retired FROM hash_talk.groups WHERE id=$1',
        [deleted.groupId],
      )
    ).rows[0],
    { clearing: false, media_scope_retired: true },
  );
  assert.equal((await db.groups.list(authority(member), null)).items.length, 0);
  const second = await event(owner, null);
  await assert.rejects(
    db.groups.commit(authority(owner), {
      event: second,
      eligibility: evidence(owner),
    }),
    /Limite de criação/u,
  );
  const events = await inspector.query<{ count: number }>(
    'SELECT count(*)::integer AS count FROM hash_talk.group_events WHERE group_id=$1',
    [first.groupId],
  );
  assert.equal(events.rows[0]?.count, 5);
});
