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
    [relation({}), false, 'Mensagem pública pelo @'],
    [relation({}), true, 'Cópia neste aparelho'],
    [null, false, 'Sem conversa ainda'],
    [relation({ blocked: true }), false, 'Bloqueada'],
    [relation({ state: 'pending' }), false, 'Aguardando aceite'],
    [
      relation({ state: 'pending', requester: 'ana' }),
      false,
      'Pedido de conversa',
    ],
    [relation({ state: 'rejected' }), false, 'Pedido recusado'],
  ] as const)
    assert.equal(dmStateLabel(value, 'eu', local), label);
});
