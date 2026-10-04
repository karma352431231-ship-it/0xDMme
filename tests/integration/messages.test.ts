import { MessageLive } from '../../src/server/message-live/index.ts';
import { WakeupFrames } from '../../src/client/message-live/index.ts';
import { voiceWav } from '../../src/client/voice-audio/index.ts';
import { validateVoice, voiceRate } from '../../src/shared/voice/index.ts';
import { attachmentContent } from '../../src/shared/attachments/index.ts';
import webpush from 'web-push';
import { NotificationService } from '../../src/server/notifications/index.ts';
import {
  verifyDeletion,
  messageItems,
} from '../../src/client/messages/history.ts';
import { encodeDailyText } from '../../src/shared/daily/index.ts';
import { mkdtemp, realpath, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObjectStore } from '../../src/server/object-store/index.ts';
import {
  sealFile,
  openFile,
} from '../../src/client/attachment-crypto/index.ts';
import { contentRefs, partLimit } from '../../src/shared/attachments/index.ts';
import { indexedPacket } from '../../src/client/messages/history.ts';
import { base64, encode } from '../../src/shared/account/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Wallet } from 'ethers';
import { createWebServer } from '../../src/server/web-host/index.ts';
import { Database } from '../../src/server/database/index.ts';
import {
  AccountService,
  createAccountHandler,
} from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { ContactService } from '../../src/server/contacts/index.ts';
import { MessageService } from '../../src/server/messages/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { MessageCrypto } from '../../src/client/message-crypto/index.ts';
import {
  createRecoveryKey,
  openRecoveryKey,
  openRoomKey,
} from '../../src/client/message-recovery/index.ts';
import {
  createIdentity,
  createRecovery,
  newSecret,
  aesKey,
} from '../../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../../src/client/device-operations/index.ts';
import { contactBody } from '../../src/shared/contacts/index.ts';
import {
  digest,
  eventHash,
  linkProof,
  sign,
} from '../../src/shared/devices/index.ts';
import {
  verifyRemoval,
  personalRemoval,
} from '../../src/shared/backups/index.ts';
import { messageBody, messagePacket } from '../../src/shared/messages/index.ts';
import type {
  MessagePacket,
  RecoveryKey,
} from '../../src/shared/messages/index.ts';
import type { VaultAuthority } from '../../src/client/vault-authority/index.ts';
import {
  encodeProfileCard,
  profileCard,
} from '../../src/client/message-profile/index.ts';
import { object } from '../../src/shared/account/index.ts';
await test('mensagens persistentes: Olm/Megolm, recuperação, idempotência, exclusão, bloqueio, cotas e aparelhos', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de teste necessário.');
  let db = new Database(config.databaseUrl);
  await db.migrate();
  const inspector = new pg.Client({ connectionString: config.databaseUrl });
  await inspector.connect();
  let accounts = new AccountService({
      store: db.authentication,
      origin: 'http://127.0.0.1:45119',
    }),
    devices = new DeviceService(db.devices),
    contacts = new ContactService(db.contacts, db.devices);
  const attachmentDirectory = await realpath(
      await mkdtemp(join(tmpdir(), '0xdmme-attachment-test-')),
    ),
    objects = new ObjectStore(attachmentDirectory);
  await objects.initialize();
  const vapid = webpush.generateVAPIDKeys();
  const delivered: string[] = [];
  let notifications = new NotificationService({
    store: db.daily,
    devices: db.devices,
    config: { ...vapid, subject: 'https://0xdmme.app' },
    send: (subscription) => {
      delivered.push(subscription.endpoint);
      return Promise.resolve();
    },
  });
  let messages = new MessageService(db, db.devices, objects, notifications);
  const ids: string[] = [],
    machines: MessageCrypto[] = [];
  t.after(async () => {
    for (const machine of machines) machine.close();
    await inspector.query('BEGIN');
    await inspector.query(
      'DELETE FROM hash_talk.message_attachments WHERE sender=ANY($1::uuid[]) OR recipient=ANY($1::uuid[])',
      [ids],
    );
    await inspector.query<Record<string, unknown>>(
      'DELETE FROM hash_talk.message_packets WHERE sender=ANY($1::uuid[]) OR recipient=ANY($1::uuid[])',
      [ids],
    );
    await inspector.query<Record<string, unknown>>(
      'DELETE FROM hash_talk.matrix_envelopes WHERE sender=ANY($1::uuid[]) OR account_id=ANY($1::uuid[])',
      [ids],
    );
    await inspector.query<Record<string, unknown>>(
      'DELETE FROM hash_talk.contact_relations WHERE lo=ANY($1::uuid[]) OR hi=ANY($1::uuid[])',
      [ids],
    );
    for (const table of [
      'device_links',
      'device_events',
      'device_directories',
      'login_sessions',
      'login_devices',
    ])
      await inspector.query<Record<string, unknown>>(
        `DELETE FROM hash_talk.${table} WHERE account_id=ANY($1::uuid[])`,
        [ids],
      );
    await inspector.query<Record<string, unknown>>(
      'DELETE FROM hash_talk.accounts WHERE id=ANY($1::uuid[])',
      [ids],
    );
    await inspector.query('COMMIT');
    await inspector.end();
    await db.close();
    await rm(attachmentDirectory, { recursive: true, force: true });
  });
  async function login(wallet = Wallet.createRandom()) {
    const challenge = await accounts.challenge({
      ecosystem: 'evm',
      address: wallet.address,
      chainId: 1,
      deviceId: crypto.randomUUID(),
    });
    const auth = await accounts.login(
      {
        id: challenge.id,
        signature: await wallet.signMessage(challenge.message),
      },
      challenge.browserToken,
    );
    if (!ids.includes(auth.session.accountId)) ids.push(auth.session.accountId);
    return { ...auth, wallet };
  }
  async function create() {
    const user = await login(),
      identity = await createIdentity(user.session.deviceId, 'Sintético'),
      recovery = await createRecovery(user.session.accountId, newSecret()),
      ring = freshKeyring(user.session.accountId);
    const event = await prepareEvent({
      accountId: user.session.accountId,
      previous: null,
      kind: 'initialize',
      signer: 'recovery',
      signing: recovery.signing,
      root: recovery.root,
      identities: [identity.public],
      ring,
      profile: null,
    });
    await devices.commit(user.session, { event, profile: null });
    return { ...user, identity, recovery, ring, events: [event] };
  }
  type User = Awaited<ReturnType<typeof create>>;
  async function authority(user: User): Promise<VaultAuthority> {
    const event = user.events.at(-1);
    if (!event) throw new Error('Evento ausente.');
    return {
      session: user.session,
      offline: false,
      directory: await eventHash(event),
      epoch: event.epoch,
      events: user.events,
      key: (epoch) => aesKey(user.ring.keys[epoch - 1] ?? ''),
      sign: (proof) => sign(user.identity.signing, proof),
    };
  }
  async function proof(
    user: User,
    operation: string,
    payload: Record<string, unknown>,
  ) {
    const a = await authority(user),
      p = { deviceId: user.session.deviceId, directory: a.directory, payload };
    return {
      ...p,
      signature: await a.sign(
        messageBody(
          user.session.accountId,
          user.session.deviceId,
          operation,
          p,
        ),
      ),
    };
  }
  async function op(
    user: User,
    operation: string,
    payload: Record<string, unknown> = {},
  ) {
    return messages.operate(
      operation,
      user.session,
      await proof(user, operation, payload),
    );
  }
  async function contact(
    user: User,
    operation: string,
    payload: Record<string, unknown> = {},
  ) {
    const a = await authority(user),
      p = { directory: a.directory, payload };
    return contacts.operate(operation, user.session, {
      ...p,
      signature: await a.sign(
        contactBody(
          user.session.accountId,
          user.session.deviceId,
          operation,
          p,
        ),
      ),
    });
  }
  async function contactChange(
    user: User,
    operation: string,
    payload: Record<string, unknown>,
  ) {
    const state = object(await contact(user, 'state'));
    return contact(user, operation, {
      revision: state['revision'],
      ...payload,
    });
  }
  async function approve(a: User, b: User) {
    await contactChange(b, 'configure', { mode: 'wallet', inviteHash: null });
    await contactChange(a, 'request', {
      target: b.session.accountId,
      invite: null,
    });
    await contactChange(b, 'respond', {
      target: a.session.accountId,
      accept: true,
    });
  }
  async function link(user: User) {
    const next = await login(user.wallet),
      identity = await createIdentity(
        next.session.deviceId,
        'Computador offline',
      );
    const code = {
      version: 1 as const,
      nonce: await digest(newSecret()),
      id: crypto.randomUUID(),
      accountId: user.session.accountId,
      device: identity.public,
      expiresAt: new Date(Date.now() + 240000).toISOString(),
    };
    await devices.start(next.session, {
      code,
      signature: await sign(identity.signing, linkProof(code)),
    });
    const previous = user.events.at(-1);
    if (!previous) throw new Error('Evento ausente.');
    const event = await prepareEvent({
      accountId: user.session.accountId,
      previous,
      kind: 'link',
      signer: user.session.deviceId,
      signing: user.identity.signing,
      root: previous.root,
      identities: [user.identity.public, identity.public],
      ring: user.ring,
      profile: null,
      linkId: code.id,
    });
    await devices.commit(user.session, { event, profile: null });
    user.events.push(event);
    return { ...user, ...next, identity, events: user.events };
  }
  const alice = await create(),
    bob = await create(),
    outsider = await create(),
    computer = await link(bob);
  await approve(alice, bob);
  async function recovery(user: User) {
    return (await op(user, 'recovery-register', {
      key: await createRecoveryKey(await authority(user)),
    })) as RecoveryKey;
  }
  const aliceKey = await recovery(alice),
    bobKey = await recovery(bob);
  const sends: { user: User; payload: Record<string, unknown> }[] = [];
  async function machine(user: User) {
    const crypto = await MessageCrypto.create({
      accountId: user.session.accountId,
      deviceId: user.session.deviceId,
      store: null,
      transport: async (operation, payload) => {
        if (operation === 'matrix-send') sends.push({ user, payload });
        return op(user, operation, payload);
      },
    });
    machines.push(crypto);
    return crypto;
  }
  const phone = await machine(bob);
  await phone.prepare(await authority(bob));
  const sender = await machine(alice);
  async function packet(text: string) {
    return sender.encrypt({
      authority: await authority(alice),
      peerHistory: bob.events,
      recovery: [aliceKey, bobKey],
      id: crypto.randomUUID(),
      text,
    });
  }
  async function publish(p: MessagePacket) {
    return op(alice, 'publish', { packet: p });
  }
  const accepted = await packet('Conteúdo sintético privado'),
    hash = await digest(JSON.stringify(accepted));
  await t.test(
    'somente consentimento e assinatura atuais admitem conteúdo; confirmação falsa não altera a fila',
    async () => {
      await assert.rejects(op(outsider, 'publish', { packet: accepted }));
      const corrupt = { ...accepted, signature: 'A'.repeat(86) + '==' };
      await assert.rejects(publish(corrupt));
      await publish(accepted);
      const bad = await proof(bob, 'acknowledge', { id: accepted.id, hash });
      bad.signature = 'A'.repeat(86) + '==';
      await assert.rejects(messages.operate('acknowledge', bob.session, bad));
      await assert.rejects(
        op(outsider, 'acknowledge', { id: accepted.id, hash }),
      );
      await assert.rejects(
        op(bob, 'acknowledge', { id: accepted.id, hash: '0'.repeat(64) }),
      );
      const refs = await inspector.query<Record<string, unknown>>(
        'SELECT status FROM hash_talk.message_references WHERE message_id=$1',
        [accepted.id],
      );
      assert.equal(refs.rows.filter((r) => r.status === 'pending').length, 3);
      const delivery = await op(alice, 'delivery', {
        snapshot: await op(alice, 'snapshot'),
        ids: [accepted.id],
      });
      assert.ok(Array.isArray(delivery));
      assert.equal(object(delivery[0])['recipient_received'], false);
    },
  );
  await t.test(
    'reenvio idempotente não duplica mensagem, referências ou cobrança; pacote não contém texto legível',
    async () => {
      const before = await inspector.query<Record<string, unknown>>(
        'SELECT charge,recipient_charge,body FROM hash_talk.message_packets WHERE id=$1',
        [accepted.id],
      );
      await publish(accepted);
      const after = await inspector.query<Record<string, unknown>>(
        'SELECT charge,recipient_charge,body FROM hash_talk.message_packets WHERE id=$1',
        [accepted.id],
      );
      assert.deepEqual(after.rows, before.rows);
      assert.equal(
        JSON.stringify(after.rows).includes('Conteúdo sintético privado'),
        false,
      );
    },
  );
  await t.test(
    'chave Olm recebida é gravada pelo SDK; replay após confirmação não recria envelope',
    async () => {
      const inbox = object(await op(bob, 'matrix-inbox')),
        items = inbox['items'] as { sequence: number; event: unknown }[];
      assert.ok(items.length);
      await phone.receive(
        items.map((x) => x.event),
        Number(inbox['oneTimeKeys']),
      );
      assert.deepEqual(
        await phone.receive(
          items.map((x) => x.event),
          Number(inbox['oneTimeKeys']),
        ),
        [],
      );
      await op(bob, 'matrix-received', {
        sequences: items.map((x) => x.sequence),
      });
      const sent = sends.find((x) =>
        JSON.stringify(x.payload).includes(bob.session.deviceId),
      );
      assert.ok(sent);
      await op(sent.user, 'matrix-send', sent.payload);
      const again = object(await op(bob, 'matrix-inbox'));
      assert.deepEqual(again['items'], []);
    },
  );
  await t.test(
    'ACK do celular conserva pendência do computador e não cobra novamente o histórico',
    async () => {
      const recovered = await openRecoveryKey(bobKey, await authority(bob)),
        archive = accepted.archives[1];
      assert.ok(archive);
      try {
        assert.equal(
          await phone.decrypt({
            packet: accepted,
            senderEvent: alice.events[0]!,
            exported: openRoomKey(recovered, archive),
          }),
          'Conteúdo sintético privado',
        );
      } finally {
        recovered.free();
      }
      await op(bob, 'acknowledge', { id: accepted.id, hash });
      const delivery = await op(alice, 'delivery', {
        snapshot: await op(alice, 'snapshot'),
        ids: [accepted.id],
      });
      assert.ok(Array.isArray(delivery));
      assert.equal(object(delivery[0])['recipient_received'], true);
      assert.equal(object(delivery[0])['queue_active'], true);
      assert.deepEqual(
        await op(alice, 'daily-receipts', { ids: [accepted.id] }),
        [],
      );
      const refs = await inspector.query<Record<string, unknown>>(
        'SELECT account_id,device_id,status FROM hash_talk.message_references WHERE message_id=$1',
        [accepted.id],
      );
      assert.equal(
        refs.rows.find((r) => r.device_id === computer.session.deviceId)
          ?.status,
        'pending',
      );
      assert.equal(
        refs.rows.find((r) => r.device_id === bob.session.deviceId)?.status,
        'received',
      );
    },
  );
  const other = sender;
  const pending = await other.encrypt({
    authority: await authority(alice),
    peerHistory: bob.events,
    recovery: [aliceKey, bobKey],
    id: crypto.randomUUID(),
    text: 'Ainda não entregue',
  });
  await publish(pending);
  await t.test(
    'backup: limpeza imediata é pessoal, autenticada, idempotente e preserva entrega ao outro participante',
    async () => {
      const p = await packet(
        'Backup sintético enquanto o computador está offline',
      );
      await publish(p);
      const hash = await digest(JSON.stringify(p));
      const target = { kind: 'message', id: p.id, hash };
      const selection = {
        items: [target],
        backup: 'a'.repeat(64),
        revision: bob.events.length,
      };
      const before = await inspector.query<{
        account_id: string;
        device_id: string;
        status: string;
      }>(
        'SELECT account_id,device_id,status FROM hash_talk.message_references WHERE message_id=$1',
        [p.id],
      );
      assert.ok(
        before.rows.some(
          (r) =>
            r.account_id === bob.session.accountId && r.status === 'pending',
        ),
      );
      await assert.rejects(
        op(outsider, 'personal-clean', {
          ...selection,
          revision: outsider.events.length,
        }),
      );
      await assert.rejects(
        op(bob, 'personal-clean', {
          ...selection,
          items: [{ ...target, hash: 'b'.repeat(64) }],
        }),
      );
      await inspector.query(
        'UPDATE hash_talk.login_sessions SET wallet_confirmed=false WHERE account_id=$1 AND device_id=$2',
        [bob.session.accountId, bob.session.deviceId],
      );
      try {
        await assert.rejects(op(bob, 'personal-clean', selection), /wallet/u);
      } finally {
        await inspector.query(
          'UPDATE hash_talk.login_sessions SET wallet_confirmed=true WHERE account_id=$1 AND device_id=$2',
          [bob.session.accountId, bob.session.deviceId],
        );
      }
      const result = object(await op(bob, 'personal-clean', selection));
      assert.equal(result['status'], 'cleaned');
      const after = await inspector.query<{
        account_id: string;
        device_id: string;
        status: string;
      }>(
        'SELECT account_id,device_id,status FROM hash_talk.message_references WHERE message_id=$1',
        [p.id],
      );
      assert.ok(
        after.rows.every((r) => r.account_id !== bob.session.accountId),
      );
      assert.deepEqual(
        after.rows,
        before.rows.filter((r) => r.account_id === alice.session.accountId),
      );
      const page = object(await op(bob, 'personal-page', { after: 0 }));
      const rows = page['items'];
      assert.ok(Array.isArray(rows));
      const removal = personalRemoval(
        rows.find((r) => object(r)['id'] === p.id),
      );
      await verifyRemoval(bob.session.accountId, removal, bob.events);
      await assert.rejects(
        verifyRemoval(
          bob.session.accountId,
          { ...removal, hash: 'b'.repeat(64) },
          bob.events,
        ),
      );
      const again = object(await op(bob, 'personal-clean', selection));
      assert.equal(again['released'], 0);
      await assert.rejects(
        op(bob, 'object', { id: p.id, snapshot: await op(bob, 'snapshot') }),
        { status: 410 },
      );
      await assert.rejects(
        op(computer, 'object', {
          id: p.id,
          snapshot: await op(computer, 'snapshot'),
        }),
        { status: 410 },
      );
      await assert.rejects(op(bob, 'acknowledge', { id: p.id, hash }), {
        status: 410,
      });
      const peer = messagePacket(
        await op(alice, 'object', {
          id: p.id,
          snapshot: await op(alice, 'snapshot'),
        }),
      );
      assert.equal(peer.id, p.id);
      const index = object(
        await op(bob, 'page', {
          snapshot: await op(bob, 'snapshot'),
          after: 0,
        }),
      );
      assert.ok(Array.isArray(index['items']));
      assert.ok(
        index['items'].some(
          (r) => object(r)['id'] === p.id && object(r)['deleted'] === true,
        ),
      );
      await op(alice, 'personal-clean', {
        ...selection,
        revision: alice.events.length,
      });
      const collected = await inspector.query<{
        body: unknown;
        personal_collected: boolean;
      }>(
        'SELECT body,personal_collected FROM hash_talk.message_packets WHERE id=$1',
        [p.id],
      );
      assert.equal(collected.rows[0]?.body, null);
      assert.equal(collected.rows[0]?.personal_collected, true);
      await assert.rejects(publish(p), { status: 410 });
    },
  );
  const quotaPacket = await packet('Não aceitar sem capacidade');
  const photoBytes = new Uint8Array(3_000_000);
  photoBytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const photo = await sender.encrypt({
    authority: await authority(alice),
    peerHistory: bob.events,
    recovery: [aliceKey, bobKey],
    id: crypto.randomUUID(),
    kind: 'profile',
    text: encodeProfileCard({
      name: 'Pessoa sintética',
      revision: 1,
      photo: { type: 'image/png', bytes: photoBytes },
    }),
  });
  await publish(photo);
  await t.test(
    'SSE real exige assinatura atual, libera slots HTTP e avisa remetente/destinatário após persistência',
    async () => {
      const origin = 'http://127.0.0.1:45118',
        live = new MessageLive(db.changes),
        account = createAccountHandler({
          origin,
          service: accounts,
          messages,
          live,
        }),
        host = createWebServer({
          origin,
          assets: new Map(),
          database: db,
          objects: { healthy: () => Promise.resolve(true) },
          account,
        });
      await new Promise<void>((resolve, reject) => {
        host.server.once('error', reject);
        host.server.listen(45118, '127.0.0.1', resolve);
      });
      const controllers: AbortController[] = [];
      const root = origin + '/api/account/messages/';
      function headers(user: User) {
        return {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: `hash-talk-session=${user.sessionToken}`,
          'X-Hash-Talk-CSRF': user.session.csrf,
        };
      }
      async function stream(user: User) {
        const controller = new AbortController();
        controllers.push(controller);
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(root + 'live', {
          method: 'POST',
          headers: headers(user),
          body: JSON.stringify(await proof(user, 'live', {})),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        assert.equal(response.status, 200);
        assert.match(
          response.headers.get('content-type') ?? '',
          /text\/event-stream/,
        );
        assert.ok(response.body);
        const reader = response.body.getReader(),
          parser = new WakeupFrames();
        const next = async (
          wanted: import('../../src/client/message-live/index.ts').LiveEvent,
        ) => {
          const deadline = setTimeout(() => controller.abort(), 5000);
          try {
            for (;;) {
              const part = await reader.read();
              assert.equal(part.done, false);
              assert.ok(part.value);
              if (parser.accept(part.value).includes(wanted)) return;
            }
          } finally {
            clearTimeout(deadline);
          }
        };
        await next('ready');
        return { next, timeout };
      }
      const streams: Awaited<ReturnType<typeof stream>>[] = [];
      try {
        const forged = await proof(alice, 'live', {});
        forged.signature = 'A'.repeat(86) + '==';
        assert.equal(
          (
            await fetch(root + 'live', {
              method: 'POST',
              headers: headers(alice),
              body: JSON.stringify(forged),
            })
          ).status,
          409,
        );
        streams.push(await stream(alice), await stream(bob));
        const p = await packet('Conteúdo sintético enviado por evento');
        const response = await fetch(root + 'publish', {
          method: 'POST',
          headers: headers(alice),
          body: JSON.stringify(await proof(alice, 'publish', { packet: p })),
        });
        assert.equal(response.status, 200);
        await response.json();
        await Promise.all(streams.map((item) => item.next('changed')));
        const snap = await op(bob, 'snapshot');
        assert.ok(await op(bob, 'object', { id: p.id, snapshot: snap }));
        assert.equal(
          await op(bob, 'playback-allowed', { peer: alice.session.accountId }),
          true,
        );
        await contactChange(bob, 'block', {
          wallet: {
            ecosystem: 'evm',
            address: alice.wallet.address.toLowerCase(),
          },
          blocked: true,
        });
        await Promise.all(streams.map((item) => item.next('authorization')));
        assert.equal(
          await op(alice, 'playback-allowed', { peer: bob.session.accountId }),
          false,
        );
        await contactChange(bob, 'block', {
          wallet: {
            ecosystem: 'evm',
            address: alice.wallet.address.toLowerCase(),
          },
          blocked: false,
        });
        await approve(alice, bob);
        const temporary = await create(),
          extra = await stream(temporary);
        streams.push(extra);
        await accounts.logout(temporary.sessionToken);
        await extra.next('ended');
      } finally {
        for (const item of streams) clearTimeout(item.timeout);
        for (const controller of controllers) controller.abort();
        await host.close();
      }
    },
  );
  await t.test(
    'registro de avisos em transação descartada não publica eventos',
    async () => {
      const observed: unknown[] = [],
        stop = db.changes.observe({
          notify: (change) => observed.push(change),
          failed: () => assert.fail('Observador não deve falhar'),
        });
      try {
        const a = await authority(alice);
        await assert.rejects(
          db.contacts.withMessageAuthority(
            { session: alice.session, directory: a.directory },
            (client) => {
              db.contacts.changed(client, [bob.session.accountId]);
              return Promise.reject(
                new Error('Quota recusada após registrar mudança'),
              );
            },
          ),
        );
        assert.deepEqual(observed, []);
      } finally {
        stop();
      }
    },
  );
  await t.test(
    'voz v2 via Megolm/cofre chega a outro aparelho cifrada, sob demanda e recuperável sem sessão antiga',
    async () => {
      const bytes = voiceWav([new Int16Array(voiceRate).fill(1234)]),
        voice = { samples: voiceRate, sampleRate: voiceRate },
        sealed = await sealFile(bytes),
        content = attachmentContent({
          version: 2,
          voice,
          name: 'mensagem-de-voz.wav',
          type: 'audio/wav',
          image: false,
          thumbnail: null,
          caption: '',
          file: sealed.file,
        });
      const media = await sender.encrypt({
        authority: await authority(alice),
        peerHistory: bob.events,
        recovery: [aliceKey, bobKey],
        id: crypto.randomUUID(),
        text: JSON.stringify(content),
        kind: 'attachment',
      });
      await op(alice, 'attachment-reserve', {
        message: media.id,
        peer: bob.session.accountId,
        refs: contentRefs(content),
      });
      await op(alice, 'attachment-part', {
        id: sealed.file.ref.id,
        index: 0,
        ciphertext: encode(sealed.bytes),
      });
      await op(alice, 'attachment-finish', { id: sealed.file.ref.id });
      await publish(media);
      const stored = await inspector.query<{ body: MessagePacket }>(
        'SELECT body FROM hash_talk.message_packets WHERE id=$1',
        [media.id],
      );
      assert.ok(
        !JSON.stringify(stored.rows[0]?.body).includes('mensagem-de-voz.wav'),
      );
      const snapshot = await op(computer, 'snapshot'),
        key = await openRecoveryKey(bobKey, await authority(computer)),
        decoder = await machine(computer);
      try {
        const packet = await indexedPacket(
          await op(computer, 'object', { id: media.id, snapshot }),
          { id: media.id, hash: await digest(JSON.stringify(media)) },
        );
        const recovered = attachmentContent(
          JSON.parse(
            await decoder.decrypt({
              packet,
              senderEvent: alice.events.at(-1)!,
              exported: openRoomKey(key, packet.archives[1]!),
            }),
          ) as unknown,
        );
        const raw = object(
          await op(computer, 'attachment-get', {
            message: media.id,
            id: recovered.file.ref.id,
            index: 0,
            snapshot,
          }),
        );
        const opened = await openFile(
          recovered.file,
          Uint8Array.from(base64(raw['ciphertext'], partLimit)),
        );
        assert.deepEqual(opened, bytes);
        assert.ok(recovered.voice);
        validateVoice(opened, recovered.voice);
      } finally {
        key.free();
      }
    },
  );
  await t.test(
    'rota exige origem, sessão e CSRF antes do corpo; preserva publicação grande e idempotente',
    async () => {
      const origin = 'http://127.0.0.1:45118';
      const account = createAccountHandler({
        origin,
        service: accounts,
        messages,
        notifications,
      });
      const host = createWebServer({
        origin,
        assets: new Map(),
        database: db,
        objects: { healthy: () => Promise.resolve(true) },
        account,
      });
      const server = host.server;
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(45118, '127.0.0.1', resolve);
      });
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const root = `http://127.0.0.1:${address.port}/api/account/messages/`;
      const headers = {
        Origin: origin,
        'Content-Type': 'application/json',
        Cookie: `hash-talk-session=${alice.sessionToken}`,
        'X-Hash-Talk-CSRF': alice.session.csrf,
      };
      try {
        assert.equal(
          (
            await fetch(root + 'snapshot', {
              method: 'POST',
              headers: { Origin: origin },
              body: 'invalid',
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await fetch(root + 'snapshot', {
              method: 'POST',
              headers: { ...headers, 'X-Hash-Talk-CSRF': '0'.repeat(64) },
              body: 'invalid',
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await fetch(root + 'snapshot', {
              method: 'POST',
              headers: { ...headers, Origin: 'https://untrusted.example' },
              body: 'invalid',
            })
          ).status,
          403,
        );
        const response = await fetch(root + 'publish', {
          method: 'POST',
          headers,
          body: JSON.stringify(
            await proof(alice, 'publish', { packet: photo }),
          ),
        });
        assert.equal(response.status, 200);
        assert.equal(
          object((await response.json()) as unknown)['status'],
          'accepted',
        );
        assert.match(response.headers.get('cache-control') ?? '', /no-store/);
        const sealed = await sealFile(new Uint8Array([3, 4, 5])),
          message = crypto.randomUUID();
        await op(alice, 'attachment-reserve', {
          message,
          peer: bob.session.accountId,
          refs: [sealed.file.ref],
        });
        assert.equal(
          (
            await fetch(root + 'attachment-part', {
              method: 'POST',
              headers,
              body: 'invalid',
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await fetch(root + 'attachment-part', {
              method: 'POST',
              headers: {
                ...headers,
                'X-0xdmme-Attachment-Id': crypto.randomUUID(),
              },
              body: 'invalid',
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await fetch(root + 'attachment-part', {
              method: 'POST',
              headers: {
                ...headers,
                'X-0xdmme-Attachment-Id': sealed.file.ref.id,
              },
              body: JSON.stringify(
                await proof(alice, 'attachment-part', {
                  id: sealed.file.ref.id,
                  index: 0,
                  ciphertext: encode(sealed.bytes),
                }),
              ),
            })
          ).status,
          200,
        );
        await op(alice, 'attachment-cancel', { message });
        const forged = await proof(alice, 'snapshot', {});
        forged.signature = 'A'.repeat(86) + '==';
        assert.equal(
          (
            await fetch(root + 'snapshot', {
              method: 'POST',
              headers,
              body: JSON.stringify(forged),
            })
          ).status,
          409,
        );
        const readBody = JSON.stringify(await proof(alice, 'snapshot', {}));
        for (let i = 0; i < 70; i++) {
          const response = await fetch(root + 'snapshot', {
            method: 'POST',
            headers,
            body: readBody,
          });
          assert.equal(response.status, 200);
          await response.text();
        }
      } finally {
        await host.close();
      }
    },
  );
  await t.test(
    'anexos retomam partes duráveis, sobrevivem reinício e recuperam sem sessão antiga; exclusão libera objetos',
    async () => {
      const bytes = new Uint8Array(600_000).fill(37),
        sealed = await sealFile(bytes),
        thumb = await sealFile(new Uint8Array([1, 2, 3]));
      const content = {
        version: 1 as const,
        name: 'original.bin',
        type: 'application/octet-stream',
        caption: '',
        image: false,
        file: sealed.file,
        thumbnail: null,
      };
      const media = await sender.encrypt({
        authority: await authority(alice),
        peerHistory: bob.events,
        recovery: [aliceKey, bobKey],
        id: crypto.randomUUID(),
        text: JSON.stringify(content),
        kind: 'attachment',
      });
      const reserve = {
        message: media.id,
        peer: bob.session.accountId,
        refs: contentRefs(content),
      };
      await assert.rejects(publish(media), { status: 409 });
      await assert.rejects(op(outsider, 'attachment-reserve', reserve));
      await op(alice, 'attachment-reserve', reserve);
      await assert.rejects(
        op(alice, 'attachment-finish', { id: sealed.file.ref.id }),
        { status: 409 },
      );
      await assert.rejects(
        op(alice, 'attachment-part', {
          id: sealed.file.ref.id,
          index: 0,
          ciphertext: encode(new Uint8Array([2])),
        }),
        { status: 400 },
      );
      await op(alice, 'attachment-part', {
        id: sealed.file.ref.id,
        index: 0,
        ciphertext: encode(sealed.bytes.subarray(0, partLimit)),
      });
      const crashLease = await db.attachments.begin(
        {
          session: alice.session,
          directory: (await authority(alice)).directory,
        },
        sealed.file.ref.id,
        1,
      );
      assert.ok(crashLease.writer);
      await (
        await objects.attachment(sealed.file.ref.id)
      ).put(sealed.bytes.subarray(partLimit, partLimit * 2));
      await db.attachments.resumeInterrupted();
      const resumed = (await op(alice, 'attachment-reserve', reserve)) as {
        received: number[];
      }[];
      assert.deepEqual(resumed[0]?.received, [0]);
      // Replayed upload is idempotent. One reserved namespace cannot delete another.
      await op(alice, 'attachment-part', {
        id: sealed.file.ref.id,
        index: 0,
        ciphertext: encode(sealed.bytes.subarray(0, partLimit)),
      });
      await assert.rejects(
        op(alice, 'attachment-reserve', {
          ...reserve,
          refs: [sealed.file.ref, thumb.file.ref],
          peer: outsider.session.accountId,
        }),
      );
      for (let index = 1; index < sealed.file.ref.parts.length; index++)
        await op(alice, 'attachment-part', {
          id: sealed.file.ref.id,
          index,
          ciphertext: encode(
            sealed.bytes.subarray(index * partLimit, (index + 1) * partLimit),
          ),
        });
      await op(alice, 'attachment-finish', { id: sealed.file.ref.id });
      await publish(media);
      await publish(media);
      await inspector.query(
        "UPDATE hash_talk.message_attachments SET created_at=now()-interval '25 hours' WHERE id=$1",
        [sealed.file.ref.id],
      );
      await messages.cleanAttachments();
      assert.ok(
        (await readdir(attachmentDirectory)).includes(
          `attachment-${sealed.file.ref.id}`,
        ),
      );
      await assert.rejects(
        op(alice, 'attachment-cancel', { message: media.id }),
        { status: 409 },
      );
      const snap = await op(computer, 'snapshot'),
        decoder = await machine(computer),
        key = await openRecoveryKey(bobKey, await authority(computer));
      const transported = await op(computer, 'object', {
        id: media.id,
        snapshot: snap,
      });
      const identity = {
        id: media.id,
        hash: await digest(JSON.stringify(media)),
      };
      assert.deepEqual(await indexedPacket(transported, identity), media);
      await assert.rejects(
        indexedPacket(transported, { ...identity, hash: 'f'.repeat(64) }),
      );
      try {
        const recovered = JSON.parse(
          await decoder.decrypt({
            packet: media,
            senderEvent: alice.events.at(-1)!,
            exported: openRoomKey(key, media.archives[1]!),
          }),
        ) as typeof content;
        assert.equal(recovered.file.encryption, sealed.file.encryption);
      } finally {
        key.free();
      }
      const downloaded = new Uint8Array(sealed.bytes.length);
      for (let index = 0; index < sealed.file.ref.parts.length; index++) {
        const data = object(
          await op(computer, 'attachment-get', {
            message: media.id,
            id: sealed.file.ref.id,
            index,
            snapshot: snap,
          }),
        );
        downloaded.set(
          base64(data['ciphertext'], partLimit),
          index * partLimit,
        );
      }
      assert.deepEqual(await openFile(sealed.file, downloaded), bytes);
      await op(alice, 'personal-clean', {
        backup: 'c'.repeat(64),
        revision: alice.events.length,
        items: [
          {
            kind: 'message',
            id: media.id,
            hash: await digest(JSON.stringify(media)),
          },
        ],
      });
      await assert.rejects(
        op(alice, 'attachment-get', {
          message: media.id,
          id: sealed.file.ref.id,
          index: 0,
          snapshot: await op(alice, 'snapshot'),
        }),
        { status: 410 },
      );
      const retained = object(
        await op(computer, 'attachment-get', {
          message: media.id,
          id: sealed.file.ref.id,
          index: 0,
          snapshot: await op(computer, 'snapshot'),
        }),
      );
      assert.deepEqual(
        base64(retained['ciphertext'], partLimit),
        sealed.bytes.subarray(0, partLimit),
      );
      assert.ok(
        (await readdir(attachmentDirectory)).includes(
          `attachment-${sealed.file.ref.id}`,
        ),
      );
      await assert.rejects(
        op(outsider, 'attachment-get', {
          message: media.id,
          id: sealed.file.ref.id,
          index: 0,
          snapshot: await op(outsider, 'snapshot'),
        }),
      );
      await contactChange(bob, 'block', {
        wallet: {
          ecosystem: 'evm',
          address: alice.wallet.address.toLowerCase(),
        },
        blocked: true,
      });
      assert.equal(
        await op(computer, 'playback-allowed', {
          peer: alice.session.accountId,
        }),
        false,
      );
      await assert.rejects(
        op(computer, 'attachment-get', {
          message: media.id,
          id: sealed.file.ref.id,
          index: 0,
          snapshot: await op(computer, 'snapshot'),
        }),
        { status: 423 },
      );
      const ownHash = await digest(JSON.stringify(media));
      await op(alice, 'delete', {
        id: media.id,
        hash: ownHash,
        revision: alice.events.length,
      });
      assert.ok(
        !(await readdir(attachmentDirectory)).includes(
          `attachment-${sealed.file.ref.id}`,
        ),
      );
      await assert.rejects(
        op(computer, 'attachment-get', {
          message: media.id,
          id: sealed.file.ref.id,
          index: 0,
          snapshot: await op(computer, 'snapshot'),
        }),
      );
      // An explicitly saved independent copy still opens; the automatic object has gone.
      assert.deepEqual(await openFile(sealed.file, downloaded), bytes);
      await contactChange(bob, 'block', {
        wallet: {
          ecosystem: 'evm',
          address: alice.wallet.address.toLowerCase(),
        },
        blocked: false,
      });
      await approve(alice, bob);
    },
  );
  await t.test(
    'reservas de anexos contam ambos os cofres/global antes do upload; temporários expiram sem afetar aceitos',
    async () => {
      const sealed = await sealFile(new Uint8Array([6, 7, 8])),
        message = crypto.randomUUID(),
        reserve = {
          message,
          peer: bob.session.accountId,
          refs: [sealed.file.ref],
        };
      const small = new Database(config.databaseUrl, 1),
        limited = new MessageService(small, small.devices, objects);
      try {
        await assert.rejects(
          limited.operate(
            'attachment-reserve',
            alice.session,
            await proof(alice, 'attachment-reserve', reserve),
          ),
          { status: 503 },
        );
      } finally {
        await small.close();
      }
      assert.equal(
        (
          await inspector.query<{ count: string }>(
            'SELECT count(*) FROM hash_talk.message_attachments WHERE id=$1',
            [sealed.file.ref.id],
          )
        ).rows[0]?.count,
        '0',
      );
      for (const column of ['sender_charge', 'recipient_charge']) {
        const original = await inspector.query<Record<string, number>>(
          `SELECT ${column} FROM hash_talk.message_packets WHERE id=$1`,
          [pending.id],
        );
        await inspector.query(
          `UPDATE hash_talk.message_packets SET ${column}=300000000 WHERE id=$1`,
          [pending.id],
        );
        try {
          await assert.rejects(op(alice, 'attachment-reserve', reserve), {
            status: 413,
          });
        } finally {
          await inspector.query(
            `UPDATE hash_talk.message_packets SET ${column}=$2 WHERE id=$1`,
            [pending.id, original.rows[0]?.[column]],
          );
        }
      }
      assert.equal(
        (
          await inspector.query<{ count: string }>(
            'SELECT count(*) FROM hash_talk.message_attachments WHERE id=$1',
            [sealed.file.ref.id],
          )
        ).rows[0]?.count,
        '0',
      );
      await op(alice, 'attachment-reserve', reserve);
      await op(alice, 'attachment-part', {
        id: sealed.file.ref.id,
        index: 0,
        ciphertext: encode(sealed.bytes),
      });
      await inspector.query(
        "UPDATE hash_talk.message_attachments SET created_at=now()-interval '25 hours' WHERE id=$1",
        [sealed.file.ref.id],
      );
      await messages.cleanAttachments();
      assert.ok(
        !(await readdir(attachmentDirectory)).includes(
          `attachment-${sealed.file.ref.id}`,
        ),
      );
      await op(alice, 'attachment-reserve', reserve);
      assert.equal(
        (
          await inspector.query<{ charge: number }>(
            'SELECT charge FROM hash_talk.message_attachments WHERE id=$1',
            [sealed.file.ref.id],
          )
        ).rows[0]?.charge,
        4099,
      );
      await op(alice, 'attachment-cancel', { message });
      await assert.rejects(
        op(alice, 'attachment-part', {
          id: sealed.file.ref.id,
          index: 0,
          ciphertext: encode(sealed.bytes),
        }),
        { status: 404 },
      );
    },
  );
  await t.test(
    'reabertura do servidor conserva fila e aparelho sem sessões anteriores recupera mensagem',
    async () => {
      sender.close();
      await db.close();
      db = new Database(config.databaseUrl);
      await db.migrate();
      notifications = new NotificationService({
        store: db.daily,
        devices: db.devices,
        config: { ...vapid, subject: 'https://0xdmme.app' },
        send: (subscription) => {
          delivered.push(subscription.endpoint);
          return Promise.resolve();
        },
      });
      messages = new MessageService(db, db.devices, objects, notifications);
      contacts = new ContactService(db.contacts, db.devices);
      devices = new DeviceService(db.devices);
      accounts = new AccountService({
        store: db.authentication,
        origin: 'http://127.0.0.1:45119',
      });
      const client = await machine(computer),
        snapshot = await op(computer, 'snapshot'),
        stored = messagePacket(
          await op(computer, 'object', { id: accepted.id, snapshot }),
        );
      const secret = await openRecoveryKey(
        await op(computer, 'recovery-key', { id: bobKey.id }),
        await authority(computer),
      );
      try {
        assert.equal(
          await client.decrypt({
            packet: stored,
            senderEvent: alice.events[0]!,
            exported: openRoomKey(secret, stored.archives[1]!),
          }),
          'Conteúdo sintético privado',
        );
      } finally {
        secret.free();
      }
      await op(computer, 'acknowledge', { id: accepted.id, hash });
      const row = await inspector.query<Record<string, unknown>>(
        'SELECT queue_active FROM hash_talk.message_packets WHERE id=$1',
        [accepted.id],
      );
      assert.equal(row.rows[0]?.queue_active, true);
      await op(alice, 'acknowledge', { id: accepted.id, hash });
      assert.equal(
        (
          await inspector.query<Record<string, unknown>>(
            'SELECT queue_active FROM hash_talk.message_packets WHERE id=$1',
            [accepted.id],
          )
        ).rows[0]?.queue_active,
        false,
      );
    },
  );
  await t.test(
    'bloqueio suspende pendência; desbloquear não restaura consentimento',
    async () => {
      await contactChange(bob, 'block', {
        wallet: {
          ecosystem: 'evm',
          address: alice.wallet.address.toLowerCase(),
        },
        blocked: true,
      });
      await assert.rejects(publish({ ...pending, id: crypto.randomUUID() }));
      const snapshot = await op(computer, 'snapshot');
      await assert.rejects(
        op(computer, 'object', { id: pending.id, snapshot }),
        { status: 423 },
      );
      await contactChange(bob, 'block', {
        wallet: {
          ecosystem: 'evm',
          address: alice.wallet.address.toLowerCase(),
        },
        blocked: false,
      });
      await assert.rejects(
        op(computer, 'object', {
          id: pending.id,
          snapshot: await op(computer, 'snapshot'),
        }),
        { status: 423 },
      );
    },
  );
  await t.test(
    'exclusão autenticada funciona bloqueado, remove arquivo automático dos dois lados e invalida snapshot',
    async () => {
      const snapshot = await op(bob, 'snapshot');
      await assert.rejects(
        op(bob, 'delete', {
          id: accepted.id,
          hash,
          revision: bob.events.length,
        }),
      );
      await op(alice, 'delete', {
        id: accepted.id,
        hash,
        revision: alice.events.length,
      });
      await assert.rejects(op(bob, 'confirm', { snapshot }), { status: 409 });
      await assert.rejects(
        op(bob, 'object', {
          id: accepted.id,
          snapshot: await op(bob, 'snapshot'),
        }),
        { status: 410 },
      );
      await assert.rejects(publish(accepted), { status: 410 });
      const row = await inspector.query<Record<string, unknown>>(
        'SELECT body,deletion,queue_active FROM hash_talk.message_packets WHERE id=$1',
        [accepted.id],
      );
      assert.equal(row.rows[0]?.body, null);
      assert.ok(row.rows[0]?.deletion);
      assert.equal(row.rows[0]?.queue_active, false);
      assert.equal(
        (
          await inspector.query<Record<string, unknown>>(
            'SELECT count(*) FROM hash_talk.message_references WHERE message_id=$1',
            [accepted.id],
          )
        ).rows[0]?.count,
        '0',
      );
    },
  );
  await t.test(
    'novo consentimento retoma a mesma mensagem, sem nova aceitação ou TTL',
    async () => {
      await approve(alice, bob);
      const stored = await op(computer, 'object', {
        id: pending.id,
        snapshot: await op(computer, 'snapshot'),
      });
      assert.equal(object(stored)['id'], pending.id);
      assert.equal(
        (
          await inspector.query<Record<string, unknown>>(
            'SELECT count(*) FROM hash_talk.message_packets WHERE id=$1',
            [pending.id],
          )
        ).rows[0]?.count,
        '1',
      );
    },
  );
  await t.test(
    'foto de perfil de 3 MB permanece privada e recuperável no mesmo protocolo',
    async () => {
      const decoder = await machine(computer),
        secret = await openRecoveryKey(bobKey, await authority(computer));
      try {
        const decoded = profileCard(
          JSON.parse(
            await decoder.decrypt({
              packet: photo,
              senderEvent: alice.events[0]!,
              exported: openRoomKey(secret, photo.archives[1]!),
            }),
          ) as unknown,
        );
        assert.equal(decoded.photo?.bytes.length, 3_000_000);
        assert.equal(JSON.stringify(photo).includes('Pessoa sintética'), false);
      } finally {
        secret.free();
      }
      assert.equal(
        await op(alice, 'profile-known', {
          id: photo.id,
          peer: bob.session.accountId,
        }),
        true,
      );
      assert.equal(
        await op(outsider, 'profile-known', {
          id: photo.id,
          peer: bob.session.accountId,
        }),
        false,
      );
    },
  );
  await t.test(
    'capacidade pessoal/global recusa antes da aceitação e desfaz pacote/referências',
    async () => {
      const constrained = new Database(config.databaseUrl, 1),
        limited = new MessageService(constrained, constrained.devices);
      try {
        await assert.rejects(
          limited.operate(
            'publish',
            alice.session,
            await proof(alice, 'publish', { packet: quotaPacket }),
          ),
          { status: 503 },
        );
      } finally {
        await constrained.close();
      }
      const old = await inspector.query<{ recipient_charge: number }>(
        'SELECT recipient_charge FROM hash_talk.message_packets WHERE id=$1',
        [pending.id],
      );
      await inspector.query(
        'UPDATE hash_talk.message_packets SET recipient_charge=300000000 WHERE id=$1',
        [pending.id],
      );
      try {
        await assert.rejects(publish(quotaPacket), { status: 413 });
      } finally {
        await inspector.query(
          'UPDATE hash_talk.message_packets SET recipient_charge=$2 WHERE id=$1',
          [pending.id, old.rows[0]?.recipient_charge],
        );
      }
      assert.equal(
        (
          await inspector.query<{ count: string }>(
            'SELECT count(*) FROM hash_talk.message_packets WHERE id=$1',
            [quotaPacket.id],
          )
        ).rows[0]?.count,
        '0',
      );
      assert.equal(
        (
          await inspector.query<{ count: string }>(
            'SELECT count(*) FROM hash_talk.message_references WHERE message_id=$1',
            [quotaPacket.id],
          )
        ).rows[0]?.count,
        '0',
      );
    },
  );
  await t.test(
    'revogação barra acesso imediatamente e aposenta só a referência escolhida',
    async () => {
      const previous = bob.events.at(-1)!;
      bob.ring = freshKeyring(bob.session.accountId, bob.ring);
      const event = await prepareEvent({
        accountId: bob.session.accountId,
        previous,
        kind: 'revoke',
        signer: bob.session.deviceId,
        signing: bob.identity.signing,
        root: previous.root,
        identities: [bob.identity.public],
        ring: bob.ring,
        profile: null,
      });
      await devices.commit(bob.session, { event, profile: null });
      bob.events.push(event);
      await assert.rejects(op(computer, 'snapshot'), { status: 403 });
      await op(bob, 'acknowledge', {
        id: pending.id,
        hash: await digest(JSON.stringify(pending)),
      });
      const references = await inspector.query<{
        device_id: string;
        status: string;
      }>(
        'SELECT device_id,status FROM hash_talk.message_references WHERE message_id=$1',
        [pending.id],
      );
      assert.equal(
        references.rows.find((r) => r.device_id === computer.session.deviceId)
          ?.status,
        'revoked',
      );
      assert.equal(
        references.rows.find((r) => r.device_id === alice.session.deviceId)
          ?.status,
        'pending',
      );
    },
  );
  await t.test(
    'remetente apaga antes da chegada e nenhuma cópia automática volta a ser entregue',
    async () => {
      const pHash = await digest(JSON.stringify(pending));
      await op(alice, 'delete', {
        id: pending.id,
        hash: pHash,
        revision: alice.events.length,
      });
      await assert.rejects(
        op(bob, 'object', {
          id: pending.id,
          snapshot: await op(bob, 'snapshot'),
        }),
        { status: 410 },
      );
      assert.equal(
        (
          await inspector.query<{ body: unknown }>(
            'SELECT body FROM hash_talk.message_packets WHERE id=$1',
            [pending.id],
          )
        ).rows[0]?.body,
        null,
      );
    },
  );
  await t.test(
    'bloco 10: privacidade independente, contadores, push, relações e revogação',
    async (dailyTest) => {
      const dana = await create(),
        eve = await create();
      await approve(dana, eve);
      const dk = await recovery(dana),
        ek = await recovery(eve),
        dm = await machine(dana),
        em = await machine(eve);
      await em.prepare(await authority(eve));
      async function make(text: string, relation?: MessagePacket['relation']) {
        return dm.encrypt({
          authority: await authority(dana),
          peerHistory: eve.events,
          recovery: [dk, ek],
          id: crypto.randomUUID(),
          text,
          ...(relation ? { relation } : {}),
        });
      }
      async function send(p: MessagePacket) {
        return op(dana, 'publish', { packet: p });
      }
      async function configure(preferences: {
        online: boolean;
        lastSeen: boolean;
        readReceipts: boolean;
      }) {
        const row = await inspector.query<{ profile_revision: number }>(
          'SELECT profile_revision FROM hash_talk.accounts WHERE id=$1',
          [eve.session.accountId],
        );
        await op(eve, 'daily-configure', {
          revision: row.rows[0]!.profile_revision,
          preferences,
        });
      }
      const p = await make('Mensagem diária privada'),
        ph = await digest(JSON.stringify(p));
      const subscription = {
        endpoint:
          'https://fcm.googleapis.com/fcm/send/synthetic-' +
          crypto.randomUUID(),
        keys: { p256dh: vapid.publicKey, auth: 'a'.repeat(22) },
      };
      await dailyTest.test(
        'push coalescido não confirma entrega; mute e bloqueio impedem novos alertas',
        async () => {
          await op(eve, 'daily-subscribe', { subscription });
          await assert.rejects(
            op(outsider, 'daily-subscribe', { subscription }),
            { status: 409 },
          );
          await send(p);
          await send(p);
          const before = delivered.length;
          await notifications.flush();
          assert.equal(delivered.length, before + 1);
          assert.equal(await notifications.allowPush(eve.session), true);
          const refs = await inspector.query<{ status: string }>(
            'SELECT status FROM hash_talk.message_references WHERE message_id=$1',
            [p.id],
          );
          assert.ok(refs.rows.every((r) => r.status === 'pending'));
          const state = object(
            await op(eve, 'daily-state', { peer: dana.session.accountId }),
          );
          await op(eve, 'daily-mute', {
            peer: dana.session.accountId,
            revision: state['revision'],
            mutedUntil: Number.MAX_SAFE_INTEGER,
          });
          assert.equal(await notifications.allowPush(eve.session), false);
          await assert.rejects(
            op(eve, 'daily-mute', {
              peer: dana.session.accountId,
              revision: state['revision'],
              mutedUntil: 0,
            }),
            { status: 409 },
          );
          await send(await make('Silenciada'));
          const scheduled = await inspector.query<{
            pending: boolean;
            generation: string;
          }>(
            'SELECT pending,generation::text FROM hash_talk.push_subscriptions WHERE account_id=$1 AND device_id=$2',
            [eve.session.accountId, eve.session.deviceId],
          );
          assert.equal(scheduled.rows[0]?.pending, false);
          assert.equal(scheduled.rows[0]?.generation, '1');
          await notifications.flush();
          assert.equal(delivered.length, before + 1);
          const muted = object(
            await op(eve, 'daily-state', { peer: dana.session.accountId }),
          );
          await op(eve, 'daily-mute', {
            peer: dana.session.accountId,
            revision: muted['revision'],
            mutedUntil: Date.now() - 1,
          });
          assert.equal(await notifications.allowPush(eve.session), true);
          await contactChange(eve, 'block', {
            wallet: { ecosystem: 'evm', address: dana.wallet.address },
            blocked: true,
          });
          assert.equal(await notifications.allowPush(eve.session), false);
          await assert.rejects(
            op(dana, 'daily-state', { peer: eve.session.accountId }),
            { status: 404 },
          );
          await contactChange(eve, 'block', {
            wallet: { ecosystem: 'evm', address: dana.wallet.address },
            blocked: false,
          });
          await approve(dana, eve);
        },
      );
      await dailyTest.test(
        'online, último acesso e leitura são desligados por padrão e independentes; ACK não é leitura',
        async () => {
          let state = object(
            await op(dana, 'daily-state', { peer: eve.session.accountId }),
          );
          assert.equal(state['online'], false);
          assert.equal(state['lastSeen'], null);
          await configure({
            online: true,
            lastSeen: false,
            readReceipts: false,
          });
          await op(eve, 'daily-heartbeat', { active: true });
          state = object(
            await op(dana, 'daily-state', { peer: eve.session.accountId }),
          );
          assert.equal(state['online'], true);
          assert.equal(state['lastSeen'], null);
          await configure({
            online: false,
            lastSeen: true,
            readReceipts: false,
          });
          await op(eve, 'daily-heartbeat', { active: true });
          state = object(
            await op(dana, 'daily-state', { peer: eve.session.accountId }),
          );
          assert.equal(state['online'], false);
          assert.ok(state['lastSeen']);
          await assert.rejects(
            op(eve, 'daily-read', {
              peer: dana.session.accountId,
              ids: [p.id],
            }),
            { status: 409 },
          );
          await op(eve, 'acknowledge', { id: p.id, hash: ph });
          assert.deepEqual(
            await op(dana, 'daily-receipts', { ids: [p.id] }),
            [],
          );
          const before = object(
            await op(eve, 'daily-state', { peer: dana.session.accountId }),
          );
          await op(eve, 'daily-read', {
            peer: dana.session.accountId,
            ids: [p.id],
          });
          const after = object(
            await op(eve, 'daily-state', { peer: dana.session.accountId }),
          );
          assert.equal(Number(after['unread']), Number(before['unread']) - 1);
          assert.deepEqual(
            await op(dana, 'daily-receipts', { ids: [p.id] }),
            [],
          );
          await configure({
            online: false,
            lastSeen: false,
            readReceipts: true,
          });
          await op(eve, 'daily-read', {
            peer: dana.session.accountId,
            ids: [p.id],
          });
          assert.deepEqual(await op(dana, 'daily-receipts', { ids: [p.id] }), [
            p.id,
          ]);
          await configure({
            online: false,
            lastSeen: false,
            readReceipts: false,
          });
          assert.deepEqual(
            await op(dana, 'daily-receipts', { ids: [p.id] }),
            [],
          );
          await configure({
            online: false,
            lastSeen: false,
            readReceipts: true,
          });
          assert.deepEqual(
            await op(dana, 'daily-receipts', { ids: [p.id] }),
            [],
          );
          await assert.rejects(
            op(outsider, 'daily-read', {
              peer: dana.session.accountId,
              ids: [p.id],
            }),
            { status: 404 },
          );
          const unauthorized = await op(outsider, 'daily-states', {
            peers: [eve.session.accountId],
          });
          assert.deepEqual(unauthorized, []);
        },
      );
      await dailyTest.test(
        'edição exige autor/identidade originais e exclusão remove as cópias automáticas relacionadas',
        async () => {
          const relation = {
            id: p.id,
            hash: ph,
            author: dana.session.accountId,
            type: 'edit' as const,
          };
          const edited = await make(
            encodeDailyText({
              text: 'Texto editado privado',
              reply: null,
              forwarded: false,
            }),
            relation,
          );
          const forged = await em.encrypt({
            authority: await authority(eve),
            peerHistory: dana.events,
            recovery: [ek, dk],
            id: crypto.randomUUID(),
            text: 'Tentativa de editar outro autor',
            relation,
          });
          await assert.rejects(op(eve, 'publish', { packet: forged }), {
            status: 403,
          });
          await assert.rejects(
            send(
              await make('Hash divergente', {
                ...relation,
                hash: 'b'.repeat(64),
              }),
            ),
            { status: 409 },
          );
          await send(edited);
          const reaction = await em.encrypt({
            authority: await authority(eve),
            peerHistory: dana.events,
            recovery: [ek, dk],
            id: crypto.randomUUID(),
            text: encodeDailyText({
              text: '👍',
              reply: null,
              forwarded: false,
            }),
            relation: { ...relation, type: 'reaction' },
          });
          await op(eve, 'publish', { packet: reaction });
          const page = messageItems(
            await op(eve, 'relations', {
              ids: [p.id],
              snapshot: await op(eve, 'snapshot'),
            }),
            48,
          );
          assert.equal(page.items.length, 2);
          const storage = await inspector.query<{ body: unknown }>(
            'SELECT body FROM hash_talk.message_packets WHERE id=$1',
            [edited.id],
          );
          assert.equal(
            JSON.stringify(storage.rows).includes('Texto editado privado'),
            false,
          );
          await op(dana, 'delete', {
            id: p.id,
            hash: ph,
            revision: dana.events.length,
          });
          await assert.rejects(
            op(eve, 'object', {
              id: edited.id,
              snapshot: await op(eve, 'snapshot'),
            }),
            { status: 410 },
          );
          const index = messageItems(
            await op(eve, 'page', {
              after: 0,
              snapshot: await op(eve, 'snapshot'),
            }),
          );
          for (const item of index.items.filter((i) => i.relation)) {
            assert.equal(item.deleted, true);
            await verifyDeletion(item, dana.events);
          }
          const refs = await inspector.query(
            'SELECT 1 FROM hash_talk.message_references WHERE message_id=ANY($1::uuid[])',
            [[p.id, edited.id, reaction.id]],
          );
          assert.equal(refs.rowCount, 0);
          const reads = await inspector.query(
            'SELECT 1 FROM hash_talk.message_reads WHERE message_id=$1',
            [p.id],
          );
          assert.equal(reads.rowCount, 0);
        },
      );
      await dailyTest.test(
        'limpeza pessoal oculta alterações apenas da própria conta; dois recibos retiram também suas cifras',
        async () => {
          const original = await make('Original para backup'),
            hash = await digest(JSON.stringify(original));
          await send(original);
          const edit = await make('Versão posterior para backup', {
            id: original.id,
            hash,
            author: dana.session.accountId,
            type: 'edit',
          });
          await send(edit);
          const selection = {
            items: [{ kind: 'message', id: original.id, hash }],
            backup: 'a'.repeat(64),
            revision: eve.events.length,
          };
          const before = await inspector.query<{ charge: number }>(
            'SELECT charge FROM hash_talk.message_packets WHERE id=$1',
            [edit.id],
          );
          await op(eve, 'personal-clean', selection);
          const cleaned = await inspector.query<{
            charge: number;
            recipient_charge: number;
          }>(
            'SELECT charge,recipient_charge FROM hash_talk.message_packets WHERE id=$1',
            [edit.id],
          );
          assert.equal(cleaned.rows[0]?.charge, before.rows[0]!.charge - 256);
          assert.equal(cleaned.rows[0]?.recipient_charge, 0);
          const later = await make('Versão posterior à limpeza', {
            id: original.id,
            hash,
            author: dana.session.accountId,
            type: 'edit',
          });
          await send(later);
          const late = await inspector.query<{ recipient_charge: number }>(
            'SELECT recipient_charge FROM hash_talk.message_packets WHERE id=$1',
            [later.id],
          );
          assert.equal(late.rows[0]?.recipient_charge, 0);
          await assert.rejects(
            op(eve, 'object', {
              id: edit.id,
              snapshot: await op(eve, 'snapshot'),
            }),
            { status: 410 },
          );
          assert.equal(
            messagePacket(
              await op(dana, 'object', {
                id: edit.id,
                snapshot: await op(dana, 'snapshot'),
              }),
            ).id,
            edit.id,
          );
          await op(dana, 'personal-clean', {
            ...selection,
            revision: dana.events.length,
          });
          const row = await inspector.query<{ body: unknown }>(
            'SELECT body FROM hash_talk.message_packets WHERE id=$1',
            [edit.id],
          );
          assert.equal(row.rows[0]?.body, null);
        },
      );
      await dailyTest.test(
        'aparelho revogado não consulta sinais nem recebe push, mesmo com inscrição antiga',
        async () => {
          const other = await link(eve);
          await op(other, 'daily-subscribe', {
            subscription: {
              ...subscription,
              endpoint: subscription.endpoint + '-other',
            },
          });
          const previous = eve.events.at(-1)!;
          eve.ring = freshKeyring(eve.session.accountId, eve.ring);
          const event = await prepareEvent({
            accountId: eve.session.accountId,
            previous,
            kind: 'revoke',
            signer: eve.session.deviceId,
            signing: eve.identity.signing,
            root: previous.root,
            identities: [eve.identity.public],
            ring: eve.ring,
            profile: null,
          });
          await devices.commit(eve.session, { event, profile: null });
          eve.events.push(event);
          await assert.rejects(
            op(other, 'daily-state', { peer: dana.session.accountId }),
            { status: 403 },
          );
          await assert.rejects(notifications.allowPush(other.session));
          await notifications.flush();
          const rows = await inspector.query(
            'SELECT 1 FROM hash_talk.push_subscriptions WHERE account_id=$1 AND device_id=$2',
            [eve.session.accountId, other.session.deviceId],
          );
          assert.equal(rows.rowCount, 0);
        },
      );
    },
  );
  await t.test(
    'exportação atravessa o limite de 32 mensagens em lotes assinados e confirma apenas hashes válidos',
    async () => {
      const a = await create(),
        b = await create(),
        other = await create();
      await approve(a, b);
      const ka = await recovery(a),
        kb = await recovery(b),
        cryptoSender = await machine(a);
      const packets: MessagePacket[] = [];
      for (let i = 0; i < 33; i++) {
        const p = await cryptoSender.encrypt({
          authority: await authority(a),
          peerHistory: b.events,
          recovery: [ka, kb],
          id: crypto.randomUUID(),
          text: 'Exportação sintética ' + i,
        });
        await op(a, 'publish', { packet: p });
        packets.push(p);
      }
      const snap = await op(b, 'snapshot'),
        all: MessagePacket[] = [];
      for (let offset = 0; offset < packets.length; offset += 32) {
        const ids = packets.slice(offset, offset + 32).map((p) => p.id);
        const response = object(
          await op(b, 'backup-window', { ids, snapshot: snap }),
        );
        assert.ok(
          Array.isArray(response['rows']) &&
            Array.isArray(response['recovery']),
        );
        for (const value of response['rows'])
          all.push(messagePacket(object(value)['packet']));
        assert.equal(response['recovery'].length, 1);
        await assert.rejects(
          op(b, 'backup-ack', {
            snapshot: snap,
            items: [{ id: packets[offset]!.id, hash: '0'.repeat(64) }],
          }),
          { status: 409 },
        );
        const accepted = await Promise.all(
          packets.slice(offset, offset + 32).map(async (p) => ({
            id: p.id,
            hash: await digest(JSON.stringify(p)),
          })),
        );
        await op(b, 'backup-ack', { snapshot: snap, items: accepted });
      }
      assert.deepEqual(all, packets);
      await assert.rejects(
        op(other, 'backup-window', {
          ids: [packets[0]!.id],
          snapshot: await op(other, 'snapshot'),
        }),
        { status: 404 },
      );
      await assert.rejects(
        op(b, 'backup-window', {
          ids: Array.from({ length: 33 }, () => packets[0]!.id),
          snapshot: snap,
        }),
        { status: 400 },
      );
      await assert.rejects(
        op(b, 'backup-window', {
          ids: [packets[0]!.id, packets[0]!.id],
          snapshot: snap,
        }),
        { status: 400 },
      );
      const refs = await inspector.query<{ count: string }>(
        "SELECT count(*)::text FROM hash_talk.message_references WHERE account_id=$1 AND status='received' AND message_id=ANY($2::uuid[])",
        [b.session.accountId, packets.map((p) => p.id)],
      );
      assert.equal(refs.rows[0]?.count, '33');
    },
  );
});
