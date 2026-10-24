import { expectedInterruption } from '../src/client/synchronization-work/index.ts';
import { measureWork } from '../src/client/synchronization-diagnostics/index.ts';
import { WorkInterruption } from '../src/client/synchronization-work/index.ts';
import { ApiResponseError } from '../src/client/api-response/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import {
  installChatSyncDiagnostics,
  traceChatSync,
  traceChatSyncFailure,
  VerifiedReadCapture,
  traceVerifiedMessages,
} from '../src/client/chat-sync-diagnostics/index.ts';
import { OutgoingTexts } from '../src/client/messages/outgoing-text.ts';
import {
  chatSyncEvent,
  chatSyncControl,
} from '../src/shared/chat-sync-diagnostics/index.ts';
import { observeReuseDecisions } from '../src/tools/chat-diagnostics/reuse.ts';
import { Recording } from '../src/tools/chat-diagnostics/recording.ts';
import { ConfirmedConversations } from '../src/client/messages/confirmed-conversations.ts';
import { ConnectedConversationVisits } from '../src/client/messages/visits.ts';
import { GroupDeliveryTrace } from '../src/client/groups/delivery-trace.ts';

function fixture(t: TestContext, installed = true) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const host = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: host,
  });
  if (installed) installChatSyncDiagnostics(host as Window);
  const recording = new Recording(),
    stop = observeReuseDecisions(recording.record);
  t.after(() => {
    stop();
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  return { host, recording, stop };
}
const window = (revision = 1) => ({
  snapshot: JSON.stringify({ revision }),
  views: [{ text: 'Private synthetic message' }],
  oldest: 1,
});

await test('capture reports the exact loss of cache eligibility and correlates the same contact without identity or content', (t) => {
  const f = fixture(t),
    cache = new ConfirmedConversations<{ text: string }>();
  const peer = 'private-contact-account-id';
  cache.connection(true);
  cache.remember(peer, window());
  assert.ok(cache.reusable(peer));
  cache.hint();
  assert.equal(cache.reusable(peer), null);
  cache.confirm({ revision: 1 });
  assert.ok(cache.reusable(peer));
  cache.connection(false);
  assert.equal(cache.reusable(peer), null);
  cache.connection(true);
  assert.equal(cache.reusable(peer), null);
  cache.clear('removal');
  assert.equal(cache.reusable(peer), null);
  const events = f.recording.report().events;
  assert.equal(
    events.find((event) => event.kind === 'reuse-coverage')?.['available'],
    true,
  );
  assert.deepEqual(
    events
      .filter((event) => event.kind === 'reuse-cache-check')
      .map((event) => event['reason']),
    [
      'eligible',
      'pending-confirmation',
      'eligible',
      'disconnected',
      'epoch-mismatch',
      'missing',
    ],
  );
  const slots = new Set(
    events
      .filter(
        (event) =>
          event['conversation'] !== 0 && event['conversation'] !== undefined,
      )
      .map((event) => event['conversation']),
  );
  assert.equal(slots.size, 1);
  assert.ok(
    events.some(
      (event) =>
        event.kind === 'reuse-cache-cleared' && event['reason'] === 'removal',
    ),
  );
  assert.ok(!JSON.stringify(f.recording.report()).includes('private-contact'));
  assert.ok(
    !JSON.stringify(f.recording.report()).includes('Private synthetic'),
  );
});

await test('cache diagnostics distinguish retained stale candidates from budget eviction', (t) => {
  const f = fixture(t),
    cache = new ConfirmedConversations<{ text: string }>();
  for (let i = 0; i < 17; i++) cache.remember(String(i), window());
  assert.equal(cache.read('0'), null);
  cache.advance({ revision: 1 }, { revision: 2 }, ['1']);
  cache.confirm({ revision: 3 });
  cache.remember('huge', {
    ...window(),
    views: [{ text: 'x'.repeat(5 * 1024 * 1024) }],
  });
  cache.remember('many', {
    ...window(),
    views: Array.from({ length: 4097 }, () => ({ text: '' })),
  });
  const reasons = f.recording
    .report()
    .events.filter((event) =>
      ['reuse-cache-removed', 'reuse-cache-invalidated'].includes(event.kind),
    )
    .map((event) => event['reason']);
  for (const reason of [
    'conversation-limit',
    'message-delta',
    'snapshot-changed',
    'byte-limit',
    'row-limit',
  ])
    assert.ok(reasons.includes(reason));
});

await test('old app coverage is explicit and forged event fields never enter the report', (t) => {
  const f = fixture(t, false);
  assert.equal(f.recording.report().events[0]?.['available'], false);
  f.host.dispatchEvent(
    new CustomEvent(chatSyncEvent, {
      detail: {
        version: 1,
        source: 1,
        conversation: 2,
        event: 'navigation',
        reason: 'engine-unavailable',
        busy: true,
        maintenance: false,
        peer: 'private-id',
        content: 'private-text',
        epoch: Infinity,
      },
    }),
  );
  assert.equal(f.recording.report().events.at(-1)?.['busy'], true);
  assert.ok(!JSON.stringify(f.recording.report()).includes('private-'));
  const length = f.recording.report().events.length;
  f.host.dispatchEvent(
    new CustomEvent(chatSyncEvent, {
      detail: {
        version: 1,
        source: 1,
        conversation: 2,
        event: 'navigation',
        reason: 'private-reason',
      },
    }),
  );
  assert.equal(f.recording.report().events.length, length);
});

await test('stop disables internal capture and the ten-minute deadline cannot retain later decisions', (t) => {
  const f = fixture(t),
    owner = {};
  traceChatSync(owner, 'private-peer', {
    event: 'navigation',
    reason: 'engine-unavailable',
    busy: true,
  });
  const length = f.recording.report().events.length;
  f.stop();
  traceChatSync(owner, 'private-peer', {
    event: 'navigation',
    reason: 'restored',
  });
  assert.equal(f.recording.report().events.length, length);
  let emitted = 0;
  f.host.addEventListener(chatSyncEvent, () => emitted++);
  const stopAgain = observeReuseDecisions(f.recording.record);
  emitted = 0;
  t.mock.method(performance, 'now', () => 1_000_000);
  traceChatSync(owner, 'private-peer', {
    event: 'navigation',
    reason: 'restored',
  });
  assert.equal(emitted, 0);
  stopAgain();
});

await test('failed verification records local supersession without exporting exception text', (t) => {
  const f = fixture(t);
  traceChatSyncFailure(
    {},
    {
      reason: 'probe-failed',
      current: false,
      error: new Error('Private exception with contact data'),
    },
  );
  assert.equal(
    f.recording.report().events.at(-1)?.['failure'],
    'generation-changed',
  );
  assert.ok(
    !JSON.stringify(f.recording.report()).includes('Private exception'),
  );
});

await test('navigation distinguishes engine ownership from a retained window awaiting confirmation', (t) => {
  const f = fixture(t),
    cache = new ConfirmedConversations<{ text: string }>(),
    owner = {};
  let available = false,
    selected = 0;
  cache.connection(true);
  cache.remember('private-peer', window());
  const visits = new ConnectedConversationVisits<string>({
    connected: () => true,
    available: () => available,
    backgroundReady: () => false,
    reusable: (peer) => cache.reusable(peer) !== null,
    select: () => {
      selected++;
    },
    restore: () => true,
    background: (work) => work(),
    check: () => Promise.resolve(),
    failed: () => assert.fail('Unexpected verification failure'),
    diagnostic: (peer, reason) =>
      traceChatSync(owner, peer, {
        event: 'navigation',
        reason,
        maintenance: !available,
      }),
  });
  t.after(() => visits.reset());
  assert.equal(visits.open('private-peer'), false);
  assert.equal(selected, 0);
  available = true;
  cache.hint();
  assert.equal(visits.open('private-peer'), false);
  assert.equal(selected, 0);
  cache.confirm({ revision: 1 });
  assert.equal(visits.open('private-peer'), true);
  assert.equal(selected, 1);
  const navigation = f.recording
    .report()
    .events.filter((event) => event.kind === 'reuse-navigation');
  assert.deepEqual(
    navigation.map((event) => event['reason']),
    ['engine-unavailable', 'window-unavailable', 'restored'],
  );
  assert.equal(navigation[0]?.['maintenance'], true);
});

await test('local work diagnostics identify queue/run timings and cancellation cause without logging error text or secrets', async (t) => {
  const f = fixture(t),
    owner = {};
  await measureWork(
    owner,
    'group-preparation',
    () => Promise.resolve(),
    performance.now() - 12,
  );
  const error = new ApiResponseError({
    operation: 'messages/group-message-confirm',
    status: 0,
    failure: 'cancelled',
    cause: new WorkInterruption('replacement'),
    message: 'Private content must never appear',
  });
  await assert.rejects(
    measureWork(owner, 'messages/group-message-confirm', () =>
      Promise.reject(error),
    ),
  );
  await assert.rejects(
    measureWork(owner, 'sdk-open', () =>
      Promise.reject(new DOMException('Private secret', 'TimeoutError')),
    ),
  );
  const events = f.recording
    .report()
    .events.filter((event) => event.kind === 'reuse-work');
  assert.equal(events.length, 3);
  assert.equal(events[0]?.['outcome'], 'complete');
  assert.ok(Number(events[0]?.['queueMs']) >= 12);
  assert.equal(events[1]?.['operation'], 'messages/group-message-confirm');
  assert.equal(events[1]?.['outcome'], 'interrupted');
  assert.equal(events[1]?.['origin'], 'replacement');
  assert.equal(events[2]?.['outcome'], 'timeout');
  assert.ok(!JSON.stringify(events).includes('Private'));
});

await test('authorization status takes precedence over an expected body-cancellation cause', async (t) => {
  const f = fixture(t);
  for (const status of [401, 403, 409]) {
    const error = new ApiResponseError({
      operation: 'messages/group-message-confirm',
      status,
      failure: 'cancelled',
      cause: new WorkInterruption('scheduler'),
    });
    assert.equal(expectedInterruption(error), false);
    await assert.rejects(
      measureWork({}, 'messages/group-message-confirm', () =>
        Promise.reject(error),
      ),
    );
  }
  const outcomes = f.recording
    .report()
    .events.filter((event) => event.kind === 'reuse-work')
    .map((event) => event['outcome']);
  assert.deepEqual(outcomes, ['authorization', 'authorization', 'conflict']);
});

await test('group delivery steps share one per-capture slot per message and never export its ID or content', (t) => {
  const f = fixture(t),
    trace = new GroupDeliveryTrace();
  const one = crypto.randomUUID(),
    two = crypto.randomUUID();
  for (const step of ['admitted', 'staged', 'sending'] as const)
    trace.step(step, one);
  trace.step('admitted', two);
  trace.step('accepted', one);
  trace.rendered('group-a', [{ id: 'old', own: false }]);
  trace.hint();
  trace.rendered('group-a', [
    { id: 'old', own: false },
    { id: 'new', own: false },
    { id: one, own: true },
  ]);
  trace.rendered('group-b', [{ id: 'other', own: false }]);
  const events = f.recording.report().events;
  const sends = events.filter((event) => event.kind === 'reuse-group-send');
  assert.deepEqual(
    sends.map((event) => [event['reason'], event['message']]),
    [
      ['admitted', 1],
      ['staged', 1],
      ['sending', 1],
      ['admitted', 2],
      ['accepted', 1],
    ],
  );
  assert.deepEqual(
    events
      .filter((event) => event.kind === 'reuse-group-receive')
      .map((event) => [event['reason'], event['rows'] ?? 0]),
    [
      ['live-hint', 0],
      ['presented', 1],
    ],
    'The first drawing of each group is only a baseline',
  );
  const serialized = JSON.stringify(events);
  for (const secret of [one, two, 'group-a', 'new'])
    assert.equal(serialized.includes(secret), false);
  f.stop();
  trace.step('settled', one);
  assert.equal(
    f.recording
      .report()
      .events.filter((event) => event.kind === 'reuse-group-send').length,
    5,
  );
});

await test('direct staging, acceptance and verified commits use content-free slots and require confirmation', (t) => {
  const f = fixture(t),
    outgoing = new OutgoingTexts();
  const draft = {
    id: crypto.randomUUID(),
    peer: 'private-peer',
    text: 'private plaintext',
  };
  outgoing.update(draft, 'admitted');
  outgoing.update(draft, 'saved');
  outgoing.acknowledge(draft);
  outgoing.acknowledge(draft);
  const failed = { ...draft, id: crypto.randomUUID() };
  outgoing.update(failed, 'admitted');
  outgoing.update(failed, 'save-failed');
  const row = {
    id: crypto.randomUUID(),
    own: false,
    kind: 'text',
    text: 'private received content',
  };
  const read = new VerifiedReadCapture({}, 'direct');
  read.collect([row]);
  assert.equal(
    f.recording
      .report()
      .events.some((event) => event.kind === 'reuse-direct-receive'),
    false,
  );
  read.confirm();
  traceVerifiedMessages({}, 'direct', [
    row,
    { ...row, id: 'private-profile', kind: 'profile' },
    { ...row, id: 'private-own', own: true },
  ]);
  const events = f.recording.report().events;
  assert.deepEqual(
    events
      .filter((event) => event.kind === 'reuse-direct-send')
      .map((event) => event['reason']),
    ['admitted', 'staged', 'accepted', 'admitted'],
  );
  assert.equal(
    events.filter((event) => event.kind === 'reuse-direct-receive').length,
    1,
  );
  for (const secret of [
    draft.id,
    draft.peer,
    draft.text,
    row.id,
    row.text,
    'private-profile',
    'private-own',
  ])
    assert.equal(JSON.stringify(events).includes(secret), false);
});
await test('verified read diagnostics reject old captures and report bounded metadata coverage', (t) => {
  const f = fixture(t),
    stale = new VerifiedReadCapture({}, 'group');
  stale.collect([{ id: 'old-message', own: false, kind: 'text' }]);
  f.host.dispatchEvent(new CustomEvent(chatSyncControl, { detail: 'stop' }));
  f.host.dispatchEvent(new CustomEvent(chatSyncControl, { detail: 'start' }));
  stale.confirm();
  assert.equal(
    f.recording
      .report()
      .events.some((event) => event.kind === 'reuse-group-receive'),
    false,
  );
  const read = new VerifiedReadCapture({}, 'group');
  read.collect(
    Array.from({ length: 257 }, (_, index) => ({
      id: `message-${index}`,
      own: false,
      kind: 'text',
    })),
  );
  read.confirm();
  const events = f.recording.report().events;
  assert.equal(
    events.filter((event) => event.kind === 'reuse-group-receive').length,
    256,
  );
  assert.equal(
    events.filter((event) => event.kind === 'reuse-coverage-limited').length,
    1,
  );
  assert.equal(JSON.stringify(events).includes('message-'), false);
});
