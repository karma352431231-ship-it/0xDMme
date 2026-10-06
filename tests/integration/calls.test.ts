import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { Wallet } from 'ethers';
import { Database } from '../../src/server/database/index.ts';
import { vaultUsage } from '../../src/server/database/vault-quota.ts';
import {
  AccountService,
  createAccountHandler,
} from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { ContactService } from '../../src/server/contacts/index.ts';
import { MessageService } from '../../src/server/messages/index.ts';
import { CallService } from '../../src/server/calls/index.ts';
import { NotificationService } from '../../src/server/notifications/index.ts';
import { createWebServer } from '../../src/server/web-host/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import {
  createIdentity,
  createRecovery,
  newSecret,
} from '../../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../../src/client/device-operations/index.ts';
import { eventHash, sign } from '../../src/shared/devices/index.ts';
import { contactBody } from '../../src/shared/contacts/index.ts';
import { messageBody } from '../../src/shared/messages/index.ts';
import { object } from '../../src/shared/account/index.ts';
import { callSnapshot } from '../../src/shared/calls/index.ts';

await test('chamadas: HTTP assinado, consentimento, preferência global, silêncio, revogação e ausência de persistência', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  await db.migrate();
  await inspector.connect();
  const origin = 'http://127.0.0.1:45117',
    account = new AccountService({ store: db.authentication, origin });
  const devices = new DeviceService(db.devices),
    contacts = new ContactService(db.contacts, db.devices),
    messages = new MessageService(db, db.devices);
  const delivered: { endpoint: string; urgency: string | undefined }[] = [];
  const notifications = new NotificationService({
    store: db.daily,
    devices: db.devices,
    config: webpush.generateVAPIDKeys(),
    send: (subscription, _config, delivery) => {
      delivered.push({
        endpoint: subscription.endpoint,
        urgency: delivery?.urgency,
      });
      return Promise.resolve();
    },
  });
  const calls = new CallService({
    store: db.calls,
    messages,
    changes: db.changes,
    wake: (invite) => notifications.wake(invite),
    config: {
      urls: ['turn:127.0.0.1:3478?transport=udp'],
      secret: 'x'.repeat(43),
      maxCalls: 16,
    },
  });
  notifications.bindCalls((session, directory) =>
    calls.incoming(session, directory),
  );
  const host = createWebServer({
    origin,
    database: db,
    assets: new Map(),
    objects: { healthy: () => Promise.resolve(true) },
    account: createAccountHandler({
      origin,
      service: account,
      devices,
      contacts,
      messages,
      calls,
      notifications,
    }),
  });
  await new Promise<void>((resolve) =>
    host.server.listen(45117, '127.0.0.1', resolve),
  );
  const accounts: string[] = [];
  t.after(async () => {
    await host.close();
    await notifications.close();
    await messages.close();
    await inspector.query(
      'DELETE FROM hash_talk.contact_relations WHERE lo=ANY($1::uuid[]) OR hi=ANY($1::uuid[])',
      [accounts],
    );
    for (const table of [
      'contact_blocks',
      'contact_controls',
      'device_events',
      'device_directories',
      'login_sessions',
      'login_devices',
    ])
      await inspector.query(
        `DELETE FROM hash_talk.${table} WHERE account_id=ANY($1::uuid[])`,
        [accounts],
      );
    await inspector.query(
      'DELETE FROM hash_talk.accounts WHERE id=ANY($1::uuid[])',
      [accounts],
    );
    await inspector.end();
    await db.close();
  });
  async function create() {
    const wallet = Wallet.createRandom();
    const challenge = await account.challenge({
      ecosystem: 'evm',
      address: wallet.address,
      chainId: 1,
      deviceId: crypto.randomUUID(),
    });
    const login = await account.login(
      {
        id: challenge.id,
        signature: await wallet.signMessage(challenge.message),
      },
      challenge.browserToken,
    );
    accounts.push(login.session.accountId);
    const identity = await createIdentity(login.session.deviceId, 'Sintético'),
      recovery = await createRecovery(login.session.accountId, newSecret());
    const event = await prepareEvent({
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
    await devices.commit(login.session, { event, profile: null });
    return {
      ...login,
      identity,
      event,
      directory: await eventHash(event),
      channel: crypto.randomUUID(),
      sequence: 0,
      wallet: {
        ecosystem: 'evm' as const,
        address: wallet.address.toLowerCase(),
      },
    };
  }
  type User = Awaited<ReturnType<typeof create>>;
  async function contact(
    user: User,
    operation: string,
    payload: Record<string, unknown> = {},
  ) {
    const p = { directory: user.directory, payload };
    return contacts.operate(operation, user.session, {
      ...p,
      signature: await sign(
        user.identity.signing,
        contactBody(
          user.session.accountId,
          user.session.deviceId,
          operation,
          p,
        ),
      ),
    });
  }
  async function revision(user: User) {
    return Number(object(await contact(user, 'state'))['revision']);
  }
  async function proof(user: User, op: string, data: Record<string, unknown>) {
    const payload =
      op === 'configure'
        ? data
        : {
            ...data,
            channel: user.channel,
            request: ++user.sequence,
            at: Date.now(),
          };
    const p = {
      deviceId: user.session.deviceId,
      directory: user.directory,
      payload,
    };
    return {
      ...p,
      signature: await sign(
        user.identity.signing,
        messageBody(
          user.session.accountId,
          user.session.deviceId,
          `call:${op}`,
          p,
        ),
      ),
    };
  }
  async function http(
    user: User,
    op: string,
    input: unknown,
    csrf = user.session.csrf,
  ) {
    return fetch(origin + '/api/account/calls/' + op, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-Hash-Talk-CSRF': csrf,
        Cookie: 'hash-talk-session=' + user.sessionToken,
      },
      body: JSON.stringify(input),
    });
  }
  async function operate(
    user: User,
    op: string,
    data: Record<string, unknown>,
  ) {
    const response = await http(user, op, await proof(user, op, data));
    const raw: unknown = await response.json();
    assert.equal(response.status, 200, JSON.stringify(raw));
    return raw;
  }
  const a = await create(),
    b = await create();
  const sync = async (user: User) =>
    callSnapshot(
      await operate(user, 'sync', { listening: true, media: 'idle', ack: 0 }),
    );
  assert.equal((await sync(b)).enabled, true);
  for (let attempt = 0; attempt < 300; attempt++) {
    const idle = await sync(b);
    assert.equal(idle.enabled, true);
    assert.equal(idle.call, null);
  }
  await sync(a);
  const start = () => ({ peer: b.session.accountId, directory: b.directory });
  const denied = await http(a, 'start', await proof(a, 'start', start()));
  assert.equal(denied.status, 409);
  await contact(b, 'configure', {
    revision: await revision(b),
    mode: 'wallet',
    inviteHash: null,
  });
  await contact(a, 'request', {
    revision: await revision(a),
    target: b.session.accountId,
    invite: null,
  });
  await contact(b, 'respond', {
    revision: await revision(b),
    target: a.session.accountId,
    accept: true,
  });
  const saved = await operate(b, 'configure', { enabled: false, revision: 0 });
  assert.equal(object(saved)['status'], 'saved');
  const changed = await sync(b);
  assert.equal(changed.enabled, false);
  assert.equal(changed.revision, 1);
  assert.equal(
    (await http(a, 'start', await proof(a, 'start', start()))).status,
    409,
  );
  assert.equal(
    (
      await http(
        b,
        'configure',
        await proof(b, 'configure', { enabled: true, revision: 0 }),
      )
    ).status,
    409,
  );
  await operate(b, 'configure', { enabled: true, revision: 1 });
  const opaque = {
    iv: Buffer.alloc(12).toString('base64'),
    wrappedKey: Buffer.alloc(384).toString('base64'),
    ciphertext: Buffer.alloc(32).toString('base64'),
  };
  const recipient = { session: b.session, directory: b.directory };
  const curve = createECDH('prime256v1');
  curve.generateKeys();
  await db.daily.subscribe(recipient, {
    endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-calls',
    keys: {
      p256dh: curve.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  });
  assert.deepEqual(await db.daily.pushPreferences(recipient), {
    messages: true,
    calls: true,
    showCalls: true,
  });
  const usedBefore = Number(
    (
      await inspector.query<{ bytes: string }>(
        'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
      )
    ).rows[0]!.bytes,
  );
  const ownBefore = await vaultUsage(inspector, b.session.accountId);
  await db.daily.configurePush(recipient, {
    messages: false,
    calls: false,
    showCalls: true,
  });
  const usedAfter = Number(
    (
      await inspector.query<{ bytes: string }>(
        'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
      )
    ).rows[0]!.bytes,
  );
  assert.equal(
    (await vaultUsage(inspector, b.session.accountId)) - ownBefore,
    256,
  );
  assert.equal(
    usedAfter - usedBefore,
    256,
    'preferências entram no orçamento global',
  );
  assert.equal(
    (await db.daily.callJobs(b.session.accountId, [b.session.deviceId])).length,
    0,
  );
  await operate(b, 'sync', { listening: false, media: 'idle', ack: 0 });
  assert.equal(
    (await http(a, 'start', await proof(a, 'start', start()))).status,
    409,
  );
  await db.daily.configurePush(recipient, {
    messages: false,
    calls: true,
    showCalls: true,
  });
  const sleeping = object(await operate(a, 'start', start())),
    sleepingId = String(object(sleeping['call'])['id']);
  assert.deepEqual(sleeping['devices'], [b.session.deviceId]);
  assert.equal(
    await notifications.allowPush(b.session),
    false,
    'sem oferta cifrada não há aviso',
  );
  await operate(a, 'offer', {
    id: sleepingId,
    sequence: 1,
    packets: [{ device: b.session.deviceId, body: opaque }],
  });
  await notifications.flushCalls();
  assert.deepEqual(delivered, [
    {
      endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-calls',
      urgency: 'high',
    },
  ]);
  const noticeResponse = await fetch(origin + '/api/account/push-check', {
    headers: { Cookie: 'hash-talk-session=' + b.sessionToken },
  });
  assert.deepEqual(await noticeResponse.json(), {
    allowed: true,
    call: true,
    showCall: true,
  });
  await db.daily.configurePush(recipient, {
    messages: false,
    calls: true,
    showCalls: false,
  });
  assert.deepEqual(await notifications.inspectPush(b.session), {
    allowed: true,
    call: true,
    showCall: false,
  });
  await operate(a, 'end', { id: sleepingId });
  assert.equal(
    await notifications.allowPush(b.session),
    false,
    'cancelamento invalida aviso atrasado',
  );
  const reopened = { ...b, channel: crypto.randomUUID(), sequence: 0 };
  assert.equal(
    (await sync(reopened)).call,
    null,
    'abrir app não recupera convite encerrado',
  );
  await operate(reopened, 'sync', { listening: false, media: 'idle', ack: 0 });
  const awakeCall = object(await operate(a, 'start', start())),
    awakeId = String(object(awakeCall['call'])['id']);
  await operate(a, 'offer', {
    id: awakeId,
    sequence: 1,
    packets: [{ device: b.session.deviceId, body: opaque }],
  });
  const waking = { ...b, channel: crypto.randomUUID(), sequence: 0 };
  assert.deepEqual((await sync(waking)).call?.signal, opaque);
  await operate(waking, 'accept', { id: awakeId });
  assert.equal(
    await notifications.allowPush(b.session),
    false,
    'atendimento invalida aviso',
  );
  await operate(a, 'end', { id: awakeId });
  const expiredSubscription = (
    await db.daily.callJobs(b.session.accountId, [b.session.deviceId])
  )[0]!;
  await inspector.query(
    'UPDATE hash_talk.push_subscriptions SET generation=generation+1 WHERE account_id=$1',
    [b.session.accountId],
  );
  await db.daily.retireCallSubscription(expiredSubscription);
  assert.equal(
    (await db.daily.callJobs(b.session.accountId, [b.session.deviceId])).length,
    0,
    '410 remove a inscrição mesmo após coalescer mensagens novas',
  );
  assert.deepEqual(
    await db.daily.pushPreferences(recipient),
    { messages: false, calls: true, showCalls: false },
    'remover inscrição preserva preferências',
  );
  await sync(b);
  const sibling = { ...b, channel: crypto.randomUUID(), sequence: 0 };
  await sync(sibling);
  const raced = callSnapshot({
    ...(await sync(a)),
    call: object(await operate(a, 'start', start()))['call'],
  }).call!;
  await operate(a, 'offer', {
    id: raced.id,
    sequence: 1,
    packets: [{ device: b.session.deviceId, body: opaque }],
  });
  const answers = await Promise.all(
    [b, sibling].map(async (user) =>
      http(user, 'accept', await proof(user, 'accept', { id: raced.id })),
    ),
  );
  assert.deepEqual(
    answers.map((response) => response.status).sort(),
    [200, 409],
    'apenas uma aba obtém autoridade de atendimento',
  );
  const losing = answers[0]!.status === 409 ? b : sibling;
  assert.equal((await sync(losing)).call, null);
  // Ordinary writes have no minute quota; malformed input still fails and
  // neither identity reads nor call control are affected by the write burst.
  for (let attempt = 0; attempt < 61; attempt++) {
    const response = await fetch(origin + '/api/account/name', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-Hash-Talk-CSRF': a.session.csrf,
        Cookie: 'hash-talk-session=' + a.sessionToken,
      },
      body: '{}',
    });
    assert.equal(response.status, 400);
  }
  const directoryRead = {
    deviceId: a.session.deviceId,
    directory: a.directory,
    payload: { accountId: b.session.accountId, after: 0 },
  };
  const identityResponse = await fetch(
    origin + '/api/account/messages/peer-directory',
    {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-Hash-Talk-CSRF': a.session.csrf,
        Cookie: 'hash-talk-session=' + a.sessionToken,
      },
      body: JSON.stringify({
        ...directoryRead,
        signature: await sign(
          a.identity.signing,
          messageBody(
            a.session.accountId,
            a.session.deviceId,
            'peer-directory',
            directoryRead,
          ),
        ),
      }),
    },
  );
  assert.equal(identityResponse.status, 200);
  assert.equal(object(await identityResponse.json())['head'], b.directory);
  await operate(a, 'end', { id: raced.id });
  assert.equal((await sync(b)).call, null);
  assert.equal((await sync(sibling)).call, null);
  const call = object(await operate(a, 'start', start()));
  const id = String(object(call['call'])['id']);
  assert.equal((await sync(a)).call?.id, id);
  const credential = object(await operate(a, 'turn', { id }));
  assert.ok(credential['iceServers']);
  const replay = await proof(a, 'sync', {
    listening: true,
    media: 'idle',
    ack: 0,
  });
  assert.equal((await http(a, 'sync', replay)).status, 200);
  assert.equal((await http(a, 'sync', replay)).status, 409);
  const valid = await proof(a, 'sync', {
    listening: true,
    media: 'idle',
    ack: 0,
  });
  assert.equal((await http(a, 'sync', valid, 'wrong')).status, 403);
  assert.equal(
    (await http(a, 'sync', { ...valid, signature: b.identity.public.signing }))
      .status,
    400,
  );
  await operate(a, 'offer', {
    id,
    sequence: 1,
    packets: [{ device: b.session.deviceId, body: opaque }],
  });
  await db.daily.mute(
    { session: b.session, directory: b.directory },
    a.session.accountId,
    { revision: 0, mutedUntil: Number.MAX_SAFE_INTEGER },
  );
  assert.equal(
    (await http(b, 'accept', await proof(b, 'accept', { id }))).status,
    409,
    'revalidar silêncio antes do atendimento, sem depender do próximo sync',
  );
  assert.equal(
    (await sync(a)).call,
    null,
    'arquivamento/silêncio retira o convite',
  );
  assert.equal(
    (await http(a, 'start', await proof(a, 'start', start()))).status,
    409,
  );
  await db.daily.mute(
    { session: b.session, directory: b.directory },
    a.session.accountId,
    { revision: 1, mutedUntil: 0 },
  );
  await sync(b);
  await operate(a, 'start', start());
  await contact(b, 'block', {
    revision: await revision(b),
    wallet: a.wallet,
    blocked: true,
  });
  assert.equal((await sync(a)).call, null, 'bloqueio termina a chamada');
  await account.logout(a.sessionToken);
  assert.equal(
    (
      await http(
        a,
        'sync',
        await proof(a, 'sync', { listening: true, media: 'idle', ack: 0 }),
      )
    ).status,
    401,
  );
  const rows = await inspector.query<{ name: string }>(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema='hash_talk' AND table_name LIKE '%call%'",
  );
  assert.deepEqual(
    rows.rows.map((r) => r.name),
    ['call_controls'],
  );
  const packets = await inspector.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM hash_talk.message_packets WHERE sender=ANY($1::uuid[]) OR recipient=ANY($1::uuid[])',
    [accounts],
  );
  assert.equal(packets.rows[0]?.n, '0');
  const persistent = await inspector.query(
    'SELECT enabled,revision,charge FROM hash_talk.call_controls WHERE account_id=$1',
    [b.session.accountId],
  );
  assert.deepEqual(persistent.rows, [
    { enabled: true, revision: 2, charge: 256 },
  ]);
});
