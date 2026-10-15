import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dmComposerGate,
  dmStateLabel,
} from '../src/client/communities/dm-chat.ts';
import { openDmConversation } from '../src/client/communities/dm-opening.ts';
import type { SocialRelation } from '../src/shared/social-dm/index.ts';
import { deferred } from './fixtures/deferred.ts';

const peer = { id: crypto.randomUUID(), handle: 'ana', avatar: null };
function relation(change: Partial<SocialRelation>): SocialRelation {
  return {
    peer,
    requester: crypto.randomUUID(),
    state: 'approved',
    revision: 1,
    blocked: false,
    blockRevision: 0,
    canSend: true,
    ...change,
  };
}

await test('public DM composer never asks for acceptance; blocks and local copies remain closed', () => {
  for (const state of ['approved', 'pending', 'rejected'] as const) {
    const value = relation({ state });
    assert.equal(dmComposerGate({ local: false, value }), null);
    assert.equal(dmStateLabel(value, false), 'Message via @');
  }
  for (const value of [null, relation({ canSend: false })])
    assert.equal(dmComposerGate({ local: false, value }), 'DM unavailable.');
  assert.equal(dmStateLabel(relation({ blocked: true }), false), 'Blocked');
  assert.equal(dmStateLabel(relation({}), true), 'Copy on this device');
  assert.equal(
    dmComposerGate({ local: true, value: relation({}) }),
    'Local copy. Connect to sync and send messages.',
  );
});

await test('new/legacy public conversations open directly; healthy refreshes and blocks do not write', async () => {
  for (const value of [
    null,
    relation({ state: 'pending' }),
    relation({ state: 'rejected' }),
    relation({ state: 'none' }),
  ]) {
    const opened = relation({});
    const calls: unknown[] = [];
    const source = {
      state: () => Promise.resolve(value),
      request: (operation: string, data: Record<string, unknown>) => {
        calls.push({ operation, data });
        return Promise.resolve(opened);
      },
    };
    assert.deepEqual(
      await openDmConversation(source, peer.id, () => true),
      opened,
    );
    assert.deepEqual(calls, [{ operation: 'open', data: { peer: peer.id } }]);
  }
  for (const value of [
    relation({}),
    relation({ blocked: true, canSend: false }),
    relation({ state: 'pending', canSend: false }),
  ]) {
    const source = {
      state: () => Promise.resolve(value),
      request: () => Promise.reject(new Error('Must not write')),
    };
    assert.equal(await openDmConversation(source, peer.id, () => true), value);
  }
});

await test('failed public DM opening is reported without creating local permission', async () => {
  await assert.rejects(
    openDmConversation(
      {
        state: () => Promise.resolve(null),
        request: () => Promise.reject(new Error('DM unavailable.')),
      },
      peer.id,
      () => true,
    ),
    /DM unavailable/,
  );
});

await test('leaving a DM while its state loads cannot create a conversation in the background', async () => {
  const state = deferred<SocialRelation | null>();
  let usable = true;
  const opening = openDmConversation(
    {
      state: () => state.promise,
      request: () => {
        assert.fail('A stale view cannot open a DM');
      },
    },
    peer.id,
    () => usable,
  );
  usable = false;
  state.resolve(null);
  await assert.rejects(opening, { name: 'AbortError' });
});
