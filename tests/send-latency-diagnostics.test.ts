import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Recording } from '../src/tools/chat-diagnostics/recording.ts';
import { sendCases } from '../src/tools/chat-diagnostics/sends.ts';
import {
  installChatSyncDiagnostics,
  measureSend,
  measureSendSync,
  traceSend,
  traceSendChecks,
} from '../src/client/chat-sync-diagnostics/index.ts';
import { observeReuseDecisions } from '../src/tools/chat-diagnostics/reuse.ts';
import { requestCategory } from '../src/tools/chat-diagnostics/network.ts';
import { deferred } from './fixtures/deferred.ts';

function fixture(t: TestContext) {
  let ms = 0;
  t.mock.method(performance, 'now', () => ms);
  const recording = new Recording();
  return {
    recording,
    at: (time: number) => {
      ms = time;
    },
  };
}
function bridge(t: TestContext) {
  const previous = ['window', 'document'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const host = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: host,
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { visibilityState: 'visible' },
  });
  installChatSyncDiagnostics(host as Window);
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return host;
}

await test('all five summaries survive busy background traffic and distinguish acceptance, check and perception', (t) => {
  const f = fixture(t),
    r = f.recording;
  r.record('reuse-coverage', { sendTimings: true });
  for (const [index, label] of sendCases.entries()) {
    const start = index * 1000;
    f.at(start);
    r.beginSend(label);
    f.at(start + 10);
    r.record('reuse-send', {
      message: index + 1,
      sendStage: 'submit',
      sendPhase: 'point',
    });
    r.record('reuse-send', {
      message: index + 1,
      sendStage: 'draft-seal',
      sendPhase: 'start',
    });
    f.at(start + 15);
    r.record('reuse-send', {
      message: index + 1,
      sendStage: 'draft-seal',
      sendPhase: 'end',
      sendMs: 5,
      sendSuccess: true,
    });
    if (label !== 'text') {
      for (const part of [1, 2]) {
        f.at(start + 20);
        r.record('request-start', {
          id: `part-${index}-${part}`,
          category: 'messages/view-once-part',
        });
      }
      for (const part of [2, 1]) {
        f.at(start + 120);
        const id = `part-${index}-${part}`;
        r.record('response-headers', { id, status: 200 });
        r.record('response-body', { id });
      }
    }
    f.at(start + 130);
    r.record('reuse-send', {
      message: index + 1,
      sendStage: 'accepted',
      sendPhase: 'point',
    });
    for (let n = 0; n < 1600; n++) r.record('background', { n });
    f.at(start + 170);
    r.record('reuse-send', {
      message: index + 1,
      sendStage: 'check-render',
      sendPhase: 'point',
    });
    f.at(start + 250);
    r.record('manual-marker');
  }
  const report = r.report();
  assert.equal(report.events.length, 1500);
  assert.ok(report.droppedEvents > 6500);
  assert.equal(report.comparison.sends.length, 5);
  for (const send of report.comparison.sends) {
    assert.equal(send.complete, true);
    const timing = send.stages['draft-seal'];
    assert.ok(timing);
    assert.equal(timing.firstStartMs, send.selectedMs + 10);
    assert.equal(timing.lastEndMs, send.selectedMs + 15);
    assert.equal(timing.durationMs, 5);
    assert.equal(send.clickToAcceptanceMs, 120);
    assert.equal(send.clickToCheckMs, 160);
    assert.equal(send.manualMarkerMs! - send.checkRenderMs!, 80);
    if (send.label !== 'text') {
      assert.equal(
        send.upload.wallMs,
        100,
        'Overlap counts once, not once per part.',
      );
      assert.equal(send.upload.peakInFlight, 2);
      assert.equal(send.upload.completedParts, 2);
    }
  }
  assert.equal(r.beginSend('text'), null);
  assert.equal(r.report().comparison.overflow, 1);
  report.comparison.sends[0]!.stages['draft-seal']!.count = 99;
  assert.equal(r.report().comparison.sends[0]!.stages['draft-seal']!.count, 1);
  r.stop();
  const stopped = r.report();
  r.record('late');
  assert.equal(r.beginSend('text'), null);
  assert.deepEqual(r.report(), stopped);
});

await test('HTTP success never becomes acceptance; interrupted uploads and old-app stages are explicit', (t) => {
  const { recording: r } = fixture(t);
  r.beginSend('view-once-video');
  r.record('request-start', {
    id: 'publication',
    category: 'messages/publish',
  });
  r.record('response-headers', { id: 'publication', status: 200 });
  r.record('response-body', { id: 'publication' });
  r.record('request-start', {
    id: 'part',
    category: 'messages/view-once-part',
  });
  r.record('request-start', {
    id: 'failed',
    category: 'messages/view-once-part',
  });
  r.record('request-failed', { id: 'failed' });
  const report = r.report().comparison;
  const send = report.sends[0]!;
  assert.equal(report.internalStagesAvailable, false);
  assert.notEqual(send.publishResponseMs, null);
  assert.equal(send.acceptedMs, null);
  assert.equal(send.complete, false);
  assert.equal(send.upload.failedParts, 1);
  assert.equal(send.upload.inFlight, 1);
  assert.ok(send.missingStages.includes('checkRenderMs'));
  assert.ok(send.missingStages.includes('in-flight-parts'));
});

await test('fixed network upload categories exclude query values and foreign requests', (t) => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { href: 'https://0xdmme.app/', origin: 'https://0xdmme.app' },
  });
  t.after(() => {
    if (before) Object.defineProperty(globalThis, 'location', before);
    else Reflect.deleteProperty(globalThis, 'location');
  });
  for (const op of [
    'attachment-reserve',
    'attachment-part',
    'attachment-finish',
    'view-once-create',
    'view-once-part',
  ])
    assert.equal(
      requestCategory(`/api/account/messages/${op}?secret=private`),
      `messages/${op}`,
    );
  assert.equal(
    requestCategory('/api/account/messages/private-file-name'),
    'other-account-api',
  );
  assert.equal(
    requestCategory('https://other.test/api/account/messages/view-once-part'),
    null,
  );
});

await test('an early perception marker cannot hide overlapping sends or unfinished preparation', (t) => {
  const { recording: r } = fixture(t);
  r.record('reuse-coverage', { sendTimings: true });
  r.beginSend('text');
  r.record('reuse-send', {
    message: 1,
    sendStage: 'submit',
    sendPhase: 'point',
  });
  r.record('reuse-send', {
    message: 1,
    sendStage: 'draft-seal',
    sendPhase: 'start',
  });
  r.record('manual-marker');
  r.beginSend('ordinary-image');
  const [first, second] = r.report().comparison.sends;
  assert.equal(first?.ambiguous, true);
  assert.equal(second?.ambiguous, true);
  assert.ok(first?.missingStages.includes('in-flight-stage'));
  assert.equal(first?.complete, false);
});

await test('the opt-in bridge preserves failures, isolates captures and marks the accepted DOM check exactly once', async (t) => {
  let stop = () => {};
  t.after(() => stop());
  bridge(t);
  const f = fixture(t),
    r = f.recording;
  stop = observeReuseDecisions(r.record);
  r.beginSend('text');
  const id = 'private-message-id';
  traceSend('submit', id);
  let laidOut = false;
  const history = {
    isConnected: true,
    getClientRects: () => (laidOut ? [{}] : []),
    closest: () => null,
    querySelectorAll: () => [
      { dataset: { message: id }, querySelector: () => ({}) },
    ],
  } as unknown as HTMLElement;
  traceSendChecks(history);
  assert.equal(r.report().comparison.sends[0]!.checkRenderMs, null);
  f.at(100);
  traceSend('accepted', id);
  traceSendChecks(history);
  assert.equal(r.report().comparison.sends[0]!.checkRenderMs, null);
  f.at(120);
  laidOut = true;
  traceSendChecks(history);
  f.at(150);
  traceSendChecks(history);
  r.record('manual-marker');
  const send = r.report().comparison.sends[0]!;
  assert.equal(send.acceptedMs, 100);
  assert.equal(send.checkRenderMs, 120);
  assert.equal(r.report().comparison.internalStagesAvailable, true);
  const failure = new Error('private error content');
  assert.throws(
    () =>
      measureSendSync('content-encode', () => {
        throw failure;
      }),
    (error: unknown) => error === failure,
  );
  await assert.rejects(
    measureSend('draft-open', () => Promise.reject(failure)),
    (error: unknown) => error === failure,
  );
  const gate = deferred<number>();
  const pending = measureSend('draft-seal', () => gate.promise, id);
  stop();
  stop = observeReuseDecisions(r.record);
  const length = r.report().events.length;
  gate.resolve(17);
  assert.equal(await pending, 17);
  assert.equal(r.report().events.length, length);
  assert.doesNotMatch(
    JSON.stringify(r.report()),
    /private-message-id|private error content/u,
  );
});
