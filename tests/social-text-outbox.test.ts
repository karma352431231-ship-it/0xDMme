import { ApiResponseError } from '../src/client/api-response/index.ts';
import { createIdentity, aesKey } from '../src/client/device-keys/index.ts';
import {
  prepareEvent,
  freshKeyring,
} from '../src/client/device-operations/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { initAsync } from '@matrix-org/matrix-sdk-crypto-wasm';
import { SocialTextOutbox } from '../src/client/social-dm/text-outbox.ts';
import {
  MessageCrypto,
  PrivateAudiences,
} from '../src/client/message-crypto/index.ts';
import { createRecoveryKey } from '../src/client/message-recovery/index.ts';
import type { TextDraft } from '../src/client/text-send/index.ts';
import type { MessagePacket } from '../src/shared/messages/index.ts';
import type { SocialContext } from '../src/client/social-dm/crypto-context.ts';
import { deviceDatabase } from './fixtures/device-database.ts';
import { recordDatabase } from './fixtures/record-database.ts';
import { groupParticipant } from './fixtures/group-participant.ts';
import { messageTransport } from './fixtures/message-transport.ts';
import {
  localGet,
  localPut,
  openLocal,
  outboxPage,
  sealLocal,
} from '../src/client/message-storage/index.ts';
import type { VaultAccess } from '../src/client/vault-authority/index.ts';
import { canonical, digest, eventHash } from '../src/shared/devices/index.ts';

await initAsync();
function installStorage(t: TestContext): void {
  const db = recordDatabase();
  const devices = deviceDatabase();
  const indexedDB = {
    ...db.factory,
    open: (name: string, version?: number) =>
      name === '0xdmme-device-authority'
        ? devices.open(name, version)
        : db.factory.open(name, version),
  };

  for (const [name, value] of Object.entries({
    indexedDB,
    IDBKeyRange: db.range,
    navigator: { onLine: true },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}
async function fixture(t: TestContext) {
  installStorage(t);
  const owner = await groupParticipant(),
    own = await groupParticipant({ deviceName: 'DM device' }),
    peer = await groupParticipant({ deviceName: 'DM device' });
  const recovery = await Promise.all(
    [own, peer].map((p) => createRecoveryKey(p.authority)),
  );
  const other = await groupParticipant({ deviceName: 'DM device' });
  const otherRecovery = await createRecoveryKey(other.authority);
  const transport = messageTransport();
  const operations: string[] = [];
  const machine = await MessageCrypto.create({
    accountId: own.accountId,
    deviceId: own.deviceId,
    store: null,
    transport: (operation, input) => {
      operations.push(operation);
      return transport.transport(operation, input);
    },
    audiences: new PrivateAudiences(),
  });
  const recipient = await MessageCrypto.create({
    accountId: peer.accountId,
    deviceId: peer.deviceId,
    store: null,
    transport: transport.transport,
  });
  await recipient.prepare(peer.authority);
  t.after(() => {
    machine.close();
    recipient.close();
  });
  let generation = 0,
    turns = 0;
  const packets = new Map<string, MessagePacket>();
  const state = {
    loseResponse: false,
    rejectPublish: false,
    beforePublish: null as ((packet: MessagePacket) => Promise<void>) | null,
  };
  const guard = (captured: number) => {
    if (captured !== generation) throw new Error('Session changed.');
  };
  const publish = async (input: Record<string, unknown>) => {
    const packet = input['packet'] as MessagePacket;
    await state.beforePublish?.(packet);
    if (state.rejectPublish)
      return Promise.reject(new Error('Publication refused'));
    packets.set(packet.id, packet);
    if (state.loseResponse) return Promise.reject(new Error('Response lost'));
    return Promise.resolve({ status: 'accepted' });
  };
  const api: SocialContext['api'] = (operation, input) => {
    operations.push(operation);
    if (operation === 'directory')
      return Promise.resolve({
        profile:
          input['peer'] === other.accountId ? other.accountId : peer.accountId,
        events: [
          ...(input['peer'] === other.accountId
            ? other.authority.events
            : peer.authority.events),
        ],
        next: null,
        device: null,
        active: null,
      });
    if (operation === 'recovery-current') return Promise.resolve(recovery[0]);
    if (operation === 'recovery-peer')
      return Promise.resolve(
        input['accountId'] === other.accountId ? otherRecovery : recovery[1],
      );
    if (operation === 'accepted')
      return Promise.resolve(packets.has(String(input['id'])));
    if (operation === 'publish') return publish(input);
    return Promise.reject(new Error('Unexpected API: ' + operation));
  };
  const context: SocialContext = {
    privateAuthority: owner.authority,
    authority: own.authority,
    machine,
    api,
    senderHistories: new Map(),
    sendPeers: new Map(),
  };
  const access: VaultAccess = {
    withVault: (_offline, work) => work(owner.authority),
    withLocalVault: (_locator, work) => work(owner.authority),
  };
  const create = () =>
    new SocialTextOutbox({
      access,
      lifetime: { current: () => generation, guard },
      crypto: (work) => {
        turns++;
        return work({
          ...context,
          senderHistories: new Map(),
          sendPeers: new Map(),
        });
      },
    });
  return {
    owner,
    own,
    peer,
    other,
    recovery,
    machine,
    access,
    create,
    state,
    packets,
    operations,
    invalidate: () => generation++,
    turns: () => turns,
    scope: `dm-text:${owner.accountId}:${owner.deviceId}`,
  };
}
function draft(peer: string, index: number): TextDraft {
  return {
    id: crypto.randomUUID(),
    peer,
    text: 'Synthetic draft ' + index,
    createdAt: index,
  };
}

await test('public text admission is encrypted, FIFO across peers, durable across owners and drained in bounded crypto turns', async (t) => {
  const f = await fixture(t),
    queue = f.create();
  const values = Array.from({ length: 18 }, (_, index) =>
    draft(index % 2 ? f.other.accountId : f.peer.accountId, index),
  );
  for (const value of values) await queue.queueText(value);
  assert.deepEqual(
    f.operations,
    [],
    'Local admission never opens SDK transport or calls the server.',
  );
  assert.equal(f.turns(), 0);
  const stored = await outboxPage<{ draft: Parameters<typeof openLocal>[1] }>(
    f.scope,
  );
  assert.ok(!JSON.stringify(stored).includes('Synthetic draft'));
  assert.deepEqual(
    await outboxPage(f.owner.accountId),
    [],
    'Private-chat outbox remains independent.',
  );
  const restored = f.create();
  assert.deepEqual(
    (await restored.pendingTexts(f.peer.accountId)).map((item) => item.id),
    values
      .slice(0, 16)
      .filter((item) => item.peer === f.peer.accountId)
      .map((item) => item.id),
  );
  const published: string[] = [];
  assert.deepEqual(
    await restored.sendPending({
      published: (item) => published.push(item.id),
    }),
    { more: true },
  );
  assert.equal(f.turns(), 1);
  assert.deepEqual(
    published,
    values.slice(0, 16).map((item) => item.id),
  );
  assert.equal(
    f.operations.filter((op) => op === 'accepted').length,
    0,
    'Brand-new packets do not preflight acceptance.',
  );
  assert.equal(
    f.operations.filter((op) => op === 'directory').length,
    2,
    'One current peer directory per recipient in the bounded burst.',
  );
  assert.deepEqual(
    await restored.sendPending({
      published: (item) => published.push(item.id),
    }),
    { more: false },
  );
  assert.equal(f.turns(), 2);
  assert.deepEqual(
    published,
    values.map((item) => item.id),
  );
  assert.equal(await localGet(f.scope, 'usage'), 0);
});

await test('an uncertain publication retains its packet and stable id; retry confirms acceptance without duplicating or replacing ciphertext', async (t) => {
  const f = await fixture(t),
    queue = f.create(),
    value = draft(f.peer.accountId, 1);
  await queue.queueText(value);
  f.state.loseResponse = true;
  await assert.rejects(queue.sendPending(), /Response lost/u);
  const accepted = f.packets.get(value.id)!;
  const hash = await digest(canonical(accepted));
  await queue.queueText({ ...value, text: 'Must not replace the original' });
  assert.equal((await queue.pendingTexts(value.peer))[0]?.text, value.text);
  f.state.loseResponse = false;
  f.operations.length = 0;
  const confirmations: string[] = [];
  await f
    .create()
    .sendPending({ published: (item) => confirmations.push(item.id) });
  assert.deepEqual(f.operations, ['accepted']);
  assert.deepEqual(confirmations, [value.id]);
  assert.equal(await digest(canonical(f.packets.get(value.id))), hash);
  assert.deepEqual(await queue.pendingTexts(value.peer), []);
});

await test('legacy public pending packets are adopted before new text without losing their retry id', async (t) => {
  const f = await fixture(t),
    value = draft(f.peer.accountId, 1);
  const packet = await f.machine.encrypt({
    authority: f.own.authority,
    peerHistory: [f.peer.directory],
    recovery: f.recovery,
    id: value.id,
    text: value.text,
  });
  const name = 'dm-send:' + value.peer,
    oldScope = `${f.owner.accountId}:${f.owner.deviceId}`;
  const held = await sealLocal(
    f.owner.authority,
    crypto.randomUUID(),
    JSON.stringify({ hash: 'old-commitment', packet, text: value.text }),
  );
  await localPut(oldScope, name, held, held.bytes.length + 512);
  const queue = f.create(),
    next = draft(value.peer, 2);
  await queue.queueText(next);
  const restored = await queue.pendingTexts(value.peer);
  assert.deepEqual(
    restored.map((item) => item.id),
    [value.id],
  );
  assert.ok(
    await localGet(oldScope, name),
    'The old binary can still find the original until confirmed.',
  );
  const published: string[] = [];
  await queue.sendPending({ published: (item) => published.push(item.id) });
  assert.deepEqual(published, [value.id]);
  assert.equal(await localGet(oldScope, name), null);
  await queue.sendPending({ published: (item) => published.push(item.id) });
  assert.deepEqual(published, [value.id, next.id]);
  assert.equal(f.packets.get(value.id)?.signature, packet.signature);
});

await test('session invalidation stops queue admission and publication and preserves the pending original', async (t) => {
  const f = await fixture(t),
    queue = f.create(),
    value = draft(f.peer.accountId, 1);
  await queue.queueText(value);
  const sign = f.own.authority.sign;
  f.own.authority.sign = (proof) => {
    f.invalidate();
    return sign(proof);
  };
  await assert.rejects(queue.sendPending(), /Session changed/u);
  assert.equal(f.packets.size, 0);
  assert.equal((await queue.pendingTexts(value.peer))[0]?.id, value.id);
  const key = f.owner.authority.key;
  f.owner.authority.key = (epoch) => {
    f.invalidate();
    return key(epoch);
  };
  await assert.rejects(queue.queueText(draft(value.peer, 2)), /storage/u);
  assert.equal((await outboxPage(f.scope)).length, 1);
});

await test('a warm public burst reads peer metadata once and publishes sequential texts without repeating key distribution', async (t) => {
  const f = await fixture(t),
    queue = f.create();
  await queue.queueText(draft(f.peer.accountId, 0));
  await queue.sendPending();
  f.operations.length = 0;
  await queue.queueText(draft(f.peer.accountId, 1));
  await queue.queueText(draft(f.peer.accountId, 2));
  await queue.sendPending();
  assert.deepEqual(f.operations, [
    'directory',
    'recovery-peer',
    'matrix-query',
    'matrix-query',
    'publish',
    'matrix-query',
    'matrix-query',
    'publish',
  ]);
});

function publicationConflict(
  message = 'Identity or devices changed. Encrypt again.',
) {
  return new ApiResponseError({
    operation: 'messages/dm-publish',
    status: 409,
    failure: 'http',
    message,
    responseType: 'json',
  });
}
async function advancePeer(peer: Awaited<ReturnType<typeof groupParticipant>>) {
  const identity = await createIdentity(crypto.randomUUID(), 'DM device');
  const ring = freshKeyring(peer.accountId, peer.ring);
  const event = await prepareEvent({
    accountId: peer.accountId,
    previous: peer.authority.events.at(-1)!,
    kind: 'recover',
    signer: 'recovery',
    signing: peer.recovery.signing,
    root: peer.directory.root,
    identities: [peer.identity.public, identity.public],
    ring,
    profile: null,
  });
  const authority = {
    ...peer.authority,
    directory: await eventHash(event),
    epoch: ring.epoch,
    events: [...peer.authority.events, event],
    key: (epoch: number) => aesKey(ring.keys[epoch - 1]!),
  };
  return { event, recovery: await createRecoveryKey(authority) };
}

await test('a definite stale-recipient refusal refreshes its signed history and retries once with the same id', async (t) => {
  const f = await fixture(t),
    queue = f.create(),
    value = draft(f.peer.accountId, 1);
  const changed = await advancePeer(f.peer);
  let attempts = 0;
  f.state.beforePublish = () => {
    if (++attempts !== 1) return Promise.resolve();
    f.peer.authority.events.push(changed.event);
    f.recovery[1] = changed.recovery;
    return Promise.reject(publicationConflict());
  };
  await queue.queueText(value);
  await queue.sendPending();
  assert.equal(attempts, 2);
  assert.equal(f.packets.size, 1);
  assert.equal(f.packets.get(value.id)?.recipientRevision, 2);
  assert.equal(f.operations.filter((op) => op === 'directory').length, 2);
  assert.equal(f.operations.filter((op) => op === 'accepted').length, 0);
});

for (const reason of [
  'Identity or devices changed. Encrypt again.',
  'DM identifier already used.',
]) {
  await test(`a publication refusal without a newer signed recipient is not repeatedly retried: ${reason}`, async (t) => {
    const f = await fixture(t),
      queue = f.create(),
      value = draft(f.peer.accountId, 1);
    let attempts = 0;
    f.state.beforePublish = () => {
      attempts++;
      return Promise.reject(publicationConflict(reason));
    };
    await queue.queueText(value);
    await assert.rejects(queue.sendPending(), ApiResponseError);
    assert.equal(attempts, 1);
    assert.equal((await queue.pendingTexts(value.peer))[0]?.id, value.id);
    assert.equal(f.packets.size, 0);
  });
}

await test('more than sixteen legacy peers drain ahead of newly queued FIFO text across reloads', async (t) => {
  const f = await fixture(t),
    oldScope = `${f.owner.accountId}:${f.owner.deviceId}`;
  const legacy: { id: string; peer: string }[] = [];
  for (let index = 0; index < 17; index++) {
    const peer = await groupParticipant({ deviceName: 'DM device' });
    const id = crypto.randomUUID(),
      text = 'Legacy synthetic draft ' + index;
    const packet = await f.machine.encrypt({
      authority: f.own.authority,
      peerHistory: [peer.directory],
      recovery: [f.recovery[0]!, await createRecoveryKey(peer.authority)],
      id,
      text,
    });
    const sealed = await sealLocal(
      f.owner.authority,
      id,
      JSON.stringify({ packet, text, hash: await digest(canonical(packet)) }),
    );
    await localPut(
      oldScope,
      'dm-send:' + peer.accountId,
      sealed,
      sealed.bytes.length + 512,
    );
    f.packets.set(id, packet);
    legacy.push({ id, peer: peer.accountId });
  }
  legacy.sort((a, b) => (a.peer < b.peer ? -1 : 1));
  const fresh = [draft(f.peer.accountId, 0), draft(f.peer.accountId, 1)];
  const queue = f.create();
  for (const value of fresh) await queue.queueText(value);
  const published: string[] = [];
  const options = {
    published: (item: { id: string }) => published.push(item.id),
  };
  assert.deepEqual(await queue.sendPending(options), { more: true });
  assert.deepEqual(
    published,
    legacy.slice(0, 16).map((item) => item.id),
  );
  assert.deepEqual(await f.create().sendPending(options), { more: true });
  assert.deepEqual(
    published,
    legacy.map((item) => item.id),
  );
  assert.deepEqual(await f.create().sendPending(options), { more: false });
  assert.deepEqual(
    published,
    [...legacy, ...fresh].map((item) => item.id),
  );
  assert.equal(await localGet(oldScope, 'usage'), 0);
  assert.equal(await localGet(f.scope, 'usage'), 0);
});
