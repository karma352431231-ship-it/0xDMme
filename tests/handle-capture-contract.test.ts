import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClockCalibration } from '../src/tools/chat-diagnostics/clock.ts';
import { deliveryReadiness } from '../src/tools/chat-diagnostics/readiness.ts';
import { CaptureWork } from '../src/client/chat-sync-diagnostics/capture-work.ts';
import { Recording } from '../src/tools/chat-diagnostics/recording.ts';
import { compareDelivery } from '../src/tools/chat-diagnostics/delivery-comparison.ts';
import { readChatSyncTrace } from '../src/shared/chat-sync-diagnostics/index.ts';

await test('send preparation links encrypted FIFO, authority and engine points without pairing or private IDs', () => {
  const recording = new Recording();
  recording.record('reuse-ready', { sendPreparationTimings: true });
  const capture = new CaptureWork((event, data) =>
    recording.record(`reuse-${event}`, { ...data }),
  );
  const send = capture.send();
  assert.ok(send);
  capture.markSend(send, 'outbox-ready');
  recording.record('reuse-send', {
    message: 7,
    sendStage: 'flush-ready',
    sendPhase: 'point',
    handleSend: send.slot,
  });
  const work = capture.queue(
    { diagnosticOperation: 'handle-crypto', handleSend: send },
    'interactive',
  );
  assert.ok(work);
  work.admitted();
  work.start();
  capture.markSend(send, 'authority-ready');
  capture.markSend(send, 'profile-ready');
  capture.markSend(send, 'own-directory-ready');
  capture.markSend(send, 'authority-assembled');
  capture.markSend(send, 'engine-ready');
  work.finish(true);
  recording.record('reuse-handle-list', {
    handleListCaller: 'directory',
    listShared: false,
  });
  recording.record('reuse-handle-list', {
    handleListCaller: 'inbox',
    listShared: true,
  });
  for (let n = 0; n < 1600; n++) recording.record('request-start');
  const report = recording.report().deliveryFlow;
  assert.equal(report.senderPreparationAvailable, true);
  assert.equal(report.sends[0]?.events[0]?.sendPreparation, 'flush-request');
  assert.equal(
    report.sends[0]?.events.find((event) => event.message === 7)?.handleSend,
    send.slot,
  );
  assert.equal(report.sends[0]?.events.at(-1)?.sendPreparation, 'engine-ready');
  assert.equal(report.authority[0]?.events[0]?.handleSend, send.slot);
  assert.deepEqual(report.listReads, [
    { caller: 'directory', requests: 1, shared: 0 },
    { caller: 'inbox', requests: 1, shared: 1 },
  ]);
  const other = new CaptureWork(() => assert.fail('foreign or stopped trace'));
  other.markSend(send, 'engine-ready');
  capture.stop();
  capture.markSend(send, 'engine-ready');
  assert.equal(capture.send(), undefined);
  const filtered = readChatSyncTrace({
    version: 1,
    source: 1,
    conversation: 0,
    event: 'handle-send',
    reason: 'settled',
    handleSend: 1,
    sendPreparation: 'arbitrary private text',
    handleListCaller: 'private ID',
    content: 'secret',
  });
  assert.ok(filtered);
  assert.equal(JSON.stringify(filtered).includes('private'), false);
  assert.equal(JSON.stringify(filtered).includes('secret'), false);
});

await test('server clock calibration preserves network uncertainty and rejects inconsistent clocks', () => {
  const origin = 1800000000000,
    clock = new ClockCalibration(origin);
  clock.observe({
    kind: 'response-headers',
    ms: 100,
    serverUnixMs: origin + 150,
    durationMs: 80,
  });
  assert.deepEqual(clock.report(), {
    available: true,
    consistent: true,
    samples: 1,
    offsetMinMs: 48,
    offsetMaxMs: 132,
  });
  clock.observe({
    kind: 'response-headers',
    ms: 200,
    serverUnixMs: origin + 290,
    durationMs: 20,
  });
  assert.equal(clock.report().offsetMinMs, 88);
  assert.equal(clock.report().offsetMaxMs, 112);
  clock.observe({
    kind: 'response-headers',
    ms: 300,
    serverUnixMs: origin + 500,
    durationMs: 10,
  });
  assert.equal(clock.report().consistent, false);
});
await test('old app coverage and missing pairing/clock samples cannot advertise delivery readiness', () => {
  const report = new Recording().report();
  assert.equal(deliveryReadiness(report).state, 'app-unavailable');
  report.handleDelivery.available = true;
  assert.equal(deliveryReadiness(report).state, 'incompatible');
  report.handleDelivery.revision = 2;
  assert.equal(deliveryReadiness(report).state, 'unpaired');
  report.handleDelivery.paired = true;
  report.handleDelivery.pairFingerprint = 'a'.repeat(32);
  assert.equal(deliveryReadiness(report).state, 'clock-pending');
  report.clock.available = true;
  assert.equal(deliveryReadiness(report).state, 'ready-local');
});
await test('queue attribution follows a read capability, survives timeline eviction and ends with its capture', () => {
  const recording = new Recording();
  const capture = new CaptureWork((event, data) =>
    recording.record(`reuse-${event}`, { ...data }),
  );
  capture.noteHint();
  const read = capture.read();
  assert.ok(read);
  const group = capture.queue({ diagnosticOperation: 'group' });
  assert.ok(group);
  group.admitted();
  group.start();
  const dm = capture.queue(
    { diagnosticOperation: 'handle-read', handleRead: read },
    'interactive',
  );
  group.finish(true);
  assert.ok(dm);
  dm.admitted();
  dm.start();
  dm.finish(false);
  for (let i = 0; i < 1600; i++) recording.record('request-start');
  const flows = recording.report().deliveryFlow;
  assert.equal(flows.authority[0]?.events[0]?.authorityKind, 'group');
  assert.equal(flows.authority[1]?.events[0]?.handleRead, read.slot);
  assert.equal(flows.authority[1]?.events.at(-1)?.workPhase, 'failed');
  const next = new CaptureWork(() =>
    assert.fail('foreign token or stopped work emitted'),
  );
  next.markRead(read, 'start');
  capture.stop();
  dm.start();
  assert.equal(capture.read(), undefined);
});
function pairedReport() {
  const record = new Recording();
  record.record('reuse-ready', { handleTimings: true, handleRevision: 2 });
  record.record('reuse-handle-delivery', {
    handleStage: 'paired',
    handlePairFingerprint: 'a'.repeat(32),
  });
  return record;
}
await test('cross-device comparison joins the same tag and uses clock bounds instead of wall-clock subtraction', () => {
  const from = pairedReport(),
    to = pairedReport();
  from.record('send-action', {
    composer: 1,
    gesture: 1,
    cause: 'button',
    sendDisabled: false,
    mediaKind: 'text',
    viewOnce: false,
    scope: 'handle',
  });
  from.record('reuse-send', {
    message: 3,
    sendStage: 'submit',
    sendPhase: 'point',
  });
  from.record('reuse-handle-delivery', {
    message: 1,
    senderMessage: 3,
    handleStage: 'submit',
  });
  for (const record of [from, to])
    record.record('reuse-handle-delivery', {
      message: 1,
      handleStage: 'linked',
      handleTag: 'b'.repeat(32),
    });
  const a = from.report(),
    b = to.report();
  a.startedAtUnixMs = 1800000000000;
  b.startedAtUnixMs = a.startedAtUnixMs + 5000;
  a.elapsedMs = b.elapsedMs = 400;
  a.clock = {
    available: true,
    consistent: true,
    samples: 1,
    offsetMinMs: -5,
    offsetMaxMs: 5,
  };
  b.clock = {
    available: true,
    consistent: true,
    samples: 1,
    offsetMinMs: -5005,
    offsetMaxMs: -4995,
  };
  a.handleDelivery.messages[0]!.clickMs = 100;
  b.handleDelivery.messages[0]!.stages.frame = 200;
  const comparison = compareDelivery(a, b);
  assert.equal(comparison.available, true);
  assert.equal(
    comparison.messages[0]?.recipientCaptureBeforeClick,
    'confirmed',
  );
  assert.deepEqual(comparison.messages[0]?.clickToFrame, {
    minimumMs: 87,
    maximumMs: 113,
    consistent: true,
    entirelyNegative: false,
  });
  b.startedAtUnixMs += 1000;
  const late = compareDelivery(a, b).messages[0];
  assert.equal(late?.recipientCaptureBeforeClick, 'late');
  assert.equal(late?.fullCapture, false);
  assert.equal(
    late?.clickToFrame,
    null,
    'nonoverlapping captures cannot claim complete delivery',
  );
  b.startedAtUnixMs -= 1000;
  a.elapsedMs = 150;
  assert.equal(
    compareDelivery(a, b).messages[0]?.senderCaptureThroughFrame,
    'stopped-before-frame',
  );
  a.elapsedMs = 400;
  b.handleDelivery.pairFingerprint = 'c'.repeat(32);
  assert.equal(compareDelivery(a, b).available, false);
  b.handleDelivery.pairFingerprint = a.handleDelivery.pairFingerprint;
  b.clock.available = false;
  assert.equal(compareDelivery(a, b).reason, 'server-clock-unavailable');
});

await test('load capabilities link only their capture and expire before later authority work', () => {
  const fields: Record<string, unknown>[] = [];
  const capture = new CaptureWork((_event, data) => fields.push({ ...data }));
  let active = true;
  const points: string[] = [];
  const token = capture.load({
    slot: 2,
    startedMs: 0,
    active: () => active,
    point: (stage) => points.push(stage),
  });
  assert.ok(token);
  const owner = {};
  const linked = capture.queue(
    { diagnosticLoad: token, diagnosticOperation: 'group-directory' },
    undefined,
    owner,
  );
  linked?.admitted();
  linked?.start();
  linked?.finish(true);
  assert.ok(fields.every((field) => field['load'] === 2));
  assert.ok(fields.every((field) => field['authorityQueue'] === 1));
  assert.deepEqual(points, ['vault-acquired']);
  active = false;
  capture.queue({ diagnosticLoad: token }, undefined, owner);
  assert.equal(fields.at(-1)?.['load'], undefined);
  const other = new CaptureWork((_event, data) => fields.push({ ...data }));
  active = true;
  other.queue({ diagnosticLoad: token });
  assert.equal(fields.at(-1)?.['load'], undefined);
  const late = capture.queue({
    diagnosticLoad: token,
    diagnosticOperation: 'group-directory',
  });
  capture.stop();
  late?.start();
  assert.deepEqual(points, ['vault-acquired']);
  assert.equal(capture.loadSlot(token), undefined);
});

await test('startup linkage exports anonymous slots and clocks and rejects arbitrary categories and capabilities', () => {
  const trace = readChatSyncTrace({
    version: 1,
    source: 1,
    conversation: 0,
    event: 'authority-work',
    reason: 'settled',
    load: 2,
    loadMs: 1170,
    authorityQueue: 3,
    workClockMs: 1870,
    authorityKind: 'sensitive-account-label',
    diagnosticLoad: { owner: 'private-key' },
    accountId: 'private-account',
    loadClockMs: NaN,
  });
  assert.ok(trace);
  assert.equal(trace.authorityQueue, 3);
  assert.equal(trace.workClockMs, 1870);
  assert.equal(trace.load, 2);
  assert.equal(trace.authorityKind, undefined);
  assert.equal(trace.loadClockMs, undefined);
  assert.doesNotMatch(
    JSON.stringify(trace),
    /private|sensitive|diagnosticLoad/u,
  );
});
