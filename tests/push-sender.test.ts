import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createECDH, randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { mkdtemp, rm, writeFile, readFile, lstat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import webpush from 'web-push';
import { deferred } from './fixtures/deferred.ts';
import {
  createPushSender,
  dispatchPush,
  readPushClientConfiguration,
  pushDispatch,
  preparePushSocket,
  sendPush,
} from '../src/server/push-sender/index.ts';
import {
  defaultPushPreferences,
  pushPreferences,
} from '../src/shared/daily/index.ts';

const keys = webpush.generateVAPIDKeys();
const token = randomBytes(32).toString('base64url');
// macOS's default tmpdir can exceed the Unix socket path limit; Linux CI uses its own tmpdir.
const temporaryPrefix = join(
  process.platform === 'darwin' ? '/private/tmp' : tmpdir(),
  '0xdmme-push-',
);
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic',
  keys: {
    p256dh: ecdh.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  },
};
await test('web accepts only socket configuration and rejects private VAPID or partial configuration', () => {
  const env = {
    HASH_TALK_PUSH_PUBLIC_KEY: keys.publicKey,
    HASH_TALK_PUSH_SOCKET: '/private/tmp/push.sock',
    HASH_TALK_PUSH_TOKEN: token,
  };
  assert.equal(readPushClientConfiguration({}), null);
  assert.deepEqual(readPushClientConfiguration(env), {
    publicKey: keys.publicKey,
    socketPath: '/private/tmp/push.sock',
    token,
  });
  for (const bad of [
    { ...env, HASH_TALK_PUSH_PRIVATE_KEY: keys.privateKey },
    { HASH_TALK_PUSH_PUBLIC_KEY: keys.publicKey },
    { ...env, HASH_TALK_PUSH_SOCKET: 'https://example.test' },
    { ...env, HASH_TALK_PUSH_TOKEN: 'short' },
  ])
    assert.throws(() => readPushClientConfiguration(bad));
});
await test('push contract rejects content, identifiers, private destination, expired invitation and unbounded deadline', () => {
  const input = { subscription, expiresAt: 150_000, urgency: 'high' };
  assert.deepEqual(pushDispatch(input, 100_000), input);
  for (const bad of [
    { ...input, call: crypto.randomUUID() },
    { ...input, body: 'Conteúdo' },
    { ...input, expiresAt: 100_000 },
    { ...input, expiresAt: 160_001 },
    { ...input, urgency: 'urgent' },
    {
      ...input,
      subscription: { ...subscription, endpoint: 'https://127.0.0.1/private' },
    },
  ])
    assert.throws(() => pushDispatch(bad, 100_000));
  assert.deepEqual(pushPreferences(defaultPushPreferences), {
    messages: true,
    calls: true,
    showCalls: true,
  });
  assert.throws(() =>
    pushPreferences({ messages: true, calls: 1, showCalls: false }),
  );
});
await test('socket sender authenticates, validates requests, transmits only subscription and deadline and propagates expired subscription', async (t) => {
  const directory = await mkdtemp(temporaryPrefix),
    socketPath = join(directory, 'sender.sock');
  let sent = 0,
    gone = false;
  const server = createPushSender({
    config: { ...keys, subject: 'https://0xdmme.app' },
    token,
    send: (s, config, delivery) => {
      assert.deepEqual(s, subscription);
      assert.equal(config.privateKey, keys.privateKey);
      assert.equal(delivery?.urgency, 'high');
      sent++;
      return gone
        ? Promise.reject(
            Object.assign(new Error('Sintético'), { statusCode: 410 }),
          )
        : Promise.resolve();
    },
  });
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  const config = { publicKey: keys.publicKey, socketPath, token };
  await assert.rejects(preparePushSocket(socketPath), /already active/u);
  const delivery = { urgency: 'high' as const, expiresAt: Date.now() + 59_000 };
  await assert.rejects(
    dispatchPush(
      { ...config, token: randomBytes(32).toString('base64url') },
      subscription,
      delivery,
    ),
    { statusCode: 401 },
  );
  assert.equal(sent, 0);
  const malformed = JSON.stringify({
    subscription,
    ...delivery,
    content: 'Proibido',
  });
  const status = await new Promise<number>((resolve, reject) => {
    const req = request(
      {
        socketPath,
        path: '/send',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Push-Key': config.publicKey,
          'Content-Length': Buffer.byteLength(malformed),
        },
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode!));
      },
    );
    req.once('error', reject);
    req.end(malformed);
  });
  assert.equal(status, 503);
  assert.equal(sent, 0);
  await dispatchPush(config, subscription, delivery);
  assert.equal(sent, 1);
  gone = true;
  await assert.rejects(dispatchPush(config, subscription, delivery), {
    statusCode: 410,
  });
  gone = false;
  await assert.rejects(
    dispatchPush(
      { ...config, publicKey: 'B'.repeat(87) },
      subscription,
      delivery,
    ),
  );
  assert.equal(
    sent,
    2,
    'chave incompatível é recusada antes da conexão externa',
  );
});
await test('external delivery preserves generic payload, separates urgent coalescing and bounds timeout and TTL to the invitation', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100_000 });
  const capture: typeof webpush.sendNotification = (s, payload, options) => {
    assert.deepEqual(s, subscription);
    assert.equal(
      payload,
      JSON.stringify({
        title: '0xDMme',
        body: 'New activity. Open the app to sync.',
      }),
    );
    assert.equal(options?.TTL, 2);
    assert.equal(options?.timeout, 2500);
    assert.equal(options?.urgency, 'high');
    assert.equal(options?.topic, '0xdmme-urgent');
    return Promise.resolve({ statusCode: 201, headers: {}, body: '' });
  };
  t.mock.method(webpush, 'sendNotification', capture);
  await sendPush(
    subscription,
    { ...keys, subject: 'https://0xdmme.app' },
    { urgency: 'high', expiresAt: 102_500 },
  );
});
await test(
  'restart recovers its own orphan socket and preserves regular files',
  { timeout: 10_000 },
  async (t) => {
    const directory = await mkdtemp(temporaryPrefix),
      socketPath = join(directory, 'sender.sock');
    const child = spawn(
      process.execPath,
      [
        '-e',
        "require('node:net').createServer().listen(process.argv[1], () => process.stdout.write('ready'));",
        socketPath,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    t.after(async () => {
      child.kill();
      await rm(directory, { recursive: true, force: true });
    });
    await once(child.stdout, 'data');
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
    assert.equal((await lstat(socketPath)).isSocket(), true);
    await preparePushSocket(socketPath);
    await assert.rejects(lstat(socketPath), { code: 'ENOENT' });
    await writeFile(socketPath, 'Preservar');
    await assert.rejects(preparePushSocket(socketPath), /does not belong/u);
    assert.equal(await readFile(socketPath, 'utf8'), 'Preservar');
  },
);
await test('sender accepts concurrent sockets beyond eight and more than 600 sends in one window', async (t) => {
  t.mock.method(process, 'availableMemory', () => 64 * 1_048_576);
  t.mock.timers.enable({ apis: ['Date'], now: 100_000 });
  const directory = await mkdtemp(temporaryPrefix),
    socketPath = join(directory, 'sender.sock');
  const release = deferred<void>(),
    ready = deferred<void>();
  let sent = 0;
  const server = createPushSender({
    config: { ...keys, subject: 'https://0xdmme.app' },
    token,
    send: () => {
      sent++;
      if (sent === 16) ready.resolve();
      return release.promise;
    },
  });
  t.after(async () => {
    release.resolve();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  const config = { publicKey: keys.publicKey, socketPath, token };
  const pending = Array.from({ length: 16 }, () =>
    dispatchPush(config, subscription),
  );
  for (const request of pending)
    void request.catch((error: unknown) => ready.reject(error));
  await ready.promise;
  release.resolve();
  await Promise.all(pending);
  // Keep socket pressure bounded while proving the old shared minute ceiling is gone.
  for (let batch = 0; batch < 38; batch++)
    await Promise.all(
      Array.from({ length: 16 }, () => dispatchPush(config, subscription)),
    );
  assert.equal(sent, 624);
});

await test('sender refuses memory pressure and recovers after success and transport failure', async (t) => {
  let bytes = 1_048_576,
    fail = false;
  t.mock.method(process, 'availableMemory', () => bytes);
  const directory = await mkdtemp(temporaryPrefix),
    socketPath = join(directory, 'sender.sock');
  const release = deferred<void>(),
    entered = deferred<void>();
  let sent = 0;
  const server = createPushSender({
    config: { ...keys, subject: 'https://0xdmme.app' },
    token,
    send: () => {
      sent++;
      entered.resolve();
      if (fail)
        return Promise.reject(new Error('Synthetic transport failure.'));
      return release.promise;
    },
  });
  t.after(async () => {
    release.resolve();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  const config = { publicKey: keys.publicKey, socketPath, token };
  const first = dispatchPush(config, subscription);
  void first.catch((error: unknown) => entered.reject(error));
  await entered.promise;
  await assert.rejects(dispatchPush(config, subscription), { statusCode: 429 });
  assert.equal(sent, 1);
  release.resolve();
  await first;
  fail = true;
  await assert.rejects(dispatchPush(config, subscription), { statusCode: 503 });
  fail = false;
  await dispatchPush(config, subscription);
  bytes = 0;
  await assert.rejects(dispatchPush(config, subscription), { statusCode: 429 });
  bytes = 1_048_576;
  await dispatchPush(config, subscription);
  assert.equal(sent, 4);
});
