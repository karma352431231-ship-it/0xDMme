import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HandleDeliveryCapture } from '../src/client/chat-sync-diagnostics/handle-delivery.ts';
import {
  installChatSyncDiagnostics,
  traceHandleDelivery,
} from '../src/client/chat-sync-diagnostics/index.ts';
import { observeDmRows } from '../src/client/communities/dm-delivery.ts';
import {
  chatSyncControl,
  readChatSyncTrace,
} from '../src/shared/chat-sync-diagnostics/index.ts';
import { Recording } from '../src/tools/chat-diagnostics/recording.ts';
import { observeReuseDecisions } from '../src/tools/chat-diagnostics/reuse.ts';
import { deferred } from './fixtures/deferred.ts';

function recorder() {
  const linked = deferred<string>();
  const recording = new Recording();
  const capture = new HandleDeliveryCapture((fields) => {
    const trace = readChatSyncTrace({
      ...fields,
      event: 'handle-delivery',
      reason: 'settled',
      version: 1,
      source: 1,
      conversation: 0,
    });
    assert.ok(trace);
    const { event: kind, ...data } = trace;
    recording.record(`reuse-${kind}`, data);
    if (trace.handleTag) linked.resolve(trace.handleTag);
  });
  return { capture, recording, linked: linked.promise };
}

await test('paired reports match the same public message and keep milestones after timeline eviction', async () => {
  const from = recorder(),
    to = recorder(),
    other = recorder();
  const id = crypto.randomUUID(),
    code = crypto.randomUUID().replaceAll('-', '');
  for (const side of [from, to]) side.capture.pair(code);
  other.capture.pair(crypto.randomUUID().replaceAll('-', ''));
  assert.equal(
    to.capture.mark(id, 'dom'),
    false,
    'a cached row is not a new delivery',
  );
  from.capture.mark(id, 'submit');
  from.capture.mark(id, 'accepted');
  other.capture.mark(id, 'submit');
  for (const stage of [
    'downloaded',
    'decrypt-start',
    'decrypted',
    'verified',
    'stored',
    'dom',
    'frame',
  ] as const)
    assert.equal(to.capture.mark(id, stage), true);
  assert.equal(
    to.capture.mark(id, 'dom'),
    false,
    'a refresh of the same row is not another delivery',
  );
  const [senderTag, recipientTag, unrelatedTag] = await Promise.all([
    from.linked,
    to.linked,
    other.linked,
  ]);
  assert.equal(senderTag, recipientTag);
  assert.notEqual(senderTag, unrelatedTag);
  for (let i = 0; i < 1600; i++) to.recording.record('request-start');
  const report = to.recording.report();
  assert.ok(report.droppedEvents > 0);
  const [message] = report.handleDelivery.messages;
  assert.equal(message?.tag, senderTag);
  assert.equal(typeof message?.stages.frame, 'number');
  assert.ok(report.startedAtUnixMs > 0);
  for (const value of [id, code])
    assert.ok(!JSON.stringify(report).includes(value));
  for (const side of [from, to, other]) side.capture.stop();
  assert.equal(to.capture.mark(crypto.randomUUID(), 'downloaded'), false);
});

await test('the diagnostic bridge drops arbitrary fields and tags outside paired link events', () => {
  const trace = readChatSyncTrace({
    version: 1,
    event: 'handle-delivery',
    reason: 'settled',
    source: 1,
    conversation: 0,
    message: 2,
    handleStage: 'dom',
    handleTag: 'f'.repeat(32),
    handlePair: 'e'.repeat(32),
    text: 'Synthetic message text',
  });
  assert.ok(trace);
  assert.equal(trace.handleStage, 'dom');
  assert.equal(trace.handleTag, undefined);
  assert.equal(Object.hasOwn(trace, 'handlePair'), false);
  assert.equal(Object.hasOwn(trace, 'text'), false);
});

await test('public receive marks a new visible DOM row and distinguishes a row outside the scrollport', (t) => {
  const host = new EventTarget();
  const frames: FrameRequestCallback[] = [];
  const restore: (() => void)[] = [];
  for (const [name, value] of Object.entries({
    window: host,
    document: { visibilityState: 'visible' },
    innerWidth: 800,
    innerHeight: 600,
    requestAnimationFrame: (callback: FrameRequestCallback) =>
      frames.push(callback),
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    restore.push(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  installChatSyncDiagnostics(host as Window);
  const report = new Recording(),
    stop = observeReuseDecisions(report.record);
  t.after(() => {
    host.dispatchEvent(new CustomEvent(chatSyncControl, { detail: 'stop' }));
    stop();
    for (const reset of restore) reset();
  });
  const history = {
    closest: () => null,
    getBoundingClientRect: () => ({
      top: 30,
      bottom: 500,
      left: 0,
      right: 800,
    }),
  } as unknown as HTMLElement;
  const rows = new Map<string, HTMLElement>();
  for (const [id, top] of [
    ['visible', 100],
    ['offscreen', 510],
    ['reused', 100],
  ] as const) {
    traceHandleDelivery(id, 'downloaded');
    rows.set(id, {
      parentElement: history,
      getBoundingClientRect: () => ({
        top,
        bottom: top + 30,
        left: 20,
        right: 150,
      }),
    } as unknown as HTMLElement);
  }
  observeDmRows({
    history,
    messages: [...rows.keys()].map((id) => ({ id, own: false })),
    row: (id) => rows.get(id),
    previous: new Set(['reused']),
    signal: new AbortController().signal,
  });
  assert.equal(frames.length, 1);
  const before = report.report().handleDelivery.messages;
  assert.equal(typeof before[0]?.stages.dom, 'number');
  assert.equal(before[0]?.stages.frame, undefined);
  frames[0]?.(performance.now());
  const after = report.report().handleDelivery.messages;
  assert.equal(typeof after[0]?.stages.frame, 'number');
  assert.equal(typeof after[1]?.stages.offscreen, 'number');
  assert.equal(after[2]?.stages.dom, undefined);
});
