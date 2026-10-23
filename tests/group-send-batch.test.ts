import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { initAsync } from '@matrix-org/matrix-sdk-crypto-wasm';
import {
  GroupSendBatch,
  MessageCrypto,
} from '../src/client/message-crypto/index.ts';
import type {
  GroupEncryptionInput,
  MessageTransport,
} from '../src/client/message-crypto/index.ts';
import { createRecoveryKey } from '../src/client/message-recovery/index.ts';
import { groupEventHash } from '../src/shared/groups/index.ts';
import { canonical, digest } from '../src/shared/devices/index.ts';
import type { GroupEvent } from '../src/shared/groups/index.ts';
import { GroupCache } from '../src/client/groups/cache.ts';
import {
  sendGroupPending,
  staleGroupSend,
} from '../src/client/groups/outbox.ts';
import { PeerIdentity } from '../src/client/peer-identity/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';

// No member has published Matrix devices yet: like the server, the response
// lists every queried user with no device, so the SDK marks them up to date.
function counting() {
  const calls = { query: 0 };
  const transport: MessageTransport = (operation, payload) => {
    if (operation === 'matrix-query') {
      calls.query++;
      const sdk = (payload as { sdk?: { device_keys?: object } }).sdk;
      const users = Object.keys(sdk?.device_keys ?? {});
      return Promise.resolve({
        response: {
          device_keys: Object.fromEntries(users.map((user) => [user, {}])),
          failures: {},
        },
        bindings: [],
      });
    }
    if (operation === 'matrix-upload')
      return Promise.resolve({
        response: { one_time_key_counts: { signed_curve25519: 50 } },
      });
    if (operation === 'matrix-claim')
      return Promise.resolve({ response: { one_time_keys: {}, failures: {} } });
    return Promise.resolve({ response: {} });
  };
  return { calls, transport };
}

await initAsync();
const owner = await groupParticipant(),
  member = await groupParticipant();
const participants = [owner, member].sort((a, b) =>
  a.accountId.localeCompare(b.accountId),
);
const recovery = await Promise.all(
  participants.map((p) => createRecoveryKey(p.authority)),
);
function period(epoch: number): GroupEvent {
  return {
    version: 1,
    groupId: '00000000-0000-4000-8000-000000000001',
    revision: epoch,
    epoch,
    previous: 'a'.repeat(64),
    kind: 'join',
    actor: member.accountId,
    deviceId: member.deviceId,
    directory: member.head,
    authorityRevision: 1,
    target: member.accountId,
    owner: owner.accountId,
    members: participants.map((p) => ({
      accountId: p.accountId,
      role: p.accountId === owner.accountId ? 'owner' : 'member',
      joined: p.accountId === owner.accountId ? 1 : 2,
    })),
    consent: null,
    signature: 'A'.repeat(86) + '==',
  };
}
async function sender(transport: MessageTransport) {
  return MessageCrypto.create({
    accountId: owner.accountId,
    deviceId: owner.deviceId,
    store: null,
    transport,
  });
}
function message(
  transport: MessageTransport,
  extra: Partial<GroupEncryptionInput> = {},
): GroupEncryptionInput {
  return {
    authority: owner.authority,
    state: period(2),
    histories: participants.map((p) => [p.directory]),
    recovery,
    transport,
    id: crypto.randomUUID(),
    text: 'Synthetic group text',
    ...extra,
  };
}

/** A machine past its own first preparation, which queries on its own. */
async function warm() {
  const { calls, transport } = counting(),
    machine = await sender(transport);
  await machine.encryptGroup(message(transport));
  const before = calls.query;
  return { machine, transport, queries: () => calls.query - before };
}

await test('messages of one batch share one Matrix device query; unbatched messages query each time', async (t) => {
  const { machine, transport, queries } = await warm();
  t.after(() => machine.close());
  const batch = new GroupSendBatch();
  for (let n = 0; n < 3; n++)
    await machine.encryptGroup(message(transport, { batch }));
  assert.equal(queries(), 1);
  for (let n = 0; n < 3; n++) await machine.encryptGroup(message(transport));
  assert.equal(queries(), 4);
});

await test('a new batch queries again, so devices or Matrix keys that appeared since are found', async (t) => {
  const { machine, transport, queries } = await warm();
  t.after(() => machine.close());
  await machine.encryptGroup(
    message(transport, { batch: new GroupSendBatch() }),
  );
  await machine.encryptGroup(
    message(transport, { batch: new GroupSendBatch() }),
  );
  assert.equal(queries(), 2);
});

await test('a different group period inside the same batch queries again', async (t) => {
  const { machine, transport, queries } = await warm();
  t.after(() => machine.close());
  const batch = new GroupSendBatch();
  await machine.encryptGroup(message(transport, { batch }));
  await machine.encryptGroup(message(transport, { batch }));
  await machine.encryptGroup(message(transport, { batch, state: period(3) }));
  assert.equal(queries(), 2);
});

await test('a batch reuses trust for at most sixteen messages and ten seconds, and a rejection resets it', () => {
  let now = 0;
  const batch = new GroupSendBatch(() => now);
  assert.equal(batch.covers('k'), false);
  batch.used('k', true);
  for (let n = 1; n < 16; n++) {
    assert.equal(batch.covers('k'), true);
    batch.used('k', false);
  }
  assert.equal(batch.covers('k'), false, 'A seventeenth message queries');
  batch.used('k', true);
  assert.equal(batch.covers('other'), false);
  now = 10_000;
  assert.equal(batch.covers('k'), false, 'An old batch queries');
  now = 0;
  batch.reset();
  assert.equal(batch.covers('k'), false);
});

/** The group's encrypted local store holding one encrypted draft. */
function storedDraft(
  t: TestContext,
  encrypted: Awaited<ReturnType<MessageCrypto['encryptGroup']>>,
) {
  const stored = new Map<string, unknown>([
    [
      `outbox:${encrypted.packet.id}`,
      {
        id: encrypted.packet.id,
        kind: 'text',
        text: 'Synthetic group text',
        packet: encrypted.packet,
        keys: encrypted.keys,
        uploadEpoch: null,
        order: 1,
      },
    ],
  ]);
  t.mock.method(GroupCache.prototype, 'page', () =>
    Promise.resolve({
      items: [...stored].map(([name, value]) => ({ name, value })),
      next: null,
    }),
  );
  t.mock.method(GroupCache.prototype, 'put', (name: string, value: unknown) => {
    stored.set(name, structuredClone(value));
    return Promise.resolve();
  });
  t.mock.method(GroupCache.prototype, 'remove', (name: string) => {
    stored.delete(name);
    return Promise.resolve();
  });
  return stored;
}
const access = {
  withVault: () => Promise.reject(new Error('Not used.')),
  withLocalVault: () => Promise.reject(new Error('Not used.')),
};

await test('a publication rejected after a revocation clears the stored packet for a fresh encryption', async (t) => {
  const { transport } = counting(),
    machine = await sender(transport);
  t.after(() => machine.close());
  const state = period(2),
    encrypted = await machine.encryptGroup(message(transport));
  const stored = storedDraft(t, encrypted);
  const rejection = Object.assign(
    new Error(
      'Participant directory or recovery changed. Refresh before resending.',
    ),
    { status: 409 },
  );
  const sending = sendGroupPending({
    authority: owner.authority,
    group: { state, head: await groupEventHash(state) },
    identities: new PeerIdentity(new VaultSync(access)),
    machine,
    api: (operation) => {
      if (operation === 'group-message-accepted') return Promise.resolve(false);
      if (operation === 'group-message-publish')
        return Promise.reject(rejection);
      return Promise.reject(new Error(`Unexpected ${operation}.`));
    },
  });
  await assert.rejects(sending, (error: unknown) => staleGroupSend(error));
  const draft = stored.get(`outbox:${encrypted.packet.id}`) as {
    packet: unknown;
    keys: unknown;
  };
  assert.equal(draft.packet, null);
  assert.equal(draft.keys, null);
});

await test('a lost acceptance answer settles on the next send, after a reload, without publishing twice or reading history', async (t) => {
  const { transport } = counting(),
    machine = await sender(transport);
  t.after(() => machine.close());
  const state = period(2),
    encrypted = await machine.encryptGroup(message(transport)),
    name = `outbox:${encrypted.packet.id}`;
  const stored = storedDraft(t, encrypted);
  const server = new Set<string>(),
    published: string[] = [],
    progress = { sending: [] as string[], accepted: [] as string[] };
  // Any other operation, a history read among them, fails the send.
  const api = async (operation: string, payload: unknown) => {
    const body = payload as { hash?: string; packet?: object };
    if (operation === 'group-message-accepted')
      return server.has(body.hash ?? '');
    if (operation !== 'group-message-publish')
      throw new Error(`Unexpected ${operation}.`);
    const hash = await digest(canonical(body.packet));
    published.push(hash);
    server.add(hash);
    throw new TypeError('The answer was lost.');
  };
  const send = async () =>
    sendGroupPending({
      authority: owner.authority,
      group: { state, head: await groupEventHash(state) },
      identities: new PeerIdentity(new VaultSync(access)),
      machine,
      api,
      progress: {
        sending: (id) => progress.sending.push(id),
        accepted: (id) => progress.accepted.push(id),
      },
    });
  await assert.rejects(send(), TypeError);
  assert.ok(stored.has(name), 'The packet stays until acceptance is known');
  assert.deepEqual(progress.accepted, []);
  await send();
  assert.equal(published.length, 1, 'Published once');
  assert.deepEqual(progress.sending, [
    encrypted.packet.id,
    encrypted.packet.id,
  ]);
  assert.deepEqual(progress.accepted, [encrypted.packet.id]);
  assert.equal(stored.has(name), false);
});
