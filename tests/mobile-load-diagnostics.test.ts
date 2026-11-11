import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Recording } from '../src/tools/chat-diagnostics/recording.ts';
import { observeReuseDecisions } from '../src/tools/chat-diagnostics/reuse.ts';
import {
  installChatSyncDiagnostics,
  loadingPresentation,
  beginStartupCapture,
  traceChatSync,
  startLoad,
  startBootTrace,
} from '../src/client/chat-sync-diagnostics/index.ts';
import { NativeApiTransport } from '../src/client/native-api/index.ts';
import { FixtureBridge, chunk } from './fixtures/native-api-bridge.ts';
import { protectedPresentation } from '../src/client/view-once-ui/diagnostics.ts';
import type { ProtectedDisplay } from '../src/client/view-once-ui/display.ts';
import { deferred } from './fixtures/deferred.ts';

function fixture(t: TestContext, prepare?: () => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const host = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: host,
  });
  installChatSyncDiagnostics(host as Window);
  prepare?.();
  const recording = new Recording();
  const stop = observeReuseDecisions(recording.record);
  const cleanups = [stop];
  t.after(() => {
    for (const cleanup of cleanups.reverse()) cleanup();
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  return {
    recording,
    stop,
    cleanup: (work: () => void) => cleanups.push(work),
  };
}

await test('native headers, body bytes and HTTP errors are timed without exporting identities or payloads', async (t) => {
  const { recording } = fixture(t);
  const bridge = new FixtureBridge();
  const transport = new NativeApiTransport(bridge);
  t.after(() => transport.close());
  bridge.head = {
    status: 409,
    headers: { 'content-type': 'application/json' },
  };
  bridge.chunks = [chunk('{"private":"content"}', true)];
  const response = await transport.fetch(
    '/api/account/messages/view-once-status?peer=secret-identity',
    {},
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { private: 'content' });
  const events = recording
    .report()
    .events.filter((event) => event.kind === 'reuse-native-request');
  assert.deepEqual(
    events.map((event) => event['nativePhase']),
    ['start', 'headers', 'body'],
  );
  assert.equal(events[1]!['nativeStatus'], 409);
  assert.equal(events[2]!['nativeBytes'], 21);
  assert.equal(events[0]!['nativeCategory'], 'messages/view-once-status');
  const category =
    recording.report().nativeRequests.categories['messages/view-once-status']!;
  assert.equal(category.statuses['409'], 1);
  assert.equal(category.completed, 1);
  const exported = JSON.stringify(recording.report());
  assert.doesNotMatch(exported, /secret-identity|private|content|Set-Cookie/u);
  assert.equal(exported.includes(bridge.opened[0]!.id), false);
});

await test('load summaries survive timeline eviction, retain missing presentation and bound overflow', (t) => {
  const { recording } = fixture(t);
  const trace = startLoad('view-once-image', 'private-peer')!;
  trace.point('download', { loadStageMs: 110 });
  for (let n = 0; n < 1800; n++) recording.record('background');
  trace.point('native-frame', {
    loadPresentation: 'native-draw',
    loadStageMs: 5,
  });
  trace.point('complete', { loadOutcome: 'complete' });
  startLoad('history');
  for (let n = 0; n < 64; n++) {
    const extra = startLoad('image')!;
    extra.point('failed', { loadOutcome: 'failed' });
  }
  const report = recording.report();
  assert.ok(report.droppedEvents > 0);
  assert.equal(report.loading.operations.length, 64);
  assert.equal(report.loading.overflow, 2);
  assert.equal(report.loading.operations[0]!.stages.download?.durationMs, 110);
  assert.equal(report.loading.operations[0]!.presentation, 'native-draw');
  assert.equal(report.loading.operations[1]!.outcome, 'incomplete');
  assert.equal(JSON.stringify(report).includes('private-peer'), false);
});

await test('a late operation cannot cross captures and missing native timing cannot close protected content', async (t) => {
  const first = fixture(t);
  const gate = deferred<number>();
  const trace = startLoad('image')!;
  const lateBoot = startBootTrace();
  const work = trace.measure('download', () => gate.promise);
  first.stop();
  const second = new Recording();
  const stop = observeReuseDecisions(second.record);
  first.cleanup(stop);
  lateBoot({
    bootMilestone: 'snapshot',
    bootAvailable: true,
    bootActivityMs: 90,
  });
  assert.deepEqual(second.report().loading.startup.native, {});
  gate.resolve(7);
  assert.equal(await work, 7);
  assert.equal(second.report().loading.operations.length, 0);
  const attempt = startLoad('view-once-video')!;
  const presentation = {
    presented: () => Promise.reject(new Error('Private native failure')),
  } as unknown as ProtectedDisplay;
  await protectedPresentation({
    display: presentation,
    id: crypto.randomUUID(),
    signal: new AbortController().signal,
    trace: attempt,
  });
  assert.equal(second.report().loading.operations[0]!.outcome, 'unavailable');
  assert.doesNotMatch(
    JSON.stringify(second.report()),
    /Private native failure/u,
  );
});

await test('diagnostic startup is opt-in and attaching the Mac preserves early stages and in-flight attempts', async (t) => {
  const gate = deferred<number>();
  let ongoing: Promise<number> | undefined;
  const { recording, stop, cleanup } = fixture(t, () => {
    assert.equal(beginStartupCapture(), false);
    Object.assign(window, { __0xdmmeNativeDiagnostics: true });
    assert.equal(beginStartupCapture(), true);
    const startup = startLoad('app-startup', null, 0)!;
    startup.point('bridge-ready', { loadStageMs: 37 });
    const contacts = startLoad('contacts')!;
    ongoing = contacts
      .measure('vault', () => gate.promise)
      .then((value) => {
        contacts.point('complete', { loadOutcome: 'complete' });
        return value;
      });
  });
  const early = recording.report().loading;
  assert.equal(early.startup.earlyCaptureAvailable, true);
  assert.equal(early.operations.length, 2);
  assert.equal(early.operations[0]!.stages['bridge-ready']?.durationMs, 37);
  assert.ok(early.operations[0]!.startedMs <= 0);
  gate.resolve(42);
  assert.equal(await ongoing, 42);
  assert.equal(recording.report().loading.operations[1]!.outcome, 'complete');
  stop();
  const next = new Recording();
  cleanup(observeReuseDecisions(next.record));
  assert.equal(next.report().loading.startup.earlyCaptureAvailable, false);
  assert.equal(next.report().loading.operations.length, 0);
});

await test('early metadata bounds noisy work while retaining startup failures and excluding identities', (t) => {
  const { recording } = fixture(t, () => {
    Object.assign(window, { __0xdmmeNativeDiagnostics: true });
    beginStartupCapture();
    const trace = startLoad('conversation-list', 'private-contact-identity')!;
    const owner = {};
    for (let n = 0; n < 1700; n++)
      traceChatSync(owner, null, { event: 'work', reason: 'settled' });
    trace.point('permissions', { loadStageMs: 930 });
    trace.point('failed', { loadOutcome: 'failed' });
  });
  const report = recording.report();
  assert.ok(report.loading.startup.droppedEarlyEvents > 0);
  assert.equal(report.loading.operations[0]!.outcome, 'failed');
  assert.equal(
    report.loading.operations[0]!.stages.permissions?.durationMs,
    930,
  );
  assert.doesNotMatch(JSON.stringify(report), /private-contact-identity/u);
});

await test('a contact placeholder cannot complete before verified data and a visible frame; replacement cancels old presentation', async (t) => {
  const { recording } = fixture(t);
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const savedFrame = Object.getOwnPropertyDescriptor(
    globalThis,
    'requestAnimationFrame',
  );
  const frames: FrameRequestCallback[] = [];
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { visibilityState: 'visible' },
  });
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    },
  });
  t.after(() => {
    if (savedDocument)
      Object.defineProperty(globalThis, 'document', savedDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (savedFrame)
      Object.defineProperty(globalThis, 'requestAnimationFrame', savedFrame);
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  });
  let visible = false;
  const host = {
    isConnected: true,
    closest: () => null,
    getClientRects: () => (visible ? [1] : []),
  } as unknown as HTMLElement;
  const loading = loadingPresentation('contacts');
  const gate = deferred<number>();
  const work = loading.run(() => gate.promise);
  loading.presented(host);
  assert.equal(frames.length, 0);
  gate.resolve(0);
  await work;
  loading.presented(host);
  assert.equal(frames.length, 0);
  visible = true;
  loading.presented(host);
  loading.presented(host);
  assert.equal(frames.length, 1);
  loading.cancel();
  frames.shift()!(0);
  assert.equal(recording.report().loading.operations[0]!.outcome, 'cancelled');
  await loading.run((trace) => {
    trace?.point('vault', { loadStageMs: 70 });
    trace?.point('vault', { loadStageMs: 130 });
    return Promise.resolve(0);
  });
  loading.presented(host);
  frames.shift()!(0);
  const complete = recording.report().loading.operations[1]!;
  assert.equal(complete.outcome, 'complete');
  assert.equal(complete.rows, 0);
  assert.equal(complete.stages.vault?.durationMs, 200);
  assert.equal(complete.stages.vault?.count, 2);
  const failure = new Error('private failure');
  await assert.rejects(
    loading.run(() => Promise.reject(failure)),
    (error) => error === failure,
  );
  assert.equal(recording.report().loading.operations[2]!.outcome, 'failed');
  assert.doesNotMatch(JSON.stringify(recording.report()), /private failure/u);
});
