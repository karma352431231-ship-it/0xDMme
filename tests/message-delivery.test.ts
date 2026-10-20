import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDelivery } from '../src/client/messages/delivery.ts';
import { messageStates } from '../src/client/message-state/index.ts';

await test('first recipient receipt ends pending presentation even while other device queues remain active', async () => {
  for (const queue_active of [false, true])
    for (const own of [false, true])
      for (const recipient_received of [false, true]) {
        const view = {
          id: 'message',
          hash: 'hash',
          state: messageStates.accepted,
          own,
        };
        const [result] = await readDelivery({
          snapshot: {},
          views: [view],
          api: () =>
            Promise.resolve([
              {
                id: view.id,
                hash: view.hash,
                queue_active,
                recipient_received,
              },
            ]),
        });
        const received = !own || recipient_received;
        assert.equal(
          result?.state,
          received ? messageStates.received : messageStates.accepted,
        );
        assert.equal(
          Reflect.get(result, 'delivery'),
          received ? 'received' : 'accepted',
        );
      }
});

await test('delivery probes still reject changed message identity and retain suspended or archived states', async () => {
  const view = {
    id: 'message',
    hash: 'hash',
    own: false,
    state: messageStates.suspended,
  };
  const api = () =>
    Promise.resolve([
      {
        id: view.id,
        hash: view.hash,
        queue_active: true,
        recipient_received: true,
      },
    ]);
  assert.deepEqual(await readDelivery({ snapshot: {}, views: [view], api }), [
    view,
  ]);
  assert.deepEqual(
    await readDelivery({
      snapshot: {},
      views: [{ ...view, archived: true }],
      api,
    }),
    [{ ...view, archived: true }],
  );
  await assert.rejects(
    readDelivery({
      snapshot: {},
      views: [view],
      api: () =>
        Promise.resolve([
          {
            id: view.id,
            hash: 'changed',
            queue_active: false,
            recipient_received: true,
          },
        ]),
    }),
    /does not match/u,
  );
});
