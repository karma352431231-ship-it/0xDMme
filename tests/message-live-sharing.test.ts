import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { SharedLiveConnection } from '../src/client/message-live/shared.ts';
import { LiveConnection } from '../src/client/message-live/connection.ts';
import { liveScope } from '../src/client/message-live/session.ts';
import { liveSignal } from '../src/client/message-live/signals.ts';
import type { LiveEvent } from '../src/client/message-live/protocol.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';

function authority(): VaultAuthority {
  return {
    session: {
      accountId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      csrf: 'a'.repeat(64),
    },
    directory: 'b'.repeat(64),
    offline: false,
    epoch: 1,
    events: [],
    key: () => Promise.reject(new Error('Unused')),
    sign: () => Promise.resolve('synthetic-signature'),
  };
}
function access(a: VaultAuthority): VaultAccess {
  return {
    withVault: (_offline, work) => work(a),
    withLocalVault: (_locator, work) => work(a),
  };
}
async function until(
  condition: () => boolean | Promise<boolean>,
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('Live transport condition did not settle');
}
async function turn(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}
function fixture(t: TestContext) {
  const original = globalThis.fetch;
  const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const peers: SharedLiveConnection[] = [];
  const owners = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
  let requests = 0,
    unavailable = false;
  globalThis.fetch = (_url, options) => {
    requests++;
    if (unavailable)
      return Promise.resolve(new Response('{}', { status: 503 }));
    assert.equal(new Headers(options?.headers).get('X-0xdmme-Call-Wake'), '1');
    return Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            streams.add(controller);
            assert.equal(typeof options?.body, 'string');
            const body = JSON.parse(options!.body as string) as {
              signature: string;
            };
            owners.set(body.signature, controller);
            options?.signal?.addEventListener(
              'abort',
              () => {
                if (streams.delete(controller)) controller.close();
                owners.delete(body.signature);
              },
              { once: true },
            );
            controller.enqueue(
              new TextEncoder().encode('event: ready\ndata: {}\n\n'),
            );
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    );
  };
  t.after(async () => {
    peers.forEach((peer) => peer.stop());
    globalThis.fetch = original;
    await turn();
    assert.equal(streams.size, 0);
  });
  function peer(a: VaultAuthority) {
    const events: LiveEvent[] = [];
    const owner = crypto.randomUUID();
    let signed = false;
    const live = new SharedLiveConnection({
      access: access({
        ...a,
        sign: () => {
          signed = true;
          return Promise.resolve(owner);
        },
      }),
      event: (event) => events.push(event),
      changed: () => {},
    });
    peers.push(live);
    live.start();
    return {
      live,
      events,
      stream: () => owners.get(owner),
      signed: () => signed,
    };
  }
  return {
    peer,
    streams,
    requests: () => requests,
    unavailable: (value: boolean) => {
      unavailable = value;
    },
    send: (event: LiveEvent) => {
      for (const controller of streams)
        controller.enqueue(
          new TextEncoder().encode(`event: ${event}\ndata: {}\n\n`),
        );
    },
  };
}

await test('same-session tabs share one native lock and SSE, targeted joining does not refresh existing tabs, and owner departure hands off', async (t) => {
  const f = fixture(t),
    a = authority();
  const peers = Array.from({ length: 8 }, () => f.peer(a));
  await until(() => peers.every((peer) => peer.live.current));
  assert.equal(f.requests(), 1);
  assert.equal(f.streams.size, 1);
  assert.ok(
    peers.every(
      (peer) => peer.events.filter((event) => event === 'ready').length === 1,
    ),
  );
  const extra = f.peer(a);
  await until(() => extra.live.current);
  assert.equal(extra.events.filter((event) => event === 'ready').length, 1);
  assert.ok(
    peers.every(
      (peer) => peer.events.filter((event) => event === 'ready').length === 1,
    ),
  );
  for (const event of ['changed', 'call', 'removed', 'authorization'] as const)
    f.send(event);
  await until(() =>
    [...peers, extra].every((peer) => peer.events.includes('authorization')),
  );
  assert.ok(
    [...peers, extra].every(
      (peer) =>
        peer.events.slice(-4).join(',') ===
        'changed,call,removed,authorization',
    ),
  );
  // Scope hashing is asynchronous: identify the actual owner, never assume queue order.
  const owner = peers.find((peer) => peer.stream());
  assert.ok(owner);
  const followers = peers.filter((peer) => peer !== owner);
  owner.live.stop();
  await until(
    () => f.requests() === 2 && followers.every((peer) => peer.live.current),
  );
  assert.equal(f.streams.size, 1);
  assert.ok(
    followers.every(
      (peer) => peer.events.filter((event) => event === 'ready').length === 2,
    ),
  );
  extra.live.retry();
  await until(() => extra.live.current);
  assert.equal(
    f.requests(),
    2,
    'retrying a follower must not reopen a healthy shared stream',
  );
});

await test('category-capable tabs relay scoped hints through one stream without broadcasting message data', async (t) => {
  const f = fixture(t),
    a = authority();
  const peers = Array.from({ length: 3 }, () => f.peer(a));
  await until(() => peers.every((peer) => peer.live.current));
  f.send('private-messages');
  f.send('handle-receipts');
  await until(() =>
    peers.every((peer) => peer.events.includes('handle-receipts')),
  );
  assert.equal(f.requests(), 1);
  for (const peer of peers)
    assert.deepEqual(peer.events, [
      'ready',
      'private-messages',
      'handle-receipts',
    ]);
  assert.match(
    await liveScope(a.session),
    /^0xdmme-live-2:/u,
    'old tabs retain their own legacy stream instead of silently ignoring new category hints',
  );
});

await test('scope separates account, device and session; terminal authorization only stops matching tabs and releases queued ownership', async (t) => {
  const f = fixture(t),
    a = authority();
  const same = [f.peer(a), f.peer(a)];
  const other = [
    f.peer({ ...a, session: { ...a.session, accountId: crypto.randomUUID() } }),
    f.peer({ ...a, session: { ...a.session, deviceId: crypto.randomUUID() } }),
    f.peer({ ...a, session: { ...a.session, csrf: 'c'.repeat(64) } }),
  ];
  await until(() => [...same, ...other].every((peer) => peer.live.current));
  assert.equal(f.requests(), 4);
  const first = same.find((peer) => peer.stream())!.stream()!;
  first.enqueue(new TextEncoder().encode('event: revoked\ndata: {}\n\n'));
  await until(() => same.every((peer) => peer.events.includes('revoked')));
  assert.ok(same.every((peer) => !peer.live.current && !peer.live.connecting));
  assert.ok(
    other.every(
      (peer) => peer.live.current && !peer.events.includes('revoked'),
    ),
  );
  await turn();
  // A queued tab may begin its freshly signed handshake before processing the
  // previous owner's terminal frame; the frame must close it as well.
  assert.ok(f.requests() >= 4 && f.requests() <= 5);
  assert.equal(f.streams.size, 3);
});

await test('channel messages carry no credentials or content, reject malformed data, replay and wrong owners, and stale activity cannot revive a tab', async (t) => {
  const f = fixture(t),
    a = authority(),
    scope = await liveScope(a.session);
  assert.ok(
    !scope.includes(a.session.csrf) && !scope.includes(a.session.accountId),
  );
  const spy = new BroadcastChannel(scope),
    messages: unknown[] = [];
  spy.onmessage = (event) => messages.push(event.data);
  t.after(() => spy.close());
  const leader = f.peer(a),
    follower = f.peer(a);
  await until(() => follower.live.current && leader.live.current);
  await turn();
  const states = messages
    .map(liveSignal)
    .filter(
      (message) => message?.kind === 'state' && message.peer === undefined,
    );
  const state = states.at(-1)!;
  assert.ok(state.kind === 'state');
  const wire = JSON.stringify(messages);
  for (const secret of [
    a.session.csrf,
    a.session.accountId,
    a.session.deviceId,
    'synthetic-signature',
  ])
    assert.ok(!wire.includes(secret));
  const before = [...follower.events];
  for (const packet of [
    { ...state, event: 'changed' },
    {
      ...state,
      sequence: state.sequence + 100,
      owner: crypto.randomUUID(),
      event: 'changed',
    },
    {
      ...state,
      sequence: state.sequence + 100,
      sentAt: Date.now() - 15000,
      event: 'changed',
    },
    {
      ...state,
      sequence: state.sequence + 100,
      event: 'changed',
      content: 'must not relay',
    },
  ])
    spy.postMessage(packet);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(follower.events, before);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.mock.timers.tick(16000);
  assert.equal(follower.live.current, false);
  spy.postMessage({
    ...state,
    sequence: state.sequence + 200,
    sentAt: Date.now(),
    snapshot: { phase: 'connected', activity: Date.now() },
    event: 'changed',
  });
  await turn();
  assert.equal(
    follower.live.current,
    false,
    'a new challenge/ready is required after a gap',
  );
  assert.deepEqual(follower.events, before);
});

await test('canceling scope preparation creates no channel, lock or request', async (t) => {
  const original = globalThis.fetch;
  let requests = 0,
    release: (() => void) | undefined;
  globalThis.fetch = () => {
    requests++;
    return Promise.reject(new Error('Unexpected fetch'));
  };
  const a = authority();
  const live = new SharedLiveConnection({
    access: {
      ...access(a),
      withVault: (_offline, work) =>
        new Promise((resolve) => {
          release = () => {
            void work(a).then(resolve);
          };
        }),
    },
    event: () => {},
    changed: () => {},
  });
  t.after(() => {
    live.stop();
    globalThis.fetch = original;
  });
  live.start();
  live.stop();
  release?.();
  await turn();
  await turn();
  assert.equal(requests, 0);
  assert.equal(live.connecting, false);
  assert.equal(live.current, false);
});

await test('reconnecting a native owner cannot sign or open a stream under a different pinned session', async (t) => {
  const a = authority(),
    original = globalThis.fetch,
    events: LiveEvent[] = [];
  let signed = 0,
    requests = 0;
  a.sign = () => {
    signed++;
    return Promise.resolve('signature');
  };
  globalThis.fetch = () => {
    requests++;
    return Promise.resolve(new Response('{}', { status: 503 }));
  };
  const live = new LiveConnection({
    access: access(a),
    session: { ...a.session },
    event: (event) => events.push(event),
    changed: () => {},
  });
  t.after(() => {
    live.stop();
    globalThis.fetch = original;
  });
  a.session.csrf = 'd'.repeat(64);
  live.start();
  await turn();
  assert.deepEqual(events, ['ended']);
  assert.equal(signed, 0);
  assert.equal(requests, 0);
});

await test('coordination wire accepts only bounded empty hints and well-formed connection state', () => {
  const owner = crypto.randomUUID();
  for (const malformed of [
    null,
    [],
    { kind: 'hello', peer: owner, retry: true, payload: {} },
    { kind: 'owner', owner: 'x'.repeat(4096) },
    {
      kind: 'state',
      owner,
      sequence: 1,
      sentAt: Date.now(),
      snapshot: { phase: 'connected', activity: 'now' },
    },
    {
      kind: 'state',
      owner,
      sequence: 1,
      sentAt: Date.now(),
      snapshot: { phase: { toString: null }, activity: 0 },
    },
  ])
    assert.equal(liveSignal(malformed), null);
  assert.deepEqual(liveSignal({ kind: 'hello', peer: owner, retry: false }), {
    kind: 'hello',
    peer: owner,
    retry: false,
  });
});

await test('source heartbeats keep both owner and followers current beyond the freshness window', async (t) => {
  const f = fixture(t),
    a = authority(),
    peers = [f.peer(a), f.peer(a)];
  await until(() => peers.every((peer) => peer.live.current));
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  for (let index = 0; index < 3; index++) {
    t.mock.timers.tick(10000);
    for (const stream of f.streams)
      stream.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
    await turn();
    await turn();
    assert.ok(peers.every((peer) => peer.live.current));
  }
  assert.equal(f.requests(), 1);
  assert.ok(
    peers.every(
      (peer) => peer.events.filter((event) => event === 'ready').length === 1,
    ),
  );
});

await test('explicit follower retry restarts an unavailable shared source and all peers receive a fresh ready', async (t) => {
  const f = fixture(t),
    a = authority();
  f.unavailable(true);
  const peers = [f.peer(a), f.peer(a)];
  await until(
    () => f.requests() === 1 && peers.every((peer) => !peer.live.connecting),
  );
  assert.ok(peers.every((peer) => !peer.live.current));
  const follower = peers.find((peer) => !peer.signed())!;
  f.unavailable(false);
  follower.live.retry();
  await until(() => peers.every((peer) => peer.live.current));
  assert.equal(f.requests(), 2);
  assert.equal(f.streams.size, 1);
});

await test('a terminal SSE frame suppresses later frames in the same network chunk', async (t) => {
  const original = globalThis.fetch,
    events: LiveEvent[] = [];
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'event: ended\ndata: {}\n\nevent: ready\ndata: {}\n\nevent: changed\ndata: {}\n\n',
              ),
            );
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    );
  const live = new LiveConnection({
    access: access(authority()),
    event: (event) => events.push(event),
    changed: () => {},
  });
  t.after(() => {
    live.stop();
    globalThis.fetch = original;
  });
  live.start();
  await turn();
  assert.deepEqual(events, ['ended']);
  assert.equal(live.current, false);
  assert.equal(live.connecting, false);
});

await test('connection status alone cannot restore freshness without a new ready handshake', async (t) => {
  const f = fixture(t),
    a = authority(),
    scope = await liveScope(a.session);
  const spy = new BroadcastChannel(scope),
    messages: unknown[] = [];
  spy.onmessage = (event) => messages.push(event.data);
  t.after(() => spy.close());
  const peers = [f.peer(a), f.peer(a)];
  await until(() => peers.every((peer) => peer.live.current));
  const follower = peers.find((peer) => !peer.signed())!;
  await turn();
  const state = messages
    .map(liveSignal)
    .filter(
      (message) => message?.kind === 'state' && message.peer === undefined,
    )
    .at(-1)!;
  assert.ok(state.kind === 'state');
  spy.postMessage({
    ...state,
    sequence: state.sequence + 100,
    sentAt: Date.now(),
    snapshot: { phase: 'unavailable', activity: null },
    event: undefined,
  });
  await until(() => !follower.live.current);
  const previous = follower.events.filter((event) => event === 'ready').length;
  spy.postMessage({
    ...state,
    sequence: state.sequence + 101,
    sentAt: Date.now(),
    snapshot: { phase: 'connected', activity: Date.now() },
    event: undefined,
  });
  await until(
    () =>
      follower.events.filter((event) => event === 'ready').length > previous,
  );
  assert.ok(follower.live.current);
  assert.equal(f.requests(), 1);
});
