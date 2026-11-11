import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { AttachmentSubmissions } from '../src/client/messages/attachment-submissions.ts';
import type {
  MediaSubmission,
  SubmissionItem,
} from '../src/client/messages/attachment-submissions.ts';
import type { AttachmentSelection } from '../src/client/attachments/index.ts';
import { deferred } from './fixtures/deferred.ts';

function file(value = 1): AttachmentSelection {
  return {
    name: 'test.bin',
    type: 'application/octet-stream',
    image: false,
    bytes: new Uint8Array([value]),
    thumbnail: new Uint8Array([value]),
  };
}
function submission(selections = [file()]): MediaSubmission {
  return {
    peer: 'first',
    text: 'Caption',
    reply: 'reply-id',
    viewOnce: false,
    selections,
  };
}
function fixture(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const navigator = { onLine: true };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: navigator,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else Reflect.deleteProperty(globalThis, 'navigator');
  });
  const staged: SubmissionItem[] = [];
  const errors: unknown[] = [];
  const state = {
    available: true,
    failStage: false,
    failSend: false,
    sends: 0,
    followups: 0,
    holdStage: false,
    holdSend: false,
  };
  const staging = deferred<void>(),
    sending = deferred<void>();
  const owner = new AttachmentSubmissions({
    available: () => state.available,
    run: async (work) => {
      await work();
      return true;
    },
    stage: async (item) => {
      if (state.holdStage) await staging.promise;
      if (state.failStage) throw new Error('staging failed');
      staged.push({ ...item });
      return [
        {
          id: item.id,
          peer: item.peer,
          content: null,
          createdAt: item.createdAt,
        },
      ];
    },
    send: async () => {
      state.sends++;
      if (state.holdSend) await sending.promise;
      if (state.failSend) throw new Error('lost response');
    },
    changed: () => {},
    failed: (error) => errors.push(error),
    followup: () => {
      state.followups++;
    },
  });
  t.after(() => owner.reset());
  return { owner, state, staging, sending, staged, errors, navigator };
}

await test('captured media stays ordered and immutable while a new conversation/draft waits; acceptance is immediate', async (t) => {
  const f = fixture(t),
    files = [file(1), file(2)];
  const input = submission(files);
  f.state.holdSend = true;
  f.owner.enqueue(input);
  input.peer = 'changed';
  input.text = 'changed';
  input.viewOnce = true;
  files[0]!.name = 'changed';
  await setImmediate();
  assert.equal(f.staged.length, 2);
  assert.deepEqual(
    f.staged.map((item) => [item.peer, item.text, item.reply, item.viewOnce]),
    [
      ['first', 'Caption', 'reply-id', false],
      ['first', '', null, false],
    ],
  );
  assert.equal(f.staged[0]!.selection!.name, 'test.bin');
  assert.ok(
    files.every((item) => item.bytes[0] === 0 && item.thumbnail![0] === 0),
  );
  const next = submission([file(3)]);
  next.peer = 'second';
  f.owner.enqueue(next);
  const id = f.staged[0]!.id;
  f.owner.acknowledge({ id, peer: 'first' });
  assert.equal(f.owner.forPeer('first')[0]!.phase, 'accepted');
  assert.equal(f.state.sends, 1);
  assert.equal(f.staged.length, 2);
  f.owner.observed('first', [{ id }]);
  assert.equal(f.owner.has(id), false);
  f.sending.resolve();
  await setImmediate();
  assert.equal(f.staged[2]!.peer, 'second');
  assert.equal(f.owner.pending, false);
});

await test('staging failure retains the submitted draft without overwriting the next draft and retries with stable IDs', async (t) => {
  const f = fixture(t),
    selection = file();
  f.state.failStage = true;
  f.owner.enqueue(submission([selection]));
  await setImmediate();
  const original = f.owner.forPeer('first')[0]!;
  assert.equal(original.phase, 'failed');
  assert.equal(selection.bytes[0], 1);
  const next = submission([file(2)]);
  next.peer = 'next';
  f.owner.enqueue(next);
  assert.equal(f.owner.full, true);
  assert.throws(() => f.owner.enqueue(submission()));
  f.state.failStage = false;
  f.owner.retry();
  await setImmediate();
  assert.equal(f.staged[0]!.id, original.id);
  assert.deepEqual(
    f.staged.map((item) => item.peer),
    ['first', 'next'],
  );
  assert.equal(selection.bytes[0], 0);
  assert.equal(f.errors.length, 1);
});

await test('a failure after acceptance keeps the check and retries durable data without restaging plaintext', async (t) => {
  const f = fixture(t);
  f.state.holdSend = true;
  f.owner.enqueue(submission());
  await setImmediate();
  const { id, peer } = f.staged[0]!;
  f.owner.acknowledge({ id, peer });
  f.state.failSend = true;
  f.sending.resolve();
  await setImmediate();
  assert.equal(f.owner.forPeer(peer)[0]!.phase, 'accepted');
  f.state.failSend = false;
  f.owner.retry();
  await setImmediate();
  assert.equal(f.staged.length, 1);
  assert.equal(f.state.sends, 2);
});

await test('session invalidation/disposal wipes queued and in-flight buffers without starting another transfer', async (t) => {
  const f = fixture(t),
    active = file(),
    queued = file(2);
  f.state.holdStage = true;
  f.owner.enqueue(submission([active]));
  await setImmediate();
  f.owner.enqueue(submission([queued]));
  f.owner.reset();
  assert.equal(queued.bytes[0], 0);
  assert.equal(f.owner.forPeer('first').length, 0);
  f.staging.resolve();
  await setImmediate();
  assert.equal(active.bytes[0], 0);
  assert.equal(f.state.sends, 0);
  assert.equal(f.state.followups, 0);
});

await test('offline staging is durable and bounded even without verified history reconciliation', async (t) => {
  const f = fixture(t);
  f.navigator.onLine = false;
  for (let n = 0; n < 44; n++) {
    f.owner.enqueue(submission());
    await setImmediate();
  }
  assert.equal(f.state.sends, 0);
  assert.equal(f.owner.unsaved, false);
  assert.equal(f.owner.full, true);
  assert.throws(() => f.owner.enqueue(submission()));
});
