import { exclusive } from '../src/client/device-storage/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { privateSendCapture } from './fixtures/private-send-capture.ts';
import {
  measurePrivateSend,
  privateSendPoint,
  privateSendBatch,
  linkPrivateBatch,
  traceSend,
} from '../src/client/chat-sync-diagnostics/index.ts';
import { diagnosticRequestCategory } from '../src/shared/chat-sync-diagnostics/network.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';
import { MessageInbox } from '../src/client/messages/inbox.ts';

await test('eight interleaved sends retain explicit group bindings, shared attempts and terminal outcomes after ring wrap', async (t) => {
  const f = privateSendCapture(t);
  const sends = [];
  const batch = privateSendBatch();
  for (let i = 0; i < 8; i++) {
    f.at(i * 100);
    const send = f.send(`mixed-${i}`, i % 3 === 0 ? 'private' : 'group');
    sends.push(send);
    for (const stage of [
      'draft-admitted',
      'ui-available',
      'pending-render',
      'staging-complete',
      'outbox-dispatch',
    ] as const)
      traceSend(stage, send.id);
    await measurePrivateSend(send.context, 'local-save', () =>
      Promise.resolve(),
    );
  }
  linkPrivateBatch(
    batch,
    sends.filter((_, i) => i % 3 !== 0).map((send) => send.id),
  );
  f.at(900);
  await measurePrivateSend(
    batch ? { ...batch, attempt: 1 } : undefined,
    'group-directories',
    () => Promise.resolve(),
  );
  f.at(1000);
  for (const send of sends) send.accepted();
  for (let n = 0; n < 1700; n++) f.recording.record('noise');
  const comparison = f.recording.report().comparison;
  const summary = comparison.privateLatency;
  assert.equal(comparison.limit, 32);
  assert.equal(summary.sends.length, 8);
  assert.ok(
    comparison.sends.every((send) => send.message !== null && !send.ambiguous),
  );
  assert.deepEqual(
    summary.sends.map((send) => send.scope),
    [
      'private',
      'group',
      'group',
      'private',
      'group',
      'group',
      'private',
      'group',
    ],
  );
  assert.ok(
    summary.sends.every(
      (send) => send.outcome === 'accepted' && send.windows.toCheck.available,
    ),
  );
  for (const send of summary.sends)
    for (const window of Object.values(send.windows))
      if (window.available)
        assert.equal(
          window.elapsedMs,
          window.queueWaitMs + window.executionMs + window.unattributedMs,
        );
});

await test('send/detail budgets are independent and terminal acceptance survives exhausted detail', (t) => {
  const f = privateSendCapture(t),
    first = f.send('retained-group', 'group');
  for (let i = 0; i < 140; i++)
    privateSendPoint(first.context, 'group-send-entry');
  f.at(500);
  first.accepted();
  for (let i = 0; i < 32; i++) f.send(`over-${i}`, 'group');
  const report = f.recording.report().comparison.privateLatency;
  assert.equal(report.sends.length, 32);
  assert.equal(report.scopeCounts['group']!.overflowed, 1);
  assert.ok(report.sends[0]!.coverage.droppedPoints > 0);
  assert.equal(report.sends[0]!.outcome, 'accepted');
  assert.equal(report.sends[0]!.checkObservation, 'visible-DOM-observed');
});

await test('group request categories distinguish the actual message, media and Matrix operations', () => {
  for (const operation of [
    'group-message-publish',
    'group-message-accepted',
    'group-message-delta',
    'group-message-confirm',
    'group-message-objects',
    'group-message-recent',
    'group-attachment-reserve',
    'group-attachment-part',
    'group-attachment-finish',
    'group-matrix-query',
  ])
    assert.equal(
      diagnosticRequestCategory(`/api/account/messages/${operation}`),
      `messages/${operation}`,
    );
});

await test('local draft admission interrupts only speculative group receipt; its cleanup still precedes saving and hints survive', async (t) => {
  const entered = deferred<void>(),
    aborted = deferred<void>(),
    release = deferred<void>(),
    successor = deferred<void>();
  let ready = true,
    attempts = 0,
    active = 0;
  const account = crypto.randomUUID();
  const inbox = new MessageInbox({
    ready: () => ready,
    receiptReady: () => ready,
    generation: () => 0,
    current: () => true,
    direct: () => Promise.resolve(false),
    groups: async (signal) => {
      if (++attempts > 1) {
        successor.resolve();
        return false;
      }
      return exclusive(account, async () => {
        active++;
        entered.resolve();
        signal.addEventListener('abort', () => aborted.resolve(), {
          once: true,
        });
        await aborted.promise;
        await release.promise;
        active--;
        signal.throwIfAborted();
        return false;
      });
    },
    pause() {},
    changed() {},
    received() {},
    failed: (error) => {
      throw error;
    },
  });
  t.after(() => {
    ready = false;
    release.resolve();
    inbox.pause();
  });
  inbox.request('groups');
  inbox.resume();
  // Speculative preparation deliberately keeps its existing one-second quiet scheduling.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  // A live test below covers settlement. Trigger the already scheduled speculative timer.
  // Re-arm it under the fake clock so no wall-clock waiting is necessary.
  inbox.defer();
  inbox.resume();
  t.mock.timers.tick(1000);
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.tick(1000);
  await waitForBoundary(entered.promise);
  ready = false;
  let saved = false;
  const saving = exclusive(account, () => {
    assert.equal(active, 0);
    saved = true;
    return Promise.resolve();
  });
  inbox.admitDraft();
  await aborted.promise;
  assert.equal(active, 1, 'The save cannot bypass an unreleased resource');
  assert.equal(saved, false);
  inbox.demand('groups');
  release.resolve();
  await saving;
  assert.equal(saved, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(active, 0);
  ready = true;
  inbox.resume();
  t.mock.timers.tick(0);
  await waitForBoundary(successor.promise);
  assert.equal(attempts, 2);
});

await test('four speculative interruptions give the next receipt a protected turn before more local drafts', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let ready = false;
  const attempts: {
    signal: AbortSignal;
    gate: ReturnType<typeof deferred<void>>;
  }[] = [];
  const inbox = new MessageInbox({
    ready: () => ready,
    receiptReady: () => ready,
    generation: () => 0,
    current: () => true,
    direct: () => Promise.resolve(false),
    groups: async (signal) => {
      const gate = deferred<void>();
      attempts.push({ signal, gate });
      await gate.promise;
      signal.throwIfAborted();
      return false;
    },
    pause() {},
    changed: () => {
      ready = false;
    },
    received() {},
    failed: (error) => {
      throw error;
    },
  });
  t.after(() => {
    ready = false;
    for (const attempt of attempts) attempt.gate.resolve();
    inbox.pause();
  });
  for (let i = 0; i < 5; i++) {
    for (let pump = 0; pump < 4 && attempts.length <= i; pump++) {
      ready = true;
      inbox.resume();
      t.mock.timers.tick(1000);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    const attempt = attempts[i];
    assert.ok(attempt);
    ready = false;
    assert.equal(inbox.admitDraft(), i < 4);
    assert.equal(attempt.signal.aborted, i < 4);
    attempt.gate.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
});

await test('group stage detail clips at acceptance while preserving the full shared operation', async (t) => {
  const f = privateSendCapture(t),
    send = f.send('clipped-group', 'group'),
    gate = deferred<void>();
  f.at(20);
  const work = measurePrivateSend(
    send.context,
    'group-packet',
    () => gate.promise,
  );
  f.at(40);
  send.accepted();
  f.at(100);
  gate.resolve();
  await work;
  const report = f.recording.report().comparison;
  assert.equal(report.sends[0]!.stages['group-packet']?.durationMs, 20);
  const window = report.privateLatency.sends[0]!.windows.toAcceptance;
  assert.ok(window.available);
  assert.equal(window.elapsedMs, 40);
  assert.equal(window.executionMs, 20);
  assert.ok(
    report.privateLatency.operations.some(
      (op) => op.stage === 'group-packet' && op.endMs === 100,
    ),
  );
});

await test('reusing a message identity after account change cannot inherit the earlier capture-local send or check', async (t) => {
  const { resetPrivateSendDiagnostics } =
    await import('../src/client/chat-sync-diagnostics/index.ts');
  const f = privateSendCapture(t),
    first = f.send('reused-id', 'group');
  first.accepted();
  resetPrivateSendDiagnostics();
  const second = f.send('reused-id', 'group');
  const firstSlot = first.context?.message,
    secondSlot = second.context?.message;
  assert.notEqual(firstSlot, secondSlot);
  assert.ok(
    !f.recording
      .report()
      .comparison.privateLatency.sends[1]?.milestones.some(
        (p) => p.stage === 'check-render',
      ),
  );
  second.accepted();
  assert.equal(
    f.recording.report().comparison.privateLatency.sends[1]?.outcome,
    'accepted',
  );
});

await test('adopted group drafts report missing start without guessing they predate capture', async (t) => {
  const { resumeGroupSendDiagnostic } =
    await import('../src/client/chat-sync-diagnostics/index.ts');
  const f = privateSendCapture(t);
  resumeGroupSendDiagnostic('adopted-group');
  f.at(20);
  traceSend('accepted', 'adopted-group');
  const send = f.recording.report().comparison.privateLatency.sends[0]!;
  assert.equal(send.startedBeforeCapture, null);
  assert.equal(send.startCoverage, 'missing-start');
  assert.equal(send.gestureMs, null);
  assert.equal(send.windows.toAcceptance.available, false);
  assert.equal(send.coverage.milestoneComplete, false);
});

await test('shared detail overflow reports lost linked work without evicting terminal send outcomes', async (t) => {
  const f = privateSendCapture(t),
    send = f.send('shared-budget', 'group'),
    batch = privateSendBatch();
  linkPrivateBatch(batch, [send.id]);
  for (let i = 0; i < 65; i++) privateSendPoint(batch, 'group-send-entry');
  for (let i = 0; i < 4097; i++)
    await measurePrivateSend(batch, 'group-directories', () =>
      Promise.resolve(),
    );
  send.accepted();
  const report = f.recording.report().comparison.privateLatency;
  assert.equal(report.operations.length, 4096);
  assert.ok(report.overflowCategories.operations > 0);
  assert.ok(report.overflowCategories.batchPoints > 0);
  assert.equal(report.sends[0]!.coverage.missingLinkedWork, true);
  assert.equal(report.sends[0]!.outcome, 'accepted');
});
