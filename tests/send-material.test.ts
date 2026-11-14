import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SendMaterials } from '../src/client/send-material/index.ts';
import { createRecoveryKey } from '../src/client/message-recovery/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';

await test('material requires the exact own authority and is dropped by changed participants or explicit lifecycle reset', async () => {
  const own = await groupParticipant(),
    peer = await groupParticipant();
  const recovery = await createRecoveryKey(peer.authority);
  const data = {
    scope: 'private',
    participants: [
      {
        accountId: peer.accountId,
        directory: peer.head,
        revision: 1,
        recovery,
      },
    ],
  };
  const materials = new SendMaterials();
  const remember = () =>
    materials.remember(own.authority, peer.accountId, data);
  remember();
  assert.deepEqual(materials.reusable(own.authority, peer.accountId), data);
  materials.observed(peer.accountId, peer.head);
  assert.ok(materials.reusable(own.authority, peer.accountId));
  materials.observed(peer.accountId, 'changed');
  assert.equal(materials.reusable(own.authority, peer.accountId), null);
  for (const authority of [
    { ...own.authority, directory: 'changed' },
    { ...own.authority, epoch: 2 },
    {
      ...own.authority,
      session: { ...own.authority.session, csrf: 'changed' },
    },
    {
      ...own.authority,
      session: { ...own.authority.session, deviceId: crypto.randomUUID() },
    },
    {
      ...own.authority,
      session: { ...own.authority.session, accountId: crypto.randomUUID() },
    },
  ]) {
    remember();
    assert.equal(materials.reusable(authority, peer.accountId), null);
  }
  remember();
  const generation = materials.generation;
  materials.invalidate();
  materials.remember(own.authority, peer.accountId, data, generation);
  assert.equal(materials.reusable(own.authority, peer.accountId), null);
});

await test('material is bounded, refreshes least-recently-used order, and returns detached data', async () => {
  const own = await groupParticipant();
  const materials = new SendMaterials();
  const material = { scope: 'group', participants: [] };
  for (let index = 0; index < 32; index++)
    materials.remember(own.authority, String(index), material);
  assert.ok(materials.reusable(own.authority, '0'));
  materials.remember(own.authority, '32', material);
  assert.equal(materials.reusable(own.authority, '1'), null);
  const read = materials.reusable(own.authority, '0');
  assert.ok(read);
  read.scope = 'changed';
  assert.equal(materials.reusable(own.authority, '0')?.scope, 'group');
});
