import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendFixture } from './fixtures/message-send.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../src/client/device-operations/index.ts';
import { aesKey, createIdentity } from '../src/client/device-keys/index.ts';
import { MessageCrypto } from '../src/client/message-crypto/index.ts';
import {
  createRecoveryKey,
  openRecoveryKey,
  openRoomKey,
} from '../src/client/message-recovery/index.ts';
import type { DirectoryEvent } from '../src/shared/devices/index.ts';
import type { groupParticipant } from './fixtures/group-participant.ts';
import { eventHash } from '../src/shared/devices/index.ts';
import type { VaultWorkOptions } from '../src/client/vault-authority/index.ts';

async function linkedDirectory(
  peer: Awaited<ReturnType<typeof groupParticipant>>,
) {
  const added = await createIdentity(
    crypto.randomUUID(),
    'Synthetic additional device',
  );
  return prepareEvent({
    accountId: peer.accountId,
    previous: peer.directory,
    kind: 'link',
    signer: peer.deviceId,
    signing: peer.signing,
    root: peer.directory.root,
    identities: [peer.identity.public, added.public],
    ring: peer.ring,
    linkId: crypto.randomUUID(),
    profile: null,
  });
}

await test('each warm private send verifies the recipient once and preserves its pin before key distribution', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  for (let message = 0; message < 2; message++) {
    const before = f.requests.length;
    const id = await f.queue();
    f.state.beforePublish = () => assert.equal(f.pinnedRevision(), 1);
    f.state.beforeKeys = () => assert.equal(f.pinnedRevision(), 1);
    await f.controller.sendPending({ priority: 'interactive' });
    const requests = f.requests.slice(before);
    assert.deepEqual(
      requests.filter((operation) =>
        [
          'send-preparation',
          'peer-directory',
          'recovery-current',
          'recovery-peer',
          'publish',
        ].includes(operation),
      ),
      ['send-preparation', 'publish'],
    );
    assert.equal(requests.filter((op) => op === 'publish').length, 1);
    assert.equal(f.publications.at(-1)?.id, id);
    assert.equal(f.records.size, 0);
  }
  assert.deepEqual(f.state.preparationOffsets, [0, 1]);
});

await test('an old server is probed once and uses the separate verified private preparation reads', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  f.state.combinedPreparation = false;
  for (let index = 0; index < 2; index++) {
    await f.queue();
    await f.controller.sendPending({ priority: 'interactive' });
  }
  assert.deepEqual(
    f.requests.filter((operation) =>
      [
        'send-preparation',
        'peer-directory',
        'recovery-current',
        'recovery-peer',
        'publish',
      ].includes(operation),
    ),
    [
      'send-preparation',
      'peer-directory',
      'recovery-current',
      'recovery-peer',
      'publish',
      'peer-directory',
      'recovery-current',
      'recovery-peer',
      'publish',
    ],
  );
});

await test('authority changes between preflight and transfer require a fresh pinned batch before opening the SDK', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  const id = await f.queue();
  const next = await linkedDirectory(f.sender),
    head = await eventHash(next),
    peerNext = await linkedDirectory(f.peer);
  f.state.savedPin = () => {
    f.state.savedPin = undefined;
    f.state.authority = {
      ...f.state.authority,
      directory: head,
      events: [f.sender.directory, next],
    };
    f.state.peerEvents = [f.peer.directory, peerNext];
  };
  const pinsAtDistribution: (number | null)[] = [];
  f.state.beforeKeys = () => pinsAtDistribution.push(f.pinnedRevision());
  await f.controller.sendPending({ priority: 'interactive' });
  assert.equal(f.requests.filter((op) => op === 'send-preparation').length, 2);
  assert.equal(f.state.machineOpens, 1);
  assert.equal(f.publications[0]?.id, id);
  assert.equal(f.publications[0]?.recipientRevision, 2);
  assert.ok(pinsAtDistribution.length);
  assert.ok(pinsAtDistribution.every((revision) => revision === 2));
});

await test('a stale recipient revision refreshes once inside the drain and preserves the exact message ID', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  const id = await f.queue();
  const next = await linkedDirectory(f.peer);
  f.state.beforeKeys = () =>
    assert.equal(f.pinnedRevision(), f.state.peerEvents.length);
  f.state.beforePublish = () => {
    f.state.beforePublish = undefined;
    f.state.peerEvents = [f.peer.directory, next];
  };
  await f.controller.sendPending({ priority: 'interactive' });
  assert.equal(f.requests.filter((op) => op === 'publish').length, 2);
  assert.equal(f.publications[0]?.id, id);
  assert.equal(f.publications[0]?.recipientDirectory, await eventHash(next));
  assert.equal(f.pinnedRevision(), 2);
  assert.equal(f.records.size, 0);
});

await test('a retargeted outbox record cannot enter the already pinned batch', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  const id = await f.queue();
  f.state.savedPin = () => {
    f.state.savedPin = undefined;
    f.records.get(`outbox:${id}`)!.peer = crypto.randomUUID();
  };
  await assert.rejects(
    f.controller.sendPending({ priority: 'interactive' }),
    /verified send batch/u,
  );
  assert.equal(f.publications.length, 0);
  assert.equal(
    f.requests.some((op) => op.startsWith('matrix-')),
    false,
  );
  assert.ok(f.records.has(`outbox:${id}`));
});

await test('session loss after pin preservation stops before obtaining transport authority', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  await f.queue();
  const preserve = f.controller.savePins.bind(f.controller);
  let readsAtLogout = -1;
  t.mock.method(f.controller, 'savePins', async (options: VaultWorkOptions) => {
    await preserve(options);
    readsAtLogout = f.state.authorityReads;
    f.controller.setSession(null);
  });
  await assert.rejects(
    f.controller.sendPending({ priority: 'interactive' }),
    /Session/u,
  );
  assert.equal(f.state.authorityReads, readsAtLogout);
  assert.equal(f.state.machineOpens, 0);
  assert.equal(f.publications.length, 0);
});

await test('a lost publication response retries the accepted packet with the same ID without encrypting or publishing twice', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  const id = await f.queue();
  f.state.losePublishResponse = true;
  await assert.rejects(
    f.controller.sendPending({ priority: 'interactive' }),
    /Could not connect/,
  );
  const packet = f.records.get(`outbox:${id}`)!.packet;
  assert.ok(packet);
  assert.equal(f.publications.length, 1);
  assert.equal(f.state.closedMachines, 1);
  const before = f.requests.length;
  await f.controller.sendPending({ priority: 'interactive' });
  assert.equal(f.publications.length, 1);
  assert.equal(f.records.size, 0);
  assert.ok(f.requests.slice(before).includes('accepted'));
  assert.ok(!f.requests.slice(before).includes('publish'));
  assert.deepEqual(
    f.state.events.map((value) => ({ ...value })),
    [{ id, peer: f.peer.accountId }],
  );
  assert.equal(f.state.closedMachines, 2);
});

await test('a rejected publication retains encrypted drafts and closes its SDK machine before a successful retry', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  const id = await f.queue();
  const original = f.records.get(`outbox:${id}`)!.draft;
  f.state.failPublish = true;
  await assert.rejects(
    f.controller.sendPending({ priority: 'interactive' }),
    /HTTP 503/,
  );
  assert.equal(f.state.closedMachines, 1);
  assert.deepEqual(f.records.get(`outbox:${id}`)!.draft, original);
  assert.equal(f.state.events.length, 0);
  f.state.failPublish = false;
  await f.controller.sendPending({ priority: 'interactive' });
  assert.equal(f.publications[0]!.id, id);
  assert.equal(f.state.closedMachines, 2);
});

await test('discarding a possibly accepted message confirms remote deletion before removing its durable draft', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  const id = await f.queue();
  f.state.losePublishResponse = true;
  await assert.rejects(f.controller.sendPending({ priority: 'interactive' }));
  const before = f.requests.length;
  f.state.expectedPriority = undefined;
  await f.controller.discard(id);
  assert.deepEqual(f.requests.slice(before), ['accepted', 'delete']);
  assert.ok(!f.records.has(`outbox:${id}`));
});

await test('the foreground publisher yields after a confirmed message and re-verifies its durable suffix on the next turn', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  const first = await f.queue(),
    second = await f.queue(),
    third = await f.queue();
  await f.controller.sendPending({ priority: 'interactive' }, () => true);
  assert.deepEqual(
    f.publications.map((packet) => packet.id),
    [first],
  );
  assert.deepEqual(
    [...f.records.keys()],
    [`outbox:${second}`, `outbox:${third}`],
  );
  assert.equal(f.state.closedMachines, 1);
  await f.controller.sendPending({ priority: 'interactive' });
  assert.deepEqual(
    f.publications.map((packet) => packet.id),
    [first, second, third],
  );
  assert.equal(f.requests.filter((op) => op === 'send-preparation').length, 2);
  assert.equal(f.records.size, 0);
});

await test('an unchanged peer reuses verified material across drains and suspension clears it', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  f.state.retainMachine = true;
  await f.queue();
  await f.controller.sendPending({ priority: 'interactive' });
  const before = f.requests.length;
  const id = await f.queue();
  await f.controller.sendPending({ priority: 'interactive' });
  assert.deepEqual(f.requests.slice(before), ['publish']);
  assert.equal(f.publications.at(-1)?.id, id);
  f.controller.pause('account');
  const reset = f.requests.length;
  await f.queue();
  await f.controller.sendPending({ priority: 'interactive' });
  assert.ok(f.requests.slice(reset).includes('send-preparation'));
  assert.ok(f.requests.slice(reset).includes('matrix-query'));
});

await test('warm own-directory reuse reaches publish without a read and full preparation reacquires fresh authority', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  f.state.retainMachine = true;
  f.state.reuseOwnDirectory = true;
  f.state.beforeKeys = () => assert.equal(f.state.lastAuthorityReused, false);
  await f.queue();
  await f.controller.sendPending({ priority: 'interactive' });
  assert.ok(
    f.state.ownDirectoryReads > 0,
    'The first preparation must be fresh.',
  );
  const beforeReads = f.state.ownDirectoryReads;
  const beforeRequests = f.requests.length;
  const id = await f.queue();
  await f.controller.sendPending({ priority: 'interactive' });
  assert.equal(f.state.ownDirectoryReads, beforeReads);
  assert.deepEqual(f.requests.slice(beforeRequests), ['publish']);
  assert.equal(f.publications.at(-1)?.id, id);
  f.state.retainMachine = false;
  const beforeNewMachine = f.state.ownDirectoryReads;
  const next = await f.queue();
  await f.controller.sendPending({ priority: 'interactive' });
  assert.ok(f.state.ownDirectoryReads > beforeNewMachine);
  assert.equal(f.publications.at(-1)?.id, next);
  f.controller.pause('account');
  await f.queue();
  await f.controller.sendPending({ priority: 'interactive' });
  assert.ok(f.state.ownDirectoryReads > beforeReads);
});

await test('two stale refusals leave the same draft durable and never loop', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  f.state.retainMachine = true;
  f.state.stalePublishCount = 2;
  const id = await f.queue();
  await assert.rejects(
    f.controller.sendPending({ priority: 'interactive' }),
    /Synthetic stale material/u,
  );
  assert.equal(f.requests.filter((op) => op === 'publish').length, 2);
  assert.equal(f.requests.filter((op) => op === 'send-preparation').length, 2);
  assert.ok(f.records.has(`outbox:${id}`));
  assert.equal(f.publications.length, 0);
});

for (const status of [403, 409, 429, 503]) {
  await test(`an unrelated HTTP ${status} is surfaced once and keeps verified material for the next draft`, async (t) => {
    const f = await sendFixture();
    t.after(f.close);
    f.state.retainMachine = true;
    await f.queue();
    await f.controller.sendPending({ priority: 'interactive' });
    const before = f.requests.length;
    await f.queue();
    f.state.failPublish = true;
    f.state.publishFailureStatus = status;
    await assert.rejects(
      f.controller.sendPending({ priority: 'interactive' }),
      /Synthetic publication failure/u,
    );
    assert.deepEqual(f.requests.slice(before), ['publish']);
    f.state.failPublish = false;
    await f.controller.sendPending({ priority: 'interactive' });
    const next = f.requests.length;
    await f.queue();
    await f.controller.sendPending({ priority: 'interactive' });
    assert.deepEqual(f.requests.slice(next), ['publish']);
  });
}

async function rotateAfterLink(
  participant: Awaited<ReturnType<typeof groupParticipant>>,
  previous: DirectoryEvent,
) {
  const ring = freshKeyring(participant.accountId, participant.ring);
  const event = await prepareEvent({
    accountId: participant.accountId,
    previous,
    kind: 'revoke',
    signer: participant.deviceId,
    signing: participant.signing,
    root: previous.root,
    identities: [participant.identity.public],
    ring,
    profile: null,
  });
  return {
    event,
    authority: {
      ...participant.authority,
      directory: await eventHash(event),
      epoch: ring.epoch,
      events: [participant.directory, previous, event],
      key: (epoch: number) => aesKey(ring.keys[epoch - 1]!),
    },
  };
}

for (const change of [
  'peer-added',
  'peer-revoked',
  'own-recovery-rotated',
] as const) {
  await test(`verified material refreshes after ${change} and preserves the next message ID`, async (t) => {
    const f = await sendFixture();
    t.after(f.close);
    f.state.retainMachine = true;
    const linked = await linkedDirectory(
      change === 'own-recovery-rotated' ? f.sender : f.peer,
    );
    if (change === 'peer-revoked') f.state.peerEvents.push(linked);
    if (change === 'own-recovery-rotated')
      f.state.authority = {
        ...f.sender.authority,
        directory: await eventHash(linked),
        events: [f.sender.directory, linked],
      };
    await f.queue();
    await f.controller.sendPending({ priority: 'interactive' });
    let peerAuthority = f.peer.authority;
    if (change === 'peer-added') f.state.peerEvents.push(linked);
    else {
      const rotated = await rotateAfterLink(
        change === 'peer-revoked' ? f.peer : f.sender,
        linked,
      );
      if (change === 'peer-revoked') {
        f.state.peerEvents.push(rotated.event);
        peerAuthority = rotated.authority;
        f.state.peerRecovery = await createRecoveryKey(peerAuthority);
      } else {
        f.state.authority = rotated.authority;
        f.state.recovery = await createRecoveryKey(rotated.authority);
      }
    }
    const before = f.requests.length;
    const id = await f.queue();
    await f.controller.sendPending({ priority: 'interactive' });
    const calls = f.requests.slice(before);
    assert.equal(
      calls[0],
      change === 'own-recovery-rotated' ? 'send-preparation' : 'publish',
    );
    assert.equal(
      calls.filter((op) => op === 'publish').length,
      change === 'own-recovery-rotated' ? 1 : 2,
    );
    assert.equal(calls.filter((op) => op === 'send-preparation').length, 1);
    const packet = f.publications.at(-1)!;
    assert.equal(packet.id, id);
    assert.equal(
      packet.recipientDirectory,
      await eventHash(f.state.peerEvents.at(-1)!),
    );
    assert.equal(f.publications.filter((p) => p.id === id).length, 1);
    assert.equal(f.records.size, 0);
    // A new or remaining device can recover without an old SDK session.
    const reader = await MessageCrypto.create({
      accountId: f.peer.accountId,
      deviceId:
        change === 'peer-added'
          ? linked.devices.find((d) => d.id !== f.peer.deviceId)!.id
          : f.peer.deviceId,
      store: null,
      transport: () =>
        Promise.reject(new Error('Recovery needs no transport.')),
    });
    t.after(() => reader.close());
    const secret = await openRecoveryKey(f.state.peerRecovery, peerAuthority);
    try {
      const archive = packet.archives.find(
        (a) => a.accountId === f.peer.accountId,
      )!;
      assert.equal(archive.keyId, f.state.peerRecovery.id);
      assert.equal(
        await reader.decrypt({
          packet,
          senderEvent: f.state.authority.events.at(-1)!,
          exported: openRoomKey(secret, archive),
        }),
        'Synthetic sender regression text',
      );
    } finally {
      secret.free();
    }
  });
}

await test('a stale key envelope refreshes the directory before retrying the same draft', async (t) => {
  const f = await sendFixture();
  t.after(f.close);
  const next = await linkedDirectory(f.peer);
  f.state.staleKeysCount = 1;
  f.state.beforeKeys = () => {
    f.state.beforeKeys = undefined;
    f.state.peerEvents.push(next);
  };
  const id = await f.queue();
  await f.controller.sendPending({ priority: 'interactive' });
  assert.equal(f.requests.filter((op) => op === 'send-preparation').length, 2);
  assert.equal(f.publications.length, 1);
  assert.equal(f.publications[0]?.id, id);
  assert.equal(f.publications[0]?.recipientDirectory, await eventHash(next));
});
