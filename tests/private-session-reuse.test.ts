import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { initAsync, OlmMachine } from '@matrix-org/matrix-sdk-crypto-wasm';
import type { RoomId } from '@matrix-org/matrix-sdk-crypto-wasm';
import {
  MessageCrypto,
  PrivateAudiences,
} from '../src/client/message-crypto/index.ts';
import { createRecoveryKey } from '../src/client/message-recovery/index.ts';
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
