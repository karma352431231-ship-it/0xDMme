import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Recording } from '../src/tools/chat-diagnostics/recording.ts';
import { PrivateSendCapture } from '../src/client/chat-sync-diagnostics/private-send.ts';
import { readChatSyncTrace } from '../src/shared/chat-sync-diagnostics/index.ts';
import type { SendStage } from '../src/shared/chat-sync-diagnostics/index.ts';
import type { RecordEvent } from '../src/tools/chat-diagnostics/events.ts';

await test('overlapping private sends retain actual batch attempts, blockers and union arithmetic after ring eviction', (t) => {
  let ms = 0;
  t.mock.method(performance, 'now', () => ms + 1000);
  const recording = new Recording();
  const record = (at: number, data: Parameters<RecordEvent>[1]) => {
    ms = at;
    recording.record('reuse-send', { sendClockMs: at + 1000, ...data });
  };
  recording.record('reuse-ready', { privateRevision: 1, sendTimings: true });
  recording.record('reuse-coverage', { sendTimings: true });
  const point = (at: number, send: number, stage: SendStage) =>
    record(at, { privateSend: send, sendStage: stage, sendPhase: 'point' });
  const action = (at: number, send: number) => {
    ms = at;
    recording.record('send-action', {
      scope: 'private',
      composer: 1,
      gesture: send,
      cause: 'button',
      sendDisabled: false,
      sendHidden: false,
      formHidden: false,
      mediaKind: 'text',
      viewOnce: false,
    });
    record(at + 1, {
      privateSend: send,
      sendComposer: 1,
      sendGesture: send,
      sendGestureClockMs: at + 1000,
      sendStage: 'logical-submit',
      sendPhase: 'point',
    });
    for (const stage of [
      'draft-admitted',
      'ui-available',
      'pending-render',
    ] as const)
      point(at + 1, send, stage);
    point(at + 4, send, 'staging-complete');
  };
  const span = (input: {
    start: number;
    end: number;
    stage: SendStage;
    send?: number;
    batch?: number;
    attempt?: number;
    wait?: string;
  }) => {
    const fields = {
      sendStage: input.stage,
      ...(input.send ? { privateSend: input.send } : {}),
      ...(input.batch ? { privateBatch: input.batch } : {}),
      ...(input.attempt ? { privateAttempt: input.attempt } : {}),
      ...(input.wait ? { sendWait: input.wait } : {}),
    };
    record(input.start, { ...fields, sendPhase: 'start' });
    record(input.end, {
      ...fields,
      sendPhase: 'end',
      sendMs: input.end - input.start,
      sendSuccess: true,
    });
  };
  action(0, 1);
  action(10, 2);
  span({ start: 1, end: 4, stage: 'local-save', send: 1 });
  span({ start: 11, end: 14, stage: 'local-save', send: 2 });
  span({
    start: 4,
    end: 20,
    stage: 'scheduler-wait',
    send: 1,
    wait: 'foreground-operation',
  });
  span({
    start: 14,
    end: 20,
    stage: 'scheduler-wait',
    send: 2,
    wait: 'media-submission',
  });
  span({ start: 20, end: 70, stage: 'preflight', batch: 1, attempt: 1 });
  span({ start: 45, end: 60, stage: 'target-directory', batch: 1, attempt: 1 });
  for (const send of [1, 2])
    record(42, {
      privateSend: send,
      privateBatch: 1,
      privateAttempt: 1,
      sendStage: 'batch-member',
      sendPhase: 'point',
    });
  span({ start: 80, end: 110, stage: 'preflight', batch: 1, attempt: 2 });
  record(95, {
    privateSend: 1,
    privateBatch: 1,
    privateAttempt: 2,
    sendStage: 'batch-member',
    sendPhase: 'point',
  });
  const authority = (slot: number, times: number[], linked: boolean) => {
    for (const [i, phase] of [
      'queued',
      'admitted',
      'start',
      'complete',
    ].entries()) {
      ms = times[i]!;
      recording.record('reuse-authority-work', {
        diagnosticWork: slot,
        authorityQueue: 1,
        authorityKind: linked ? 'vault' : 'group-directory',
        workPhase: phase,
        workClockMs: ms + 1000,
        ...(linked ? { privateBatch: 1, privateAttempt: slot - 1 } : {}),
      });
    }
  };
  authority(1, [0, 0, 0, 40], false);
  authority(2, [20, 35, 40, 70], true);
  authority(3, [80, 85, 90, 110], true);
  span({ start: 112, end: 125, stage: 'sdk-open', send: 1 });
  span({ start: 130, end: 140, stage: 'device-keys', send: 1 });
  span({ start: 75, end: 85, stage: 'device-keys', send: 2 });
  // Deliberately absent start: a duration alone cannot fill a measured interval.
  record(150, {
    privateSend: 1,
    sendStage: 'packet-save',
    sendPhase: 'end',
    sendSuccess: true,
    sendMs: 10,
  });
  for (const [send, at] of [
    [1, 160],
    [2, 100],
  ] as const) {
    point(20, send, 'outbox-dispatch');
    point(at, send, 'accepted');
    point(at + 5, send, 'check-render');
  }
  ms = 200;
  for (let i = 0; i < 1600; i++) recording.record('background', { count: i });
  const report = recording.report();
  assert.equal(report.meterRevision, 6);
  assert.ok(report.droppedEvents > 0);
  assert.ok(report.events.every((e) => e.kind === 'background'));
  const diagnostic = report.comparison.privateLatency;
  const [one, two] = diagnostic.sends;
  assert.ok(one);
  assert.ok(two);
  const a = one.windows.beforeDeviceKeys,
    b = two.windows.beforeDeviceKeys;
  assert.ok(a.available);
  assert.ok(b.available);
  assert.deepEqual(
    [a.elapsedMs, a.queueWaitMs, a.executionMs, a.unattributedMs],
    [130, 46, 66, 18],
  );
  assert.deepEqual(
    [b.elapsedMs, b.queueWaitMs, b.executionMs, b.unattributedMs],
    [65, 26, 33, 6],
  );
  assertBalanced(diagnostic.sends);
  assert.equal(
    a.authority[0]?.blockers.find((b) => b.category === 'group-directory')
      ?.elapsedMs,
    20,
  );
  assert.deepEqual(
    diagnostic.batches[0]?.attempts.map((a) => a.members),
    [[1, 2], [1]],
  );
  const retried = diagnostic.operations.find((op) => op.attempt === 2)!;
  assert.ok(one.operations.includes(retried.slot));
  assert.ok(!two.operations.includes(retried.slot));
  assert.equal(one.coverage.truncatedSpans.length, 1);
  assert.equal(diagnostic.manualMarkerRequired, false);
  assert.equal(
    report.comparison.sends.every((s) => !s.ambiguous),
    true,
  );
  assert.equal(report.comparison.sends[0]?.privateLatency?.slot, 1);
  assert.ok(
    a.unattributedIntervals.every(
      (gap) => gap.bounds.after && gap.bounds.before,
    ),
  );
});

await test('capture capabilities expire on session change and stop, and scheduler waits resume the same draft', (t) => {
  let ms = 0;
  t.mock.method(performance, 'now', () => ms);
  const events: { stage: string; fields: object }[] = [];
  const capture = new PrivateSendCapture((stage, fields) =>
    events.push({ stage, fields }),
  );
  const event = new Event('submit');
  capture.gesture({ event, composer: 3, gesture: 4, clock: 0 });
  capture.begin('stable-private-message', 1, event);
  const token = capture.context('stable-private-message');
  assert.ok(token);
  capture.scheduler(['foreground-operation']);
  capture.ready('stable-private-message');
  ms = 100;
  capture.scheduler(['media-submission']);
  ms = 140;
  capture.scheduler([]);
  ms = 145;
  capture.dispatch('stable-private-message');
  assert.equal(
    events.filter((e) => e.stage === 'scheduler-eligible').length,
    1,
  );
  const waits = events
    .filter((e) => e.stage === 'scheduler-wait')
    .map((e) => e.fields);
  assert.deepEqual(
    waits.map((e) => 'privateSend' in e && e.privateSend),
    [1, 1, 1, 1],
  );
  const finish = capture.span(token, 'preflight');
  capture.reset();
  assert.deepEqual(capture.fields(token), {});
  const count = events.length;
  finish?.();
  // Old spans must become inert even though the enclosing capture is still active.
  assert.equal(events.length, count);
  capture.begin('different-message', 2);
  const next = capture.context('different-message');
  const done = capture.span(next, 'local-save');
  capture.stop();
  done?.();
  assert.equal(
    JSON.stringify(events).includes('stable-private-message'),
    false,
  );
  assert.equal(JSON.stringify(events).includes('different-message'), false);
});

await test('diagnostic protocol drops arbitrary requests, identifiers and payloads', () => {
  const trace = readChatSyncTrace({
    version: 1,
    event: 'send',
    reason: 'settled',
    source: 1,
    conversation: 0,
    privateSend: 1,
    privateBatch: 2,
    sendSpan: 3,
    sendStage: 'preflight',
    sendWait: 'secret account',
    sendRequest: 'messages/secret-account',
    messageId: 'stable-secret',
    payload: 'private text',
    keys: ['private key'],
  });
  assert.ok(trace);
  assert.equal(trace.privateSend, 1);
  assert.equal(trace.privateBatch, 2);
  assert.equal(trace.sendRequest, undefined);
  assert.equal(trace.sendWait, undefined);
  assert.ok(!JSON.stringify(trace).includes('secret'));
  assert.ok(!JSON.stringify(trace).includes('private text'));
});

function assertBalanced(
  sends: ReturnType<
    Recording['report']
  >['comparison']['privateLatency']['sends'],
): void {
  for (const send of sends)
    for (const window of Object.values(send.windows))
      if (window.available)
        assert.equal(
          window.queueWaitMs + window.executionMs + window.unattributedMs,
          window.elapsedMs,
        );
}
