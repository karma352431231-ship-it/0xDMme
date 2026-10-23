import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { MessageCrypto } from '../src/client/message-crypto/index.ts';
import {
  createRecoveryKey,
  ensureMessageRecovery,
  openRecoveryKey,
} from '../src/client/message-recovery/index.ts';
import { aesKey, createIdentity } from '../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../src/client/device-operations/index.ts';
import type { Keyring } from '../src/client/device-keys/index.ts';
import { eventHash } from '../src/shared/devices/index.ts';
import type { DirectoryEvent } from '../src/shared/devices/index.ts';
import type { GroupEvent } from '../src/shared/groups/index.ts';
import type { VaultAuthority } from '../src/client/vault-authority/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';
import { messageTransport } from './fixtures/message-transport.ts';

type Participant = Awaited<ReturnType<typeof groupParticipant>>;
async function authorityAt(input: {
  participant: Participant;
  events: DirectoryEvent[];
  ring: Keyring;
}): Promise<VaultAuthority> {
  const current = input.events.at(-1);
  assert.ok(current);
  return {
    ...input.participant.authority,
    events: input.events,
    directory: await eventHash(current),
    epoch: input.ring.epoch,
    key: (epoch) => aesKey(input.ring.keys[epoch - 1] ?? ''),
  };
}
async function epochs() {
  const sender = await groupParticipant(),
    peer = await groupParticipant();
  const otherDevice = await createIdentity(
    crypto.randomUUID(),
    'Synthetic secondary device',
  );
  const own = await createRecoveryKey(sender.authority);
  const previous = await createRecoveryKey(peer.authority);
  const linked = await prepareEvent({
    accountId: peer.accountId,
    previous: peer.directory,
    kind: 'link',
    signer: peer.deviceId,
    signing: peer.signing,
    root: peer.recovery.root,
    identities: [peer.identity.public, otherDevice.public],
    ring: peer.ring,
    linkId: crypto.randomUUID(),
    profile: null,
  });
  const ring = freshKeyring(peer.accountId, peer.ring);
  const revoked = await prepareEvent({
    accountId: peer.accountId,
    previous: linked,
    kind: 'revoke',
    signer: peer.deviceId,
    signing: peer.signing,
    root: peer.recovery.root,
    identities: [peer.identity.public],
    ring,
    profile: null,
  });
  const linkedAuthority = await authorityAt({
    participant: peer,
    events: [peer.directory, linked],
    ring: peer.ring,
  });
  const current = await authorityAt({
    participant: peer,
    events: [peer.directory, linked, revoked],
    ring,
  });
  return { sender, peer, own, previous, linkedAuthority, current };
}
async function machine(authority: VaultAuthority, t: TestContext) {
  const relay = messageTransport();
  const value = await MessageCrypto.create({
    accountId: authority.session.accountId,
    deviceId: authority.session.deviceId,
    store: null,
    transport: relay.transport,
  });
  t.after(() => value.close());
  return { value, transport: relay.transport };
}
function period(sender: Participant, current: VaultAuthority): GroupEvent {
  const peer = current.session.accountId;
  return {
    version: 1,
    groupId: crypto.randomUUID(),
    revision: 2,
    epoch: 2,
    previous: 'a'.repeat(64),
    kind: 'join',
    actor: peer,
    deviceId: current.session.deviceId,
    directory: current.directory,
    authorityRevision: current.events.length,
    target: peer,
    owner: sender.accountId,
    members: [sender.accountId, peer].sort().map((accountId) => ({
      accountId,
      role: accountId === sender.accountId ? 'owner' : 'member',
      joined: accountId === sender.accountId ? 1 : 2,
    })),
    consent: null,
    signature: 'A'.repeat(86) + '==',
  };
}

await test('new direct messages require an authenticated recovery key for both participants', async (t) => {
  const sender = await groupParticipant(),
    peer = await groupParticipant();
  const recovery = await Promise.all(
    [sender, peer].map((p) => createRecoveryKey(p.authority)),
  );
  const { value } = await machine(sender.authority, t);
  for (const index of [0, 1]) {
    await t.test(index === 0 ? 'sender key' : 'recipient key', async () => {
      const keys = [...recovery],
        selected = keys[index],
        other = keys[1 - index];
      assert.ok(selected && other);
      keys[index] = { ...selected, publicKey: other.publicKey };
      await assert.rejects(
        value.encrypt({
          authority: sender.authority,
          peerHistory: [peer.directory],
          recovery: keys,
          id: crypto.randomUUID(),
          text: 'Synthetic authorization boundary',
        }),
      );
    });
  }
});

await test('outbound recovery follows the current epoch while historical decryption stays available', async (t) => {
  const input = await epochs();
  const { sender, peer, own, previous, linkedAuthority, current } = input;
  const outbound = await machine(sender.authority, t);
  await t.test(
    'an earlier revision of the same epoch remains valid after linking',
    async () => {
      assert.equal(
        (
          await ensureMessageRecovery(linkedAuthority, () =>
            Promise.resolve(previous),
          )
        ).id,
        previous.id,
      );
    },
  );
  await t.test('historical recovery still opens after rotation', async () => {
    const secret = await openRecoveryKey(previous, current);
    secret.free();
  });
  // A directory's capsule is prepared once per session, so the rejection
  // runs first; the failure is not remembered.
  await t.test(
    'own recovery preparation rejects a previous epoch',
    async () => {
      await assert.rejects(
        ensureMessageRecovery(current, () => Promise.resolve(previous)),
      );
    },
  );
  await t.test('current recovery remains usable', async () => {
    const fresh = await createRecoveryKey(current);
    assert.equal(
      (await ensureMessageRecovery(current, () => Promise.resolve(fresh))).id,
      fresh.id,
    );
  });
  await t.test(
    'direct recipient rejects a previous epoch with a still-active signer',
    async () => {
      await assert.rejects(
        outbound.value.encrypt({
          authority: sender.authority,
          peerHistory: current.events,
          recovery: [own, previous],
          id: crypto.randomUUID(),
          text: 'Synthetic current recipient',
        }),
      );
    },
  );
  await t.test(
    'direct sender rejects its own previous epoch',
    async (context) => {
      const ownMachine = await machine(current, context);
      await assert.rejects(
        ownMachine.value.encrypt({
          authority: current,
          peerHistory: [sender.directory],
          recovery: [previous, own],
          id: crypto.randomUUID(),
          text: 'Synthetic current sender',
        }),
      );
    },
  );
  await t.test(
    'group recipient rejects a previous epoch with a still-active signer',
    async () => {
      const state = period(sender, current);
      await assert.rejects(
        outbound.value.encryptGroup({
          authority: sender.authority,
          state,
          histories: state.members.map((member) =>
            member.accountId === peer.accountId
              ? current.events
              : [sender.directory],
          ),
          recovery: state.members.map((member) =>
            member.accountId === peer.accountId ? previous : own,
          ),
          transport: outbound.transport,
          id: crypto.randomUUID(),
          text: 'Synthetic current group recipient',
        }),
      );
    },
  );
});
