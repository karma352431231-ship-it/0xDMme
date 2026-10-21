import type { MessageWorkResult } from '../src/client/messages/continuation.ts';
import { dailyViews } from '../src/client/daily-text/index.ts';
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
async function finish(next: MessageWorkResult): Promise<void> {
  for (let turn = 0; next && turn < 100; turn++) next = await next.resume();
  assert.equal(next, undefined);
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
await test('the actual screen opens 144 rows in nine pages automatically without a fixed page delay', async (t) => {
  const f = await assembled(t);
  for (let n = 0; n < 144; n++) await f.add('Synthetic ' + n);
  const reads = f.screen.calls.filter((call) => call === 'read').length;
  await f.screen.messages.openContact(f.peer);
  assert.equal(f.data.pages.length, 1);
  assert.equal(f.data.frames.at(-1), null);
  f.screen.retry();
  f.screen.retry();
  await turn();
  assert.equal(
    f.data.pages.length,
    1,
    'Repeated manual requests keep the existing continuation and completion tail',
  );
  t.mock.timers.tick(0);
  await until(t, () => f.data.frames.at(-1)?.length === 16);
  assert.deepEqual(
    f.data.pages.map((page) => page.after),
    [0, 16, 32, 48, 64, 80, 96, 112, 128],
  );
  assert.equal(f.data.frames.at(-1)?.length, 16);
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
await test('Try again retains verified history and a saved send runs before the next bounded round', async (t) => {
  const f = await assembled(t);
  await f.add('Previously verified');
  await f.screen.messages.openContact(f.peer);
  for (let n = 1; n < 144; n++) await f.add('Synthetic ' + n);
  const frames = f.data.frames.length;
  f.screen.retry();
  await turn();
  assert.equal(f.data.pages.length, 2); // one initial page plus one bounded page
  assert.equal(f.data.frames.at(-1)?.[0]?.text, 'Previously verified');
  assert.ok(f.data.frames.slice(frames).every((rows) => rows !== null));
  f.screen.state.holdSend = true;
  f.screen.input.value = 'Prioritize this send';
  f.screen.submit();
  await turn();
  assert.ok(f.screen.calls.includes('send-pending'));
  t.mock.timers.tick(0);
  await turn();
  assert.equal(
    f.data.pages.length,
    2,
    'The next read must wait for the active send',
  );
  f.screen.state.holdSend = false;
  f.screen.sending.resolve();
  await turn();
  t.mock.timers.tick(1000);
  await turn(); // the existing post-input quiet window, not a page timer
  t.mock.timers.tick(0);
  await turn();
  await until(t, () => f.data.frames.at(-1)?.length === 16);
  assert.equal(f.data.pages.length, 10);
  assert.equal(f.data.pages.at(-1)?.after, 128);
  assert.equal(f.data.frames.at(-1)?.length, 16);
  assert.ok(!f.screen.calls.includes('hide'));
});
await test('continuous arrivals remain outside the frozen read and are included by its successor', async () => {
  const f = resumeFixture(true);
  const { controller, data } = f;
  try {
    for (let n = 0; n < 144; n++) await f.add('Original ' + n);
    data.beforePage = async () => {
      await f.add('Arrived during recovery');
      controller.hint();
    };
    const first = await controller.synchronize();
    assert.ok(first);
    await finish(first);
    assert.equal(data.pages.length, 9);
    assert.ok(data.pages.every((page) => page.through === 144));
    assert.deepEqual(
      data.frames.at(-1)?.map((row) => row.sequence),
      Array.from({ length: 16 }, (_, n) => 129 + n),
    );
    data.beforePage = undefined;
    let next = await controller.synchronize();
    while (next) next = await next.resume();
    const rows = data.frames.at(-1)!;
    assert.equal(rows.at(-1)?.sequence, 153);
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  } finally {
    controller.close();
  }
});
await test('a real transport interruption is reported and Try again resumes the valid prefix', async (t) => {
  const f = await assembled(t);
  for (let n = 0; n < 144; n++) await f.add('Synthetic ' + n);
  await f.screen.messages.openContact(f.peer);
  f.data.pageFailure = 503;
  t.mock.timers.tick(0);
  await turn();
  assert.equal(f.data.frames.at(-1), null);
  assert.equal(f.data.pages.at(-1)?.after, 16);
  await until(t, () =>
    f.screen.statusFrames.some((text) => text.includes('HTTP 503')),
  );
  f.data.pageFailure = null;
  f.screen.retry();
  await until(t, () => f.data.frames.at(-1)?.length === 16);
  assert.deepEqual(
    f.data.pages.map((page) => page.after),
    [0, 16, 16, 32, 48, 64, 80, 96, 112, 128],
  );
  assert.equal(f.data.frames.at(-1)?.length, 16);
  assert.ok(!f.screen.calls.includes('hide'));
});
for (const status of [401, 403, 409]) {
  await test(`a ${status} interruption cannot reuse an incomplete index`, async () => {
    const f = resumeFixture(true);
    try {
      for (let n = 0; n < 144; n++) await f.add('Synthetic ' + n);
      const next = await f.controller.synchronize();
      assert.ok(next);
      f.data.pageFailure = status;
      await assert.rejects(next.resume());
      assert.equal(f.data.frames.at(-1), null);
      f.data.pageFailure = null;
      assert.ok(await f.controller.synchronize());
      assert.equal(f.data.pages.at(-1)?.after, 0);
    } finally {
      f.controller.close();
    }
  });
}
await test('a continuation from a replaced session cannot read or publish', async () => {
  const f = resumeFixture(true);
  try {
    for (let n = 0; n < 144; n++) await f.add('Synthetic ' + n);
    const next = await f.controller.synchronize();
    assert.ok(next);
    f.controller.setSession(null);
    const before = f.data.requests.length;
    await assert.rejects(next.resume(), /[Ss]ession/);
    assert.equal(f.data.requests.length, before);
    assert.equal(f.data.frames.at(-1), null);
  } finally {
    f.controller.close();
  }
});
await test('a newly observed deletion fence conceals the old view before a partial replacement scan', async () => {
  const f = resumeFixture(true);
  try {
    await f.add('Previous view');
    await f.controller.synchronize();
    for (let n = 1; n < 144; n++) await f.add('Synthetic ' + n);
    Object.assign(f.data.snapshot, { invalidation: 2 });
    const next = await f.controller.synchronize();
    assert.ok(next);
    assert.equal(f.data.frames.at(-1), null);
    await finish(next);
    assert.equal(f.data.frames.at(-1)?.length, 16);
  } finally {
    f.controller.close();
  }
});

await test('switching conversations during continuation shares account progress without publishing the former recipient', async (t) => {
  const f = await assembled(t),
    other = crypto.randomUUID();
  for (let n = 0; n < 144; n++)
    await f.add('Synthetic ' + n, n % 2 ? other : f.peer.accountId);
  await f.screen.messages.openContact(f.peer);
  assert.equal(f.data.pages.length, 1);
  await f.screen.messages.openContact({ ...f.peer, accountId: other });
  await until(t, () => f.data.frames.at(-1)?.length === 16);
  t.mock.timers.tick(0);
  await turn();
  assert.equal(f.data.pages.length, 9);
  assert.ok(f.data.frames.at(-1)?.every((row) => row.peer === other));
});
await test('an edit arriving between bounded turns belongs to the successor cut', async () => {
  const f = resumeFixture(true);
  try {
    for (let n = 0; n < 144; n++) await f.add('Original ' + n);
    const pending = await f.controller.synchronize();
    assert.ok(pending);
    const root = f.data.items[129]!;
    const edit = await f.add('Edited after the cut', f.peer, {
      id: root.id,
      hash: root.hash,
      author: f.peer,
      type: 'edit',
    });
    f.data.changes = [edit];
    await finish(pending);
    assert.equal(
      dailyViews(f.data.frames.at(-1) ?? []).find((row) => row.id === root.id)
        ?.content.text,
      'Original 129',
    );
    let next = await f.controller.synchronize();
    while (next) next = await next.resume();
    assert.equal(
      dailyViews(f.data.frames.at(-1) ?? []).find((row) => row.id === root.id)
        ?.content.text,
      'Edited after the cut',
    );
    assert.equal(
      f.data.frames.at(-1)?.filter((row) => row.id === root.id).length,
      1,
    );
  } finally {
    f.controller.close();
  }
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

await test('observing a new security fence blocks closed-conversation reuse before continuation completes', async () => {
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
    const pending = await f.controller.synchronize();
    assert.ok(pending);
    assert.equal(f.controller.canRestore(other), false);
    await finish(pending);
    assert.equal(f.controller.canRestore(other), false);
  } finally {
    f.controller.close();
  }
});
