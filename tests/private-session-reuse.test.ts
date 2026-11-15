import assert from 'node:assert/strict';
import { FreshSendRequired } from '../src/client/send-material/index.ts';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import {
  initAsync,
  KeysClaimRequest,
  OlmMachine,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import type {
  RoomId,
  UserId,
  EncryptionSettings,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import {
  MessageCrypto,
  PrivateAudiences,
} from '../src/client/message-crypto/index.ts';
import {
  createRecoveryKey,
  openRecoveryKey,
  openRoomKey,
} from '../src/client/message-recovery/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';
import { messageTransport } from './fixtures/message-transport.ts';

// Real SDK with synthetic identities and transport. Node has no persisted SDK
// store, so every wrapper is a new identity; reuse across a reopened store of
// the same identity is covered by the audience rules below and needs browser
// acceptance.
await initAsync();

function countRotations(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(
    OlmMachine.prototype,
    'invalidateGroupSession',
  )?.value as OlmMachine['invalidateGroupSession'];
  let rotations = 0;
  t.mock.method(
    OlmMachine.prototype,
    'invalidateGroupSession',
    function (this: OlmMachine, room: RoomId) {
      rotations++;
      return original.call(this, room);
    },
  );
  return () => rotations;
}
async function open(
  t: TestContext,
  participant: Awaited<ReturnType<typeof groupParticipant>>,
  audiences?: PrivateAudiences,
) {
  const machine = await MessageCrypto.create({
    accountId: participant.accountId,
    deviceId: participant.deviceId,
    store: null,
    transport: messageTransport().transport,
    ...(audiences ? { audiences } : {}),
  });
  t.after(() => machine.close());
  return machine;
}
async function sender(t: TestContext, audiences?: PrivateAudiences) {
  const own = await groupParticipant();
  return { own, machine: await open(t, own, audiences) };
}
async function send(
  machine: MessageCrypto,
  own: Awaited<ReturnType<typeof groupParticipant>>,
  peer: Awaited<ReturnType<typeof groupParticipant>>,
) {
  const recovery = await Promise.all(
    [own, peer].map((p) => createRecoveryKey(p.authority)),
  );
  await machine.encrypt({
    authority: own.authority,
    peerHistory: [peer.directory],
    recovery,
    id: crypto.randomUUID(),
    text: 'synthetic message',
  });
}

await test('an unchanged audience shares once; a changed peer directory rotates even when remembered', async (t) => {
  const rotations = countRotations(t),
    audiences = new PrivateAudiences(),
    { own, machine } = await sender(t, audiences),
    peer = await groupParticipant();
  await send(machine, own, peer);
  await send(machine, own, peer);
  assert.equal(rotations(), 1, 'the second send keeps the session');
  // The same account with another device directory (added, revoked or reset).
  const changed = await groupParticipant({ accountId: peer.accountId });
  await send(machine, own, changed);
  assert.equal(rotations(), 2, 'a changed audience rotates');
  await send(machine, own, peer);
  assert.equal(rotations(), 3, 'returning to an older audience rotates too');
});

await test('another SDK identity never reuses an audience remembered by a different one', async (t) => {
  const rotations = countRotations(t),
    audiences = new PrivateAudiences(),
    { own, machine } = await sender(t, audiences),
    peer = await groupParticipant();
  await send(machine, own, peer);
  const reset = await open(t, own, audiences);
  await send(reset, own, peer);
  assert.equal(rotations(), 2, 'a new identity rotates its first send');
});

await test('remembered audiences match only their identity, room and audience, and clear empties them', () => {
  const audiences = new PrivateAudiences();
  audiences.remember('identity', 'room', 'audience');
  assert.equal(audiences.matches('identity', 'room', 'audience'), true);
  for (const [identity, room, audience] of [
    ['other', 'room', 'audience'],
    ['identity', 'other', 'audience'],
    ['identity', 'room', 'other'],
  ] as const)
    assert.equal(audiences.matches(identity, room, audience), false);
  audiences.clear();
  assert.equal(audiences.matches('identity', 'room', 'audience'), false);
  for (let n = 0; n <= 1024; n++) audiences.remember('identity', `r${n}`, 'a');
  assert.equal(audiences.matches('identity', 'r0', 'a'), false, 'bounded');
  assert.equal(audiences.matches('identity', 'r1024', 'a'), true);
});

await test('a device registered after Matrix trust decrypts the reuse-path packet through recovery', async (t) => {
  const own = await groupParticipant(),
    peer = await groupParticipant(),
    server = messageTransport();
  const sharedTo: string[] = [];
  const sender = await MessageCrypto.create({
    accountId: own.accountId,
    deviceId: own.deviceId,
    store: null,
    audiences: new PrivateAudiences(),
    transport: (operation, payload) => {
      if (operation === 'matrix-send') sharedTo.push(JSON.stringify(payload));
      return server.transport(operation, payload);
    },
  });
  t.after(() => sender.close());
  const recovery = await Promise.all(
    [own, peer].map((p) => createRecoveryKey(p.authority)),
  );
  const encrypt = (reused = false) =>
    sender.encrypt({
      authority: own.authority,
      peerHistory: [peer.directory],
      recovery,
      id: crypto.randomUUID(),
      text: 'Synthetic late registration',
      reused,
    });
  await encrypt();
  const reader = await MessageCrypto.create({
    accountId: peer.accountId,
    deviceId: peer.deviceId,
    store: null,
    transport: server.transport,
  });
  t.after(() => reader.close());
  await reader.prepare(peer.authority);
  const before = server.queries.length;
  const packet = await encrypt(true);
  assert.equal(server.queries.length, before);
  assert.ok(sharedTo.every((value) => !value.includes(peer.deviceId)));
  const archive = packet.archives.find((a) => a.accountId === peer.accountId);
  assert.ok(archive);
  const secret = await openRecoveryKey(recovery[1]!, peer.authority);
  try {
    assert.equal(
      await reader.decrypt({
        packet,
        senderEvent: own.directory,
        exported: openRoomKey(secret, archive),
      }),
      'Synthetic late registration',
    );
  } finally {
    secret.free();
  }
});

for (const boundary of ['message-count', 'age', 'missing-session'] as const) {
  await test(`SDK ${boundary} on a reuse path stops before any new key reaches transport`, async (t) => {
    const original = Object.getOwnPropertyDescriptor(
      OlmMachine.prototype,
      'shareRoomKey',
    )?.value as OlmMachine['shareRoomKey'];
    t.mock.method(
      OlmMachine.prototype,
      'shareRoomKey',
      function (
        this: OlmMachine,
        room: RoomId,
        users: UserId[],
        settings: EncryptionSettings,
      ) {
        if (boundary === 'message-count') settings.rotationPeriodMessages = 1n;
        return original.call(this, room, users, settings);
      },
    );
    const own = await groupParticipant(),
      peer = await groupParticipant(),
      server = messageTransport();
    const operations: string[] = [];
    const reader = await MessageCrypto.create({
      accountId: peer.accountId,
      deviceId: peer.deviceId,
      store: null,
      transport: server.transport,
    });
    t.after(() => reader.close());
    await reader.prepare(peer.authority);
    const sender = await MessageCrypto.create({
      accountId: own.accountId,
      deviceId: own.deviceId,
      store: null,
      audiences: new PrivateAudiences(),
      transport: (op, payload) => {
        operations.push(op);
        return server.transport(op, payload);
      },
    });
    t.after(() => sender.close());
    const recovery = await Promise.all(
      [own, peer].map((p) => createRecoveryKey(p.authority)),
    );
    const input = {
      authority: own.authority,
      peerHistory: [peer.directory],
      recovery,
      id: crypto.randomUUID(),
      text: 'Synthetic rotation',
    };
    await sender.encrypt(input);
    if (boundary === 'age') {
      // Keep the real SDK's rotation interval; advance its WASM wall clock
      // beyond the default week instead of lowering its protected interval.
      const expired = Date.now() + 8 * 24 * 60 * 60 * 1000;
      t.mock.method(Date, 'now', () => expired);
    }
    const before = operations.length;
    const id = crypto.randomUUID();
    if (boundary === 'missing-session') {
      // The SDK's public request type models a newly required Olm claim. The
      // boundary must reject it before dispatch, independently of key sharing.
      const claim = new KeysClaimRequest('synthetic-missing-session', '{}');
      const originalClaim = Object.getOwnPropertyDescriptor(
        OlmMachine.prototype,
        'getMissingSessions',
      )?.value as OlmMachine['getMissingSessions'];
      let missing = true;
      t.mock.method(
        OlmMachine.prototype,
        'getMissingSessions',
        function (this: OlmMachine, users: UserId[]) {
          if (!missing) return originalClaim.call(this, users);
          missing = false;
          return Promise.resolve(claim);
        },
      );
    }
    await assert.rejects(
      sender.encrypt({ ...input, id, reused: true }),
      FreshSendRequired,
    );
    assert.deepEqual(operations.slice(before), []);
    await sender.encrypt({ ...input, id });
    const refreshed = operations.slice(before);
    assert.ok(refreshed.includes('matrix-query'));
    if (boundary !== 'missing-session')
      assert.ok(
        refreshed.indexOf('matrix-query') < refreshed.indexOf('matrix-send'),
      );
  });
}
