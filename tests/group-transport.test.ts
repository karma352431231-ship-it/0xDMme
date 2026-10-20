import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupTransport } from '../src/client/message-crypto/group-transport.ts';
import { matrixUser } from '../src/shared/messages/index.ts';
import { object } from '../src/shared/account/index.ts';

await test('200 accounts with 32 devices preserve the audience and fit batches without truncating the SDK transaction', async () => {
  const users = Array.from({ length: 200 }, () =>
    matrixUser(crypto.randomUUID()),
  );
  const all = Object.fromEntries(
    users.map((user) => [
      user,
      Object.fromEntries(
        Array.from({ length: 32 }, () => [
          crypto.randomUUID(),
          'signed_curve25519',
        ]),
      ),
    ]),
  );
  const requests: Record<string, number> = {},
    sent = new Set<string>(),
    claimed = new Set<string>(),
    queried = new Set<string>();
  const transport = groupTransport((operation, payload) => {
    requests[operation] = (requests[operation] ?? 0) + 1;
    const sdk = object(payload['sdk']);
    if (operation === 'matrix-query') {
      const keys = object(sdk['device_keys']);
      assert.ok(Object.keys(keys).length <= 16);
      for (const user of Object.keys(keys)) queried.add(user);
      return Promise.resolve({
        bindings: [],
        response: { device_keys: {}, failures: {} },
      });
    }
    const batch = object(
      sdk[operation === 'matrix-claim' ? 'one_time_keys' : 'messages'],
    );
    const entries = Object.entries(batch).flatMap(([user, devices]) =>
      Object.keys(object(devices)).map((device) => `${user}/${device}`),
    );
    assert.ok(entries.length <= 512);
    for (const entry of entries)
      (operation === 'matrix-claim' ? claimed : sent).add(entry);
    if (operation === 'matrix-send')
      assert.equal(payload['id'], 'unchanged-sdk-transaction');
    return Promise.resolve({ response: { one_time_keys: {}, failures: {} } });
  });
  await transport('matrix-query', {
    sdk: { device_keys: Object.fromEntries(users.map((user) => [user, []])) },
  });
  await transport('matrix-claim', { sdk: { one_time_keys: all } });
  await transport('matrix-send', {
    id: 'unchanged-sdk-transaction',
    type: 'm.room.encrypted',
    sdk: { messages: all },
  });
  assert.equal(queried.size, 200);
  assert.equal(claimed.size, 6400);
  assert.equal(sent.size, 6400);
  assert.deepEqual(requests, {
    'matrix-query': 13,
    'matrix-claim': 13,
    'matrix-send': 13,
  });
});
await test('partial query failure rejects the session instead of simulating a complete response', async () => {
  const transport = groupTransport(() =>
    Promise.resolve({
      bindings: [],
      response: { device_keys: {}, failures: { unavailable: {} } },
    }),
  );
  await assert.rejects(
    transport('matrix-query', {
      sdk: { device_keys: { [matrixUser(crypto.randomUUID())]: [] } },
    }),
  );
});
