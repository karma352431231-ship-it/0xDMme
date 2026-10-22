import { ApiResponseError } from '../src/client/api-response/index.ts';
import { interruptedMessageRead } from '../src/client/messages/read-target.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { coordinatorFixture } from './fixtures/message-coordinator.ts';
import { resumeFixture } from './fixtures/message-resume.ts';
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
async function until(t: TestContext, ready: () => boolean): Promise<void> {
  for (let step = 0; step < 2000 && !ready(); step++) {
    t.mock.timers.tick(0);
    await turn();
  }
  assert.ok(
    ready(),
    'The real controller must settle without advancing a delay timer',
  );
}
async function assembled(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const real = resumeFixture(true);
  t.after(() => real.controller.close());
  const screen = coordinatorFixture(t, {}, real.controller);
  screen.messages.ready();
  screen.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  for (let n = 0; n < 9; n++) {
    t.mock.timers.tick(1000);
    await turn();
  }
  const peer = {
    accountId: real.peer,
    ecosystem: 'evm' as const,
    address: '0x' + '1'.repeat(40),
    name: 'Synthetic peer',
  };
  return { ...real, screen, peer };
}
// Finite cuts open the selected conversation through one bounded window read;
// the paged continuation remains only for legacy snapshots.
await test('the actual screen opens 144 rows with one bounded window and no continuation', async (t) => {
  const f = await assembled(t);
  for (let n = 0; n < 144; n++) await f.add('Synthetic ' + n);
  const reads = f.screen.calls.filter((call) => call === 'read').length;
  await f.screen.messages.openContact(f.peer);
  await until(t, () => f.data.frames.at(-1)?.length === 16);
  assert.equal(f.data.pages.length, 0);
  assert.equal(f.data.windows.length, 1);
  assert.deepEqual(
    f.data.frames.at(-1)?.map((row) => row.text),
    Array.from({ length: 16 }, (_, n) => 'Synthetic ' + (n + 128)),
  );
  assert.ok(!f.screen.calls.includes('hide'));
  assert.ok(
    f.screen.statusFrames.every(
      (text) =>
        !text.includes('partially verified') &&
        !text.includes('Could not complete'),
    ),
  );
  assert.equal(
    f.screen.calls.filter((call) => call === 'read').length,
    reads + 1,
  );
});
await test('an arrival during the window read stays outside its cut and reaches the next read', async () => {
  const f = resumeFixture(true);
  const { controller, data } = f;
  try {
    for (let n = 0; n < 144; n++) await f.add('Original ' + n);
    let arrived = false;
    data.beforePage = async () => {
      if (arrived) return;
      arrived = true;
      await f.add('Arrived during the read');
      controller.hint();
    };
    assert.equal(await controller.synchronize(), undefined);
    assert.ok(data.windows.every((window) => window.through === 144));
    assert.deepEqual(
      data.frames.at(-1)?.map((row) => row.sequence),
      Array.from({ length: 16 }, (_, n) => 129 + n),
    );
    data.beforePage = undefined;
    assert.equal(await controller.synchronize(), undefined);
    const rows = data.frames.at(-1)!;
    assert.equal(rows.at(-1)?.sequence, 145);
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  } finally {
    controller.close();
  }
});
await test('a real transport interruption is reported and Try again reopens the bounded window', async (t) => {
  const f = await assembled(t);
  for (let n = 0; n < 144; n++) await f.add('Synthetic ' + n);
  f.data.pageFailure = 503;
  await f.screen.messages.openContact(f.peer);
  await until(t, () =>
    f.screen.statusFrames.some((text) => text.includes('HTTP 503')),
  );
  assert.ok(!f.data.frames.at(-1)?.length);
  f.data.pageFailure = null;
  f.screen.retry();
  await until(t, () => f.data.frames.at(-1)?.length === 16);
  assert.equal(f.data.pages.length, 0);
  assert.ok(!f.screen.calls.includes('hide'));
});
for (const status of [401, 403, 409]) {
  await test(`a ${status} window failure publishes nothing and the next read starts again`, async () => {
    const f = resumeFixture(true);
    try {
      for (let n = 0; n < 144; n++) await f.add('Synthetic ' + n);
      f.data.pageFailure = status;
      await assert.rejects(f.controller.synchronize());
      assert.ok(!f.data.frames.at(-1)?.length);
      f.data.pageFailure = null;
      assert.equal(await f.controller.synchronize(), undefined);
      assert.equal(f.data.frames.at(-1)?.length, 16);
      assert.equal(f.data.pages.length, 0);
    } finally {
      f.controller.close();
    }
  });
}
await test('a newly observed deletion fence conceals the old view before its replacement window is read', async () => {
  const f = resumeFixture(true);
  try {
    await f.add('Previous view');
    await f.controller.synchronize();
    for (let n = 1; n < 144; n++) await f.add('Synthetic ' + n);
    Object.assign(f.data.snapshot, { invalidation: 2 });
    let concealed: unknown = 'not read';
    f.data.beforePage = () => {
      concealed = f.data.frames.at(-1);
      return Promise.resolve();
    };
    assert.equal(await f.controller.synchronize(), undefined);
    assert.equal(concealed, null);
    assert.equal(f.data.frames.at(-1)?.length, 16);
  } finally {
    f.controller.close();
  }
});

await test('switching conversations reads each bounded window and publishes only the selected recipient', async (t) => {
  const f = await assembled(t),
    other = crypto.randomUUID();
  for (let n = 0; n < 144; n++)
    await f.add('Synthetic ' + n, n % 2 ? other : f.peer.accountId);
  await f.screen.messages.openContact(f.peer);
  await f.screen.messages.openContact({ ...f.peer, accountId: other });
  await until(
    t,
    () =>
      f.data.frames.at(-1)?.length === 16 &&
      f.data.frames.at(-1)!.every((row) => row.peer === other),
  );
  assert.equal(f.data.pages.length, 0);
  assert.equal(f.data.windows.at(-1)?.peer, other);
  assert.ok(f.data.windows.length <= 2);
});
await test('a transport-like body failure cannot preserve a rejected authorization or deletion fence', () => {
  for (const status of [401, 403, 409])
    for (const failure of [
      'http',
      'network',
      'timeout',
      'invalid-json',
    ] as const) {
      assert.equal(
        interruptedMessageRead(
          new ApiResponseError({ operation: 'messages/page', status, failure }),
        ),
        false,
      );
    }
  for (const status of [408, 429, 502, 503, 504]) {
    assert.equal(
      interruptedMessageRead(
        new ApiResponseError({
          operation: 'messages/page',
          status,
          failure: 'http',
        }),
      ),
      true,
    );
  }
  assert.equal(
    interruptedMessageRead(
      new ApiResponseError({
        operation: 'messages/page',
        status: 0,
        failure: 'cancelled',
      }),
    ),
    false,
  );
});

await test('observing a new security fence blocks closed-conversation reuse through the replacement read', async () => {
  const f = resumeFixture(true),
    other = crypto.randomUUID();
  try {
    f.controller.setLiveConnected(true);
    await f.add('Selected');
    await f.add('Closed', other);
    await f.controller.synchronize();
    f.controller.select(other);
    await f.controller.synchronize();
    f.controller.select(f.peer);
    await f.controller.probe();
    assert.equal(f.controller.canRestore(other), true);
    for (let n = 2; n < 144; n++) await f.add('Synthetic ' + n);
    Object.assign(f.data.snapshot, { invalidation: 2 });
    assert.equal(await f.controller.probe(), true);
    assert.equal(f.data.frames.at(-1), null);
    assert.equal(f.controller.canRestore(other), false);
    assert.equal(await f.controller.synchronize(), undefined);
    assert.equal(f.controller.canRestore(other), false);
  } finally {
    f.controller.close();
  }
});
