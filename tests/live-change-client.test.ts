import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveChangeCategories } from '../src/shared/live-changes/index.ts';
import { WakeupFrames } from '../src/client/message-live/protocol.ts';
import { scopedLiveEvent } from '../src/client/message-live/index.ts';
import { liveSignal } from '../src/client/message-live/signals.ts';
import { LiveRequest } from '../src/client/message-live/request.ts';
import { MessageLiveUpdates } from '../src/client/messages/live-updates.ts';
import type { LiveEvent } from '../src/client/message-live/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import type { HistoryKind } from '../src/client/messages/preparation.ts';
import { controlFrames } from '../src/tools/chat-diagnostics/stream.ts';

await test('closed category frames survive fragmentation and shared-tab validation without extra data', () => {
  const parser = new WakeupFrames(),
    events: string[] = [];
  const bytes = new TextEncoder().encode(
    liveChangeCategories
      .map((event) => `event: ${event}\ndata: {}\n\n`)
      .join(''),
  );
  assert.deepEqual(controlFrames(bytes), liveChangeCategories);
  assert.deepEqual(
    controlFrames(
      new TextEncoder().encode('event: arbitrary-private-label\ndata: {}\n\n'),
    ),
    [],
  );
  for (const byte of bytes)
    events.push(...parser.accept(new Uint8Array([byte])));
  assert.deepEqual(events, liveChangeCategories);
  for (const event of liveChangeCategories) {
    const signal = {
      kind: 'state',
      owner: crypto.randomUUID(),
      sequence: 1,
      sentAt: Date.now(),
      snapshot: { phase: 'connected', activity: Date.now() },
      event,
    };
    assert.deepEqual(liveSignal(signal), signal);
    assert.equal(liveSignal({ ...signal, text: 'Forbidden' }), null);
  }
  for (const frame of [
    'event: unknown-category\ndata: {}\n\n',
    'event: private-messages\ndata: {"id":"forbidden"}\n\n',
  ])
    assert.throws(() =>
      new WakeupFrames().accept(new TextEncoder().encode(frame)),
    );
});

await test('features accept only their categories while general recovery and closing signals remain available', () => {
  for (const category of liveChangeCategories)
    assert.equal(
      scopedLiveEvent(category, ['handle-messages', 'handle-receipts']),
      category.startsWith('handle-') ? 'changed' : null,
    );
  for (const event of [
    'ready',
    'changed',
    'removed',
    'authorization',
    'revoked',
    'ended',
  ] as const)
    assert.equal(scopedLiveEvent(event, []), event);
});

function authority(): VaultAuthority {
  return {
    session: {
      accountId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      csrf: 'a'.repeat(64),
    },
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    offline: false,
    key: () => Promise.reject(new Error('Unused')),
    sign: () => Promise.resolve('signed'),
  };
}
function access(a: VaultAuthority): VaultAccess {
  return {
    withVault: (_offline, work) => work(a),
    withLocalVault: (_locator, work) => work(a),
  };
}

await test('stream capability uses one freshly signed legacy fallback and remembers an old server', async (t) => {
  const original = globalThis.fetch,
    payloads: unknown[] = [];
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = (_url, options) => {
    const raw = options?.body;
    assert.equal(typeof raw, 'string');
    const body = JSON.parse(raw as string) as {
      payload: unknown;
      signature: string;
    };
    payloads.push(body.payload);
    assert.equal(body.signature, 'signed');
    return Promise.resolve(
      new Response('{}', { status: payloads.length === 1 ? 400 : 200 }),
    );
  };
  const a = authority(),
    request = new LiveRequest();
  const options = {
    access: access(a),
    session: a.session,
    signal: new AbortController().signal,
    current: () => true,
  };
  assert.equal((await request.open(options)).status, 200);
  assert.equal((await request.open(options)).status, 200);
  assert.deepEqual(payloads, [{ categories: true }, {}, {}]);
});

await test('capability negotiation never retries authorization errors or fetches after session replacement', async (t) => {
  const original = globalThis.fetch;
  let requests = 0;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = () => {
    requests++;
    return Promise.resolve(new Response('{}', { status: 403 }));
  };
  const a = authority(),
    options = {
      access: access(a),
      session: a.session,
      signal: new AbortController().signal,
      current: () => true,
    };
  assert.equal((await new LiveRequest().open(options)).status, 403);
  assert.equal(requests, 1);
  await assert.rejects(
    new LiveRequest().open({ ...options, session: authority().session }),
    /Session changed/,
  );
  assert.equal(requests, 1);
});

function routingFixture() {
  const operations: string[] = [],
    external: LiveEvent[] = [];
  const state: { selected: HistoryKind | null; visible: boolean } = {
    selected: 'direct',
    visible: true,
  };
  const router = new MessageLiveUpdates({
    selected: () => state.selected,
    visible: () => state.visible,
    invalidate: (event) => operations.push('invalidate:' + event),
    hint: () => operations.push('hint'),
    request: (update, work, scope) =>
      operations.push([update, work.priority, scope].join(':')),
    inbox: (scope) => operations.push('inbox:' + scope),
    projection: (work) =>
      operations.push('projection:' + String(work.priority)),
    counters: (scope) => operations.push('counts:' + scope),
    previews: () => operations.push('previews'),
    external: (event) => external.push(event),
  });
  return { router, operations, external, state };
}

await test('private live content uses the visible direct pipeline without preparing groups or public consumers', () => {
  const f = routingFixture();
  f.router.event('private-messages');
  assert.deepEqual(f.operations, ['hint', 'probe:interactive:direct']);
  f.operations.length = 0;
  f.router.event('group-messages');
  assert.deepEqual(f.operations, ['inbox:groups']);
  f.operations.length = 0;
  f.router.event('handle-messages');
  f.router.event('status');
  f.router.event('activity');
  assert.deepEqual(f.operations, []);
  f.router.event('private-receipts');
  assert.deepEqual(f.operations, ['projection:interactive']);
  f.operations.length = 0;
  f.router.event('group-receipts');
  assert.deepEqual(f.operations, ['counts:groups']);
});

await test('no selected chat still receives account messages; removal closes before general reconciliation', () => {
  const f = routingFixture();
  f.state.selected = null;
  f.router.event('private-messages');
  assert.deepEqual(f.operations, ['hint', 'inbox:direct']);
  f.operations.length = 0;
  f.router.event('removed');
  assert.deepEqual(f.operations, ['invalidate:removed', 'probe::']);
  assert.deepEqual(f.external, ['private-messages', 'removed']);
});

await test('authorization closes visible history immediately while full reconciliation keeps maintenance priority', () => {
  const f = routingFixture();
  f.router.event('authorization');
  assert.deepEqual(f.operations, ['invalidate:authorization', 'refresh::']);
  assert.deepEqual(f.external, ['authorization']);
});
