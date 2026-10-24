import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendFixture } from './fixtures/message-send.ts';
import { prepareEvent } from '../src/client/device-operations/index.ts';
import { createIdentity } from '../src/client/device-keys/index.ts';
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
    assert.equal(requests.filter((op) => op === 'peer-directory').length, 1);
    assert.equal(requests.filter((op) => op === 'publish').length, 1);
    assert.equal(f.publications.at(-1)?.id, id);
    assert.equal(f.records.size, 0);
  }
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
  assert.equal(f.requests.filter((op) => op === 'peer-directory').length, 2);
  assert.equal(f.state.machineOpens, 1);
  assert.equal(f.publications[0]?.id, id);
  assert.equal(f.publications[0]?.recipientRevision, 2);
  assert.ok(pinsAtDistribution.length);
  assert.ok(pinsAtDistribution.every((revision) => revision === 2));
});

await test('a remote recipient revision change still rejects publication and retains the exact draft for verified retry', async (t) => {
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
  await assert.rejects(
    f.controller.sendPending({ priority: 'interactive' }),
    /Devices changed/u,
  );
  assert.equal(f.publications.length, 0);
  assert.ok(f.records.has(`outbox:${id}`));
  await f.controller.sendPending({ priority: 'interactive' });
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
