import { ViewOnceMediaBuffer } from '../src/client/view-once-media-buffer/index.ts';
import { transferProtected } from '../src/client/view-once-ui/transfer.ts';
import { ContactsScreenDiagnostics } from '../src/client/contacts/diagnostics.ts';
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
import { ConversationPreviewLoader } from '../src/client/conversation-preview/index.ts';

await test('verified group and preview publication include a visible-frame opportunity and honest empty states', async (t) => {
  const { recording } = fixture(t);
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );
  const previousFrame = Object.getOwnPropertyDescriptor(
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
    if (previousDocument)
      Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (previousFrame)
      Object.defineProperty(globalThis, 'requestAnimationFrame', previousFrame);
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  });
  const host = {
    isConnected: true,
    closest: () => null,
    getClientRects: () => [{}],
  } as unknown as HTMLElement;
  const groups = loadingPresentation('group-directory');
  const groupPreviews = loadingPresentation('group-previews');
  await groupPreviews.run(() => Promise.resolve(0));
  await groups.run(() => Promise.resolve(0));
  const previews = new ConversationPreviewLoader({
    load: () => Promise.resolve(new Map()),
    changed() {},
  });
  await previews.prepare([]);
  assert.equal(
    recording
      .report()
      .loading.operations.every(
        (operation) => operation.presentation === 'unavailable',
      ),
    true,
  );
  groups.presented(host);
  groupPreviews.presented(host);
  previews.presented(host);
  for (const frame of frames.splice(0)) frame(0);
  const operations = recording.report().loading.operations;
  assert.deepEqual(
    operations.map((operation) => operation.kind),
    ['group-previews', 'group-directory', 'conversation-previews'],
  );
  assert.equal(
    operations.every(
      (operation) =>
        operation.rows === 0 &&
        operation.outcome === 'complete' &&
        operation.presentation === 'dom-frame-opportunity',
    ),
    true,
  );
  assert.equal(
    operations.every(
      (operation) =>
        operation.stages.verified &&
        operation.stages.published &&
        operation.stages.dom &&
        operation.stages.frame,
    ),
    true,
  );
});

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
  assert.deepEqual(await transport.readJson(response), { private: 'content' });
  const events = recording
    .report()
    .events.filter((event) => event.kind === 'reuse-native-request');
  assert.deepEqual(
    events.map((event) => event['nativePhase']),
    ['start', 'transfer', 'headers', 'transfer', 'body', 'json'],
  );
  assert.equal(
    events.find((event) => event['nativePhase'] === 'headers')!['nativeStatus'],
    409,
  );
  assert.equal(
    events.find((event) => event['nativePhase'] === 'body')!['nativeBytes'],
    21,
  );
  assert.equal(events[0]!['nativeCategory'], 'messages/view-once-status');
  const category =
    recording.report().nativeRequests.categories['messages/view-once-status']!;
  assert.equal(category.statuses['409'], 1);
  assert.equal(category.completed, 1);
  const exported = JSON.stringify(recording.report());
  assert.doesNotMatch(
    exported,
    /secret-identity|"private"|content|Set-Cookie/u,
  );
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
  for (let n = 0; n < 1800; n++) recording.record('later-work');
  const report = recording.report();
  assert.ok(report.loading.startup.droppedEarlyEvents > 0);
  assert.ok(
    report.loading.startup.details.events.some(
      (event) => event.kind === 'reuse-work',
    ),
  );
  assert.ok(
    report.loading.startup.details.events.some(
      (event) => event['loadStage'] === 'failed',
    ),
  );
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
  const screen = new ContactsScreenDiagnostics();
  screen.show(host, 'settings');
  assert.equal(recording.report().loading.operations.length, 0);
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
  screen.show(host, 'contacts');
  frames.shift()!(0);
  assert.equal(
    recording.report().loading.operations.at(-1)!.kind,
    'contacts-screen',
  );
  assert.equal(
    recording.report().loading.operations.at(-1)!.outcome,
    'complete',
  );
  for (let n = 0; n < 1800; n++) recording.record('later');
  assert.ok(
    recording
      .report()
      .loading.startup.details.events.some(
        (event) =>
          event['loadKind'] === 'contacts-screen' &&
          event['loadStage'] === 'complete',
      ),
  );
});

await test('native receive, bridge conversion and JSON parsing retain separate aggregate timings after detail eviction', async (t) => {
  const { recording } = fixture(t);
  const bridge = new FixtureBridge(),
    transport = new NativeApiTransport(bridge);
  t.after(() => transport.close());
  bridge.head = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    timing: { receiveUs: 200, encodeUs: 0 },
  };
  bridge.chunks = [
    {
      ...chunk('{"private":"payload"}', true),
      timing: { receiveUs: 700, encodeUs: 90 },
    },
  ];
  const response = await transport.fetch('/api/account/contacts/snapshot', {});
  assert.deepEqual(await transport.readJson(response), { private: 'payload' });
  for (let n = 0; n < 1800; n++) recording.record('later');
  const summary =
    recording.report().nativeRequests.categories['contacts/snapshot']!;
  assert.equal(summary.timingUs['nativeReceiveUs'], 900);
  assert.equal(summary.timingUs['nativeEncodeUs'], 90);
  assert.equal(summary.counts['nativeReadBlocks'], 1);
  assert.equal(summary.counts['nativeReceiveSamples'], 2);
  assert.ok(Number.isInteger(summary.timingUs['nativeJsonParseUs']));
  assert.equal(summary.jsonReads, 1);
  bridge.chunks = [chunk('invalid JSON', true)];
  const invalid = await transport.fetch('/api/account/contacts/snapshot', {});
  await assert.rejects(transport.readJson(invalid), SyntaxError);
  assert.equal(
    recording.report().nativeRequests.categories['contacts/snapshot']!
      .jsonFailures,
    1,
  );
  assert.doesNotMatch(
    JSON.stringify(recording.report()),
    /"private"|payload|invalid JSON/u,
  );
});

await test('viewer transfer records conversion and acknowledged bytes/blocks, including a partial failure', async (t) => {
  const { recording } = fixture(t);
  const data = new Uint8Array(131073).fill(27);
  const content = {
    text: '',
    file: {
      name: 'private-name.png',
      mime: 'image/png',
      data: Buffer.from(data).toString('base64'),
    },
  };
  let calls = 0;
  const display = {
    append: (part: { offset: number; bytes: string }) => {
      assert.equal(part.offset, calls++ * 65536);
      assert.deepEqual(
        Buffer.from(part.bytes, 'base64'),
        Buffer.from(data.subarray(part.offset, part.offset + 65536)),
      );
      return Promise.resolve();
    },
  } as unknown as ProtectedDisplay;
  const trace = startLoad('view-once-image')!;
  await transferProtected({
    display,
    content,
    id: crypto.randomUUID(),
    signal: new AbortController().signal,
    diagnostic: trace,
  });
  const success = recording.report().loading.operations[0]!;
  assert.equal(success.transfer['loadTransferBytes'], 131073);
  assert.equal(success.transfer['loadTransferBlocks'], 3);
  assert.equal(success.stages['native-payload-encode']?.count, 3);
  const failure = new Error('private native failure');
  calls = 0;
  const failing = {
    append: () => (++calls === 2 ? Promise.reject(failure) : Promise.resolve()),
  } as unknown as ProtectedDisplay;
  await assert.rejects(
    transferProtected({
      display: failing,
      content,
      id: crypto.randomUUID(),
      signal: new AbortController().signal,
      diagnostic: startLoad('view-once-image'),
    }),
    (error) => error === failure,
  );
  const partial = recording.report().loading.operations[1]!;
  assert.equal(partial.transfer['loadTransferBytes'], 65536);
  assert.equal(partial.transfer['loadTransferBlocks'], 1);
  assert.equal(partial.transfer['loadTransferPlannedBytes'], 131073);
  assert.doesNotMatch(
    JSON.stringify(recording.report()),
    /private-name|private native failure/u,
  );
});

await test('validated viewer bytes bypass base64 conversion and are wiped after acknowledgement, cancellation and failure', async (t) => {
  const { recording } = fixture(t);
  for (const outcome of ['success', 'failed', 'cancelled'] as const) {
    const media = new ViewOnceMediaBuffer(),
      bytes = new Uint8Array([1, 2, 3]);
    media.adopt(bytes);
    const abort = new AbortController();
    const failure = new Error('Synthetic append failed');
    const display = {
      append: () =>
        outcome === 'failed' ? Promise.reject(failure) : Promise.resolve(),
    } as unknown as ProtectedDisplay;
    if (outcome === 'cancelled') abort.abort();
    const transfer = transferProtected({
      display,
      id: crypto.randomUUID(),
      content: {
        text: '',
        file: {
          name: 'synthetic.png',
          mime: 'image/png',
          data: 'Must not decode this field again',
        },
      },
      signal: abort.signal,
      media,
      diagnostic: startLoad('view-once-image'),
    });
    if (outcome === 'success') await transfer;
    else await assert.rejects(transfer);
    assert.deepEqual(bytes, new Uint8Array(3));
    await assert.rejects(
      media.present(() => Promise.resolve()),
      { name: 'AbortError' },
    );
  }
  assert.equal(
    recording.report().loading.operations[0]!.transfer['loadReusedBytes'],
    3,
  );
  const closed = new ViewOnceMediaBuffer();
  closed.close();
  const late = new Uint8Array([1]);
  assert.throws(() => closed.adopt(late), { name: 'AbortError' });
  assert.equal(late[0], 0);
});

await test('group preview index continuations retain one summary and presentation after more than 64 turns', async (t) => {
  const { recording } = fixture(t);
  const loading = loadingPresentation('group-previews');
  const continuation = new Error('Synthetic continuation');
  for (let turn = 0; turn < 80; turn++)
    await assert.rejects(
      loading.run(
        () => Promise.reject(continuation),
        (error) => error === continuation,
      ),
      continuation,
    );
  await loading.run(() => Promise.resolve(1));
  const report = recording.report();
  assert.equal(report.loading.operations.length, 1);
  assert.equal(report.loading.overflow, 0);
  assert.equal(report.loading.operations[0]?.rows, 1);
  assert.ok(report.loading.operations[0]?.stages.verified);
  assert.deepEqual(report.loading.groupStartupKinds, [
    'useful-directory',
    'group-directory',
    'group-previews',
  ]);
  assert.equal(report.meterRevision, 7);
});
