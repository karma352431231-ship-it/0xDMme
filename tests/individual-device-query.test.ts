import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { initAsync } from '@matrix-org/matrix-sdk-crypto-wasm';
import { MessageCrypto } from '../src/client/message-crypto/index.ts';
import type { MessageTransport } from '../src/client/message-crypto/index.ts';
import { createRecoveryKey } from '../src/client/message-recovery/index.ts';
import { aesKey, createIdentity } from '../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../src/client/device-operations/index.ts';
import type { VaultAuthority } from '../src/client/vault-authority/index.ts';
import { eventHash, sign } from '../src/shared/devices/index.ts';
import { matrixUser } from '../src/shared/messages/index.ts';
import { object } from '../src/shared/account/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';
import { messageTransport } from './fixtures/message-transport.ts';

await initAsync();

async function fixture(t: TestContext) {
  const own = await groupParticipant(),
    peer = await groupParticipant();
  const relay = messageTransport();
  const state = { intercept: null as MessageTransport | null };
  const open = async (
    authority: VaultAuthority,
    transport: MessageTransport,
  ) => {
    const machine = await MessageCrypto.create({
      accountId: authority.session.accountId,
      deviceId: authority.session.deviceId,
      store: null,
      transport,
    });
    t.after(() => machine.close());
    await machine.prepare(authority);
    return machine;
  };
  const sender = await open(own.authority, (op, data) =>
    (state.intercept ?? relay.transport)(op, data),
  );
  await open(peer.authority, relay.transport);
  relay.queries.length = 0;
  const send = async (authority = peer.authority, id = crypto.randomUUID()) =>
    sender.encrypt({
      authority: own.authority,
      peerHistory: authority.events,
      recovery: await Promise.all([
        createRecoveryKey(own.authority),
        createRecoveryKey(authority),
      ]),
      id,
      text: 'Synthetic individual message',
    });
  return { own, peer, relay, state, open, send };
}

await test('each individual send refreshes both authenticated users in one SDK query, including uninitialized devices', async (t) => {
  const f = await fixture(t);
  const expected = [f.own.accountId, f.peer.accountId].map(matrixUser).sort();
  for (let n = 0; n < 2; n++) {
    const packet = await f.send();
    assert.equal(packet.archives.length, 2);
    assert.deepEqual(f.relay.queries.at(-1)?.toSorted(), expected);
    assert.equal(f.relay.queries.length, n + 1);
  }
  f.relay.bindings.delete(matrixUser(f.peer.accountId));
  const packet = await f.send();
  assert.ok(
    packet.archives.some((archive) => archive.accountId === f.peer.accountId),
    'No published SDK device still retains its authorized recovery archive',
  );
  assert.equal(f.relay.queries.length, 3);
});

await test('combined query refusal stops before session sharing; retry uses the same ID and refreshes again', async (t) => {
  const f = await fixture(t),
    operations: string[] = [];
  f.state.intercept = (op, data) => {
    operations.push(op);
    if (op === 'matrix-query')
      return Promise.reject(new Error('Synthetic query refusal'));
    return f.relay.transport(op, data);
  };
  const id = crypto.randomUUID();
  await assert.rejects(
    f.send(f.peer.authority, id),
    /Synthetic query refusal/u,
  );
  assert.deepEqual(operations, ['matrix-query']);
  f.state.intercept = null;
  assert.equal((await f.send(f.peer.authority, id)).id, id);
  assert.equal(f.relay.queries.length, 1);
});

for (const participant of ['own', 'peer'] as const) {
  await test(`combined query rejects a substituted ${participant} public device key`, async (t) => {
    const f = await fixture(t);
    f.state.intercept = async (op, data) => {
      const result = structuredClone(object(await f.relay.transport(op, data)));
      if (op === 'matrix-query') {
        const devices = object(object(result['response'])['device_keys']);
        const device = object(devices[matrixUser(f[participant].accountId)]);
        device[f[participant].deviceId] = { replaced: true };
      }
      return result;
    };
    await assert.rejects(f.send(), /replaced a Matrix key/u);
    f.state.intercept = null;
    await f.send();
  });
}

await test('device addition, removal and rotation use fresh histories and reject an old revoked binding', async (t) => {
  const f = await fixture(t),
    peer = f.peer;
  await f.send();
  const identity = await createIdentity(
    crypto.randomUUID(),
    'Synthetic added device',
  );
  const linked = await prepareEvent({
    accountId: peer.accountId,
    previous: peer.directory,
    kind: 'link',
    signer: peer.deviceId,
    signing: peer.signing,
    root: peer.recovery.root,
    identities: [peer.identity.public, identity.public],
    ring: peer.ring,
    linkId: crypto.randomUUID(),
    profile: null,
  });
  const linkedAuthority: VaultAuthority = {
    ...peer.authority,
    events: [peer.directory, linked],
    directory: await eventHash(linked),
  };
  await f.send(linkedAuthority);
  const ring = freshKeyring(peer.accountId, peer.ring);
  const revoked = await prepareEvent({
    accountId: peer.accountId,
    previous: linked,
    kind: 'revoke',
    signer: identity.public.id,
    signing: identity.signing,
    root: peer.recovery.root,
    identities: [identity.public],
    ring,
    profile: null,
  });
  const rotated: VaultAuthority = {
    ...peer.authority,
    events: [...linkedAuthority.events, revoked],
    session: { ...peer.authority.session, deviceId: identity.public.id },
    directory: await eventHash(revoked),
    epoch: ring.epoch,
    key: (epoch) => aesKey(ring.keys[epoch - 1]!),
    sign: (proof) => sign(identity.signing, proof),
  };
  await assert.rejects(f.send(rotated), /revoked device/u);
  await f.open(rotated, f.relay.transport);
  const before = f.relay.queries.length;
  await f.send(rotated);
  assert.equal(f.relay.queries.length, before + 1);
});
