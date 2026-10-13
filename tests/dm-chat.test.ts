import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dmRequestState,
  dmStateLabel,
} from '../src/client/communities/dm-chat.ts';
import type { SocialRelation } from '../src/shared/social-dm/index.ts';

const peer = { id: crypto.randomUUID(), handle: 'ana', avatar: null };
function relation(change: Partial<SocialRelation>): SocialRelation {
  return {
    peer,
    requester: 'eu',
    state: 'approved',
    revision: 1,
    blocked: false,
    blockRevision: 0,
    canSend: true,
    ...change,
  };
}

await test('chat público só mostra o compositor numa conversa aceita e enviável', () => {
  const base = { own: 'eu', local: false, canRequest: false, handle: 'ana' };
  assert.equal(dmRequestState({ ...base, value: relation({}) }), null);
  for (const [value, actions, extra] of [
    [null, ['request'], { canRequest: true }],
    [relation({ state: 'pending', requester: 'eu', canSend: false }), [], {}],
    [
      relation({ state: 'pending', requester: 'ana', canSend: false }),
      ['accept', 'reject'],
      {},
    ],
    [relation({ blocked: true, canSend: false }), [], {}],
    [relation({ state: 'rejected', canSend: false }), [], {}],
  ] as const)
    assert.deepEqual(
      dmRequestState({ ...base, ...extra, value })?.actions,
      actions,
    );
  assert.deepEqual(
    dmRequestState({ ...base, local: true, value: relation({}) })?.actions,
    [],
  );
});

await test('subtítulo do chat público segue a relação, como a presença do privado', () => {
  for (const [value, local, label] of [
    [relation({}), false, 'Message via @'],
    [relation({}), true, 'Copy on this device'],
    [null, false, 'No conversations yet'],
    [relation({ blocked: true }), false, 'Blocked'],
    [relation({ state: 'pending' }), false, 'Awaiting acceptance'],
    [
      relation({ state: 'pending', requester: 'ana' }),
      false,
      'Conversation request',
    ],
    [relation({ state: 'rejected' }), false, 'Declined request'],
  ] as const)
    assert.equal(dmStateLabel(value, 'eu', local), label);
});
