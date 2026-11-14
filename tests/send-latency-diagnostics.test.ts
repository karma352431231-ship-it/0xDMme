import { chatSyncControl } from '../src/shared/chat-sync-diagnostics/index.ts';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Recording } from '../src/tools/chat-diagnostics/recording.ts';
import type { MediaKind } from '../src/tools/chat-diagnostics/composition.ts';
import {
  installChatSyncDiagnostics,
  beginPrivateSend,
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

function submit(
  recording: Recording,
  gesture: number,
  mediaKind: MediaKind = 'text',
  viewOnce = false,
): void {
  recording.record('send-action', {
    scope: 'private',
    composer: 1,
    gesture,
    cause: 'button',
    sendDisabled: false,
    sendHidden: false,
    formHidden: false,
    mediaKind,
    viewOnce,
    selection: mediaKind === 'text' ? 0 : gesture,
    fileCount: mediaKind === 'text' ? 0 : 1,
    fileBytes: mediaKind === 'text' ? 0 : 100,
  });
}

await test('all five summaries survive busy background traffic and distinguish acceptance, check and perception', (t) => {
  const f = fixture(t),
    r = f.recording;
  r.record('reuse-coverage', { sendTimings: true });
  const cases = [
    { kind: 'text', once: false },
    { kind: 'image', once: false },
    { kind: 'image', once: true },
    { kind: 'video', once: false },
    { kind: 'video', once: true },
  ] satisfies { kind: MediaKind; once: boolean }[];
  for (const [index, entry] of cases.entries()) {
    const start = index * 1000;
    f.at(start);
    if (entry.kind !== 'text')
      r.record('attachment-selection', {
        composer: 1,
        selection: index + 1,
        mediaKind: entry.kind,
        viewOnce: entry.once,
      });
    f.at(start + 10);
    submit(r, index + 1, entry.kind, entry.once);
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
    if (entry.kind !== 'text') {
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
    assert.equal(timing.firstStartMs, send.submitMs);
    assert.equal(timing.lastEndMs, send.submitMs! + 5);
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
  for (let gesture = 6; gesture <= 33; gesture++) submit(r, gesture);
  assert.equal(r.report().comparison.overflow, 1);
  report.comparison.sends[0]!.stages['draft-seal']!.count = 99;
  assert.equal(r.report().comparison.sends[0]!.stages['draft-seal']!.count, 1);
  r.stop();
  const stopped = r.report();
  r.record('late');
  submit(r, 7);
  assert.deepEqual(r.report(), stopped);
});

await test('HTTP success never becomes acceptance; interrupted uploads and old-app stages are explicit', (t) => {
  const { recording: r } = fixture(t);
  submit(r, 1, 'video', true);
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
  submit(r, 1);
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
  submit(r, 2, 'image');
  const [first, second] = r.report().comparison.sends;
  assert.equal(first?.ambiguous, true);
  assert.equal(second?.ambiguous, true);
  assert.ok(first?.missingStages.includes('in-flight-stage'));
  assert.equal(first?.complete, false);
});

await test('an absent perception marker or hidden accepted row does not contaminate the next send attribution', (t) => {
  const { recording: r } = fixture(t);
  r.record('reuse-coverage', { sendTimings: true });
  submit(r, 1);
  for (const sendStage of [
    'submit',
    'staging-complete',
    'transfer-complete',
    'accepted',
    'ui-available',
  ])
    r.record('reuse-send', { message: 1, sendStage, sendPhase: 'point' });
  r.record('reuse-send', {
    message: 1,
    sendStage: 'ui-blocked',
    sendPhase: 'point',
    sendBlock: 'engine',
  });
  submit(r, 2);
  const [first, second] = r.report().comparison.sends;
  assert.equal(first!.ambiguous, false);
  assert.equal(second!.ambiguous, false);
  assert.equal(first!.acceptance, 'accepted');
  assert.equal(first!.render, 'absent-after-acceptance');
  assert.equal(second!.render, 'awaiting-acceptance');
  assert.notEqual(first!.stagingCompleteMs, null);
  assert.notEqual(first!.transferCompleteMs, null);
  assert.notEqual(first!.uiAvailableMs, null);
  assert.deepEqual(first!.blockingReasons, ['engine']);
});

await test('late signature results refine the matching send after another file is selected', (t) => {
  const { recording: r } = fixture(t);
  r.record('attachment-selection', {
    composer: 1,
    selection: 1,
    mediaKind: 'video',
    viewOnce: false,
  });
  submit(r, 1, 'video');
  r.record('manual-marker');
  r.record('attachment-selection', {
    composer: 1,
    selection: 2,
    mediaKind: 'video',
    viewOnce: true,
  });
  submit(r, 2, 'video', true);
  r.record('attachment-inspected', {
    composer: 1,
    selection: 1,
    mediaKind: 'image',
    fileBytes: 100,
    fileCount: 1,
    fileSlots: ['file-1'],
    signatureFiles: 1,
    inspectedFiles: 1,
    inspectionPending: false,
    mimeMismatch: true,
  });
  const report = r.report().comparison;
  assert.equal(report.sends[0]?.label, 'ordinary-image');
  assert.equal(report.sends[0]?.mimeMismatch, true);
  assert.deepEqual(report.sends[0]?.fileSlots, ['file-1']);
  assert.equal(report.sends[1]?.label, 'view-once-video');
});

await test('the opt-in bridge preserves failures, isolates captures and marks the accepted DOM check exactly once', async (t) => {
  let stop = () => {};
  t.after(() => stop());
  bridge(t);
  const f = fixture(t),
    r = f.recording;
  stop = observeReuseDecisions(r.record);
  submit(r, 1);
  const id = 'private-message-id';
  const event = new Event('submit');
  window.dispatchEvent(
    new CustomEvent(chatSyncControl, {
      detail: {
        privateSubmission: {
          event,
          composer: 1,
          gesture: 1,
          clock: Math.round(performance.now()),
        },
      },
    }),
  );
  beginPrivateSend(id, event);
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
