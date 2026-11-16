import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  readDelivery,
  readHistoryDelivery,
} from '../src/client/messages/delivery.ts';
import type { DeliveryView } from '../src/client/messages/delivery.ts';
import { ApiResponseError } from '../src/client/api-response/index.ts';
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

function deepHistory() {
  const views: DeliveryView[] = Array.from({ length: 98 }, (_, index) => ({
    id: String(index),
    hash: 'unchanged',
    state: messageStates.accepted,
    own: true,
  }));
  const requests: number[] = [];
  const response = (data: Record<string, unknown>) => {
    const ids = data['ids'] as string[];
    requests.push(ids.length);
    return ids.map((id) => ({
      id,
      hash: 'unchanged',
      queue_active: true,
      recipient_received: Number(id) % 2 === 0,
    }));
  };
  return { views, requests, response, snapshot: { version: 2 } };
}

await test('deep finite history reads current receipts in two bounded batches', async () => {
  const f = deepHistory();
  const rows = await readHistoryDelivery({
    ...f,
    api: (_op, data) => Promise.resolve(f.response(data)),
  });
  assert.deepEqual(f.requests, [64, 34]);
  assert.deepEqual(
    rows.map((row) => row.id),
    f.views.map((row) => row.id),
  );
  assert.equal(
    rows.filter((row) => row.state === messageStates.received).length,
    49,
  );
});

await test('the legacy oversized-batch rejection falls back and a snapshot conflict propagates', async () => {
  const unavailable = new ApiResponseError({
    operation: 'messages/delivery',
    status: 400,
    failure: 'http',
    message: 'Invalid batch.',
  });
  const f = deepHistory();
  const rows = await readHistoryDelivery({
    ...f,
    api: (_op, data) => {
      const result = f.response(data);
      return result.length > 18
        ? Promise.reject(unavailable)
        : Promise.resolve(result);
    },
  });
  assert.deepEqual(f.requests, [64, 18, 18, 18, 18, 18, 8]);
  assert.equal(rows.at(-2)?.state, messageStates.received);

  let calls = 0;
  const changed = new ApiResponseError({
    operation: 'messages/delivery',
    status: 409,
    failure: 'http',
    message: 'Messages or permissions changed. Sync again.',
  });
  await assert.rejects(
    readHistoryDelivery({
      ...f,
      api: () => {
        calls++;
        return Promise.reject(changed);
      },
    }),
    (error: unknown) => error === changed,
  );
  assert.equal(calls, 1);
});
