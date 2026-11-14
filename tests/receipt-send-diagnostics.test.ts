import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageInbox } from '../src/client/messages/inbox.ts';
import { ApiResponseError } from '../src/client/api-response/index.ts';
import {
  privateSendPoint,
  measurePrivateSend,
  privateSendBatch,
  linkPrivateBatch,
} from '../src/client/chat-sync-diagnostics/index.ts';
import type { VaultWorkOptions } from '../src/client/vault-authority/index.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';
import { privateSendCapture } from './fixtures/private-send-capture.ts';

for (const scope of ['direct', 'groups'] as const) {
  await test(`two sends identify the same live ${scope} turn; commit alone cannot release its lease; new hints resume afterward`, async (t) => {
    const f = privateSendCapture(t),
      entered = deferred<void>(),
      durable = deferred<void>(),
      release = deferred<void>(),
      successor = deferred<void>();
    const followup = deferred<void>();
    let calls = 0,
      ready = true;
    const domain = async (_signal: AbortSignal, work: VaultWorkOptions) => {
      if (++calls > 1) {
        successor.resolve();
        return false;
      }
      assert.equal(
        work.priority,
        scope === 'direct' ? 'interactive' : undefined,
      );
      entered.resolve();
      await measurePrivateSend(
        work.privateSend,
        'receipt-persist',
        () => durable.promise,
      );
      privateSendPoint(work.privateSend, 'receipt-commit', {
        receiptPages: 1,
        receiptItems: 2,
      });
      await release.promise;
      return true;
    };
    const inbox = new MessageInbox({
      ready: () => false,
      receiptReady: () => ready,
      generation: () => 0,
      current: () => true,
      direct: domain,
      groups: domain,
      pause() {},
      changed() {},
      received: () => followup.promise,
      failed: (error) => {
        throw error;
      },
    });
    t.after(() => {
      ready = false;
      durable.resolve();
      release.resolve();
      followup.resolve();
      inbox.pause();
    });
    inbox.demand(scope);
    inbox.resume();
    await waitForBoundary(entered.promise);
    inbox.admitDraft();
    f.at(100);
    const one = f.send('first');
    f.at(120);
    const two = f.send('second');
    const batch = privateSendBatch();
    linkPrivateBatch(batch, [one.id, two.id]);
    ready = false;
    f.at(150);
    let settled = false;
    const waiting = inbox.settle(batch).then(() => {
      settled = true;
    });
    inbox.demand(scope);
    f.at(200);
    durable.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    f.at(400);
    release.resolve();
    await waiting;
    f.at(430);
    one.accepted();
    two.accepted();
    for (let n = 0; n < 1600; n++) f.recording.record('background');
    const report = f.recording.report().comparison.privateLatency;
    assert.equal(report.receipts.turns.length, 1);
    const turn = report.receipts.turns[0]!;
    assert.deepEqual(
      [turn.scope, turn.live, turn.commitMs, turn.releaseMs, turn.completeMs],
      [scope, true, 200, 400, 400],
    );
    const links = report.sends.map((send) => send.receipts);
    assert.deepEqual(
      links.map(
        (items) =>
          items.find((link) => link.relation === 'receipt-at-submit')
            ?.ageAtGestureMs,
      ),
      [100, 120],
    );
    assert.deepEqual(
      links.map(
        (items) =>
          items.find((link) => link.relation === 'receipt-awaited')
            ?.remainingWaitMs,
      ),
      [250, 250],
    );
    assert.ok(links.flat().every((link) => link.turn === turn.slot));
    assert.ok(
      turn.spans.some(
        (span) => span.stage === 'receipt-persist' && span.endMs === 200,
      ),
    );
    ready = true;
    inbox.resume();
    await waitForBoundary(successor.promise);
    assert.equal(calls, 2);
  });
}

await test('snapshot retry keeps one receipt turn and separate attempts; failed persistence never marks a commit', async (t) => {
  const f = privateSendCapture(t),
    completed = deferred<void>();
  let calls = 0,
    ready = true;
  const failure = new Error('Controlled storage failure');
  const domain = () => {
    if (++calls === 1)
      return Promise.reject(
        new ApiResponseError({
          operation: 'messages/confirm',
          status: 409,
          failure: 'http',
          message: 'Messages or permissions changed. Sync again.',
        }),
      );
    return Promise.reject(failure);
  };
  const inbox = new MessageInbox({
    ready: () => false,
    receiptReady: () => ready,
    generation: () => 0,
    current: () => true,
    direct: domain,
    groups: domain,
    pause() {},
    changed: () => {
      ready = false;
      completed.resolve();
    },
    received: () => assert.fail('No successful page'),
    failed: (error) => assert.equal(error, failure),
  });
  t.after(() => inbox.pause());
  inbox.demand('direct');
  inbox.resume();
  await waitForBoundary(completed.promise);
  const turn =
    f.recording.report().comparison.privateLatency.receipts.turns[0]!;
  assert.equal(calls, 2);
  assert.equal(turn.commitMs, null);
  assert.equal(turn.outcome, 'failed-or-cancelled');
  assert.equal(
    turn.points.filter((p) => p.stage === 'receipt-retry').length,
    1,
  );
  assert.deepEqual(
    turn.spans
      .filter((p) => p.stage === 'receipt-attempt')
      .map((p) => p.attempt),
    [1, 2],
  );
});

await test('receipt terminal boundaries survive detail overflow and old clients do not claim new coverage', (t) => {
  const f = privateSendCapture(t);
  const record = f.recording.record;
  record('reuse-send', {
    receiptTurn: 1,
    receiptScope: 'groups',
    receiptLive: true,
    sendStage: 'receipt-start',
    sendPhase: 'point',
    sendClockMs: 1000,
  });
  for (let i = 0; i < 150; i++)
    record('reuse-send', {
      receiptTurn: 1,
      sendStage: 'receipt-fetch',
      sendPhase: 'point',
      receiptItems: 1,
      sendClockMs: 1000 + i,
    });
  record('reuse-send', {
    receiptTurn: 1,
    sendStage: 'receipt-commit',
    sendPhase: 'point',
    sendClockMs: 1200,
  });
  record('reuse-send', {
    receiptTurn: 1,
    sendStage: 'receipt-release',
    sendPhase: 'point',
    sendClockMs: 1210,
  });
  record('reuse-send', {
    receiptTurn: 1,
    sendStage: 'receipt-complete',
    sendPhase: 'point',
    receiptMore: false,
    sendClockMs: 1210,
  });
  const report = f.recording.report().comparison.privateLatency;
  assert.equal(report.available, true);
  assert.equal(report.receipts.turns[0]?.droppedPoints, 22);
  assert.equal(report.receipts.turns[0]?.commitMs, 200);
  assert.equal(report.receipts.turns[0]?.completeMs, 210);
  record('reuse-ready', { privateRevision: 1 });
  assert.equal(f.recording.report().comparison.privateLatency.available, false);
});
