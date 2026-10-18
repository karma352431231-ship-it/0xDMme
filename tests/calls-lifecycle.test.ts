import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { VoiceCalls } from '../src/client/calls/index.ts';
import { VoicePlayback } from '../src/client/voice-playback/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';

function fixture(t: TestContext) {
  t.mock.timers.enable({
    apis: ['setTimeout', 'setInterval', 'Date'],
    now: 100_000,
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document'),
    online = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(globalThis, 'document', {
    value: { visibilityState: 'visible' },
    configurable: true,
  });
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    configurable: true,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
    if (online) Object.defineProperty(navigator, 'onLine', online);
    else Reflect.deleteProperty(navigator, 'onLine');
  });
  const session: AccountSession = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Sintético',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(200_000).toISOString(),
    profileRevision: 0,
  };
  const authority: VaultAuthority = {
    session,
    offline: false,
    directory: 'a'.repeat(64),
    epoch: 1,
    events: [],
    key: () =>
      Promise.reject(new Error('Sem chave neste teste de transporte.')),
    sign: () => Promise.resolve('synthetic-test-signature'),
  };
  const access: VaultAccess = {
    withVault: (offline, work) => {
      assert.equal(offline, false);
      return work(authority);
    },
    withLocalVault: () =>
      Promise.reject(new Error('Offline fora deste contrato.')),
  };
  const calls = new VoiceCalls({
    access,
    sync: new VaultSync(access),
    playback: new VoicePlayback(),
    before: () => {},
    publish: () => {},
  });
  t.after(() => calls.dispose());
  return { calls, session };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const response = () =>
  Response.json({ configured: true, enabled: true, revision: 0, call: null });

await test('ready concorrente na inicialização mantém heartbeat de 5s e não perde a autorização de 20s', async (t) => {
  const { calls, session } = fixture(t);
  let requests = 0,
    release: ((response: Response) => void) | null = null;
  t.mock.method(globalThis, 'fetch', () => {
    requests++;
    return requests === 1
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Promise.resolve(response());
  });
  calls.setSession(session);
  t.mock.timers.tick(0);
  await flush();
  assert.equal(requests, 1);
  calls.ready();
  calls.ready();
  const first = release;
  assert.ok(first);
  // Callback is assigned by the mocked asynchronous fetch above.
  (first as (response: Response) => void)(response());
  await flush();
  for (let i = 0; i < 6; i++) {
    t.mock.timers.tick(5000);
    await flush();
    assert.equal(requests, i + 2);
  }
});

await test('call wakeups advance the pending poll, coalesce bursts and retain five-second fallback', async (t) => {
  const { calls, session } = fixture(t);
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => {
    requests++;
    return Promise.resolve(response());
  });
  calls.setSession(session);
  t.mock.timers.tick(0);
  await flush();
  assert.equal(requests, 1);
  t.mock.timers.tick(1000);
  for (let i = 0; i < 100; i++) calls.wake();
  t.mock.timers.tick(100);
  await flush();
  assert.equal(
    requests,
    2,
    'an incoming signal must not wait for the scheduled five-second poll',
  );
  t.mock.timers.tick(4999);
  await flush();
  assert.equal(requests, 2);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(requests, 3);
  calls.setSession(null);
  calls.wake();
  t.mock.timers.tick(100);
  await flush();
  assert.equal(requests, 3, 'a wakeup cannot authorize a session');
});

await test('a call wakeup during an in-flight snapshot is retained without concurrent signed requests', async (t) => {
  const { calls, session } = fixture(t);
  let requests = 0,
    active = 0,
    maximum = 0;
  let release: ((value: Response) => void) | undefined;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    active++;
    maximum = Math.max(maximum, active);
    const value =
      requests === 1
        ? await new Promise<Response>((resolve) => {
            release = resolve;
          })
        : response();
    active--;
    return value;
  });
  calls.setSession(session);
  t.mock.timers.tick(0);
  await flush();
  for (let i = 0; i < 100; i++) calls.wake();
  t.mock.timers.tick(100);
  assert.equal(requests, 1);
  assert.ok(release);
  release(response());
  await flush();
  t.mock.timers.tick(100);
  await flush();
  assert.equal(requests, 2);
  assert.equal(maximum, 1);
});
