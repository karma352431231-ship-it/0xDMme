import assert from 'node:assert/strict';
import { test } from 'node:test';
import { probeConfirmed } from '../src/client/messages/confirmed-probe.ts';
import { MessageVisibility } from '../src/client/message-visibility/index.ts';
import { ApiResponseError } from '../src/client/api-response/index.ts';
import { messageStates } from '../src/client/message-state/index.ts';
import { deferred } from './fixtures/deferred.ts';

function fixture(archived = false) {
  const view = {
    id: 'verified',
    hash: 'verified-hash',
    text: 'Verified conversation',
    own: false,
    state: messageStates.received,
    delivery: 'received' as const,
    archived,
  };
  const frames: (readonly (typeof view)[] | null)[] = [];
  const visibility = new MessageVisibility<typeof view>((rows) =>
    frames.push(rows),
  );
  const candidate = {
    snapshot: JSON.stringify({ revision: 1 }),
    views: [view],
  };
  const token = visibility.begin();
  const delivery = [
    {
      id: view.id,
      hash: view.hash,
      queue_active: false,
      recipient_received: true,
    },
  ];
  return { view, frames, visibility, candidate, token, delivery };
}

await test('a retained window publishes only after delivery authenticates its exact snapshot', async () => {
  const f = fixture(),
    held = deferred<unknown>();
  const pending = probeConfirmed({ ...f, api: () => held.promise });
  assert.equal(f.frames.at(-1), null);
  held.resolve(f.delivery);
  assert.deepEqual(await pending, [f.view]);
  assert.deepEqual(f.frames.at(-1), [f.view]);
});

await test('a hint during delivery requires another check and publishes one complete current result', async () => {
  const f = fixture();
  let checks = 0;
  await probeConfirmed({
    ...f,
    api: () => {
      checks++;
      if (checks === 1) f.visibility.hint();
      return Promise.resolve(f.delivery);
    },
  });
  assert.equal(checks, 2);
  assert.equal(f.frames.filter((rows) => rows !== null).length, 1);
  assert.deepEqual(f.frames.at(-1), [f.view]);
});

await test('empty and archived-only candidates still require an authenticated snapshot confirmation', async () => {
  for (const archived of [false, true]) {
    const f = fixture(archived);
    if (!archived) f.candidate.views = [];
    const calls: string[] = [];
    await probeConfirmed({
      ...f,
      api: (op) => {
        calls.push(op);
        return Promise.resolve({});
      },
    });
    assert.deepEqual(calls, ['confirm']);
    assert.deepEqual(f.frames.at(-1), f.candidate.views);
  }
});

await test('only the exact stale-snapshot conflict requests a fresh window; authorization and other failures propagate', async () => {
  for (const [status, reason, stale] of [
    [409, 'Messages or permissions changed. Sync again.', true],
    [403, 'Revoked device.', false],
    [409, 'Another conflict.', false],
  ] as const) {
    const f = fixture();
    const error = new ApiResponseError({
      operation: 'messages/delivery',
      status,
      message: reason,
      failure: 'http',
    });
    const pending = probeConfirmed({ ...f, api: () => Promise.reject(error) });
    if (stale) assert.equal(await pending, null);
    else await assert.rejects(pending, (actual) => actual === error);
    assert.ok(f.frames.every((rows) => rows === null));
  }
});

await test('a closed generation or repeated hints cannot publish a late cached result', async () => {
  for (const close of [false, true]) {
    const f = fixture();
    let attempts = 0;
    await assert.rejects(
      probeConfirmed({
        ...f,
        api: () => {
          attempts++;
          if (close) f.visibility.close();
          else f.visibility.hint();
          return Promise.resolve(f.delivery);
        },
      }),
    );
    assert.equal(attempts, close ? 1 : 3);
    assert.ok(f.frames.every((rows) => rows === null));
  }
});
