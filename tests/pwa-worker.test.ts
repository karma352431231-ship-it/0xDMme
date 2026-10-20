import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { publicNotificationText } from '../src/shared/public-notification/index.ts';

interface WorkerEvent {
  notification?: { close(): void; data?: unknown };
  request?: Request;
  data?: unknown;
  source?: { url: string };
  waitUntil(promise: Promise<unknown>): void;
  respondWith(promise: Promise<Response>): void;
}

function initializeDevicePreferences(
  cache: Map<string, Response>,
  origin: string,
  choices: { sound?: string | undefined; language?: string | undefined },
): void {
  for (const [path, value] of [
    ['/.0xdmme/sound-preference', choices.sound],
    ['/.0xdmme/language-preference', choices.language],
  ] as const)
    if (value !== undefined) cache.set(origin + path, new Response(value));
}

function pushInspection(options: {
  pushAllowed?: boolean;
  pushCall?: boolean;
  showCall?: boolean;
  publicPreview?: unknown;
  publicScope?: string;
}) {
  return {
    allowed: options.pushAllowed ?? false,
    call: options.pushCall ?? false,
    showCall: options.showCall ?? true,
    publicPreview: options.publicPreview,
    publicScope: options.publicScope ?? 'a'.repeat(64),
  };
}

async function worker(
  options: {
    networkAvailable?: boolean;
    failWriteAt?: number;
    unreadLimit?: number;
    networkDelayMs?: number;
    pushAllowed?: boolean;
    openClient?: boolean;
    publicPreview?: unknown;
    publicScope?: string;
    alertCache?: Map<string, Response>;
    pushCheckFails?: boolean;
    pushSound?: string;
    language?: string;
    pushCall?: boolean;
    showCall?: boolean;
    networkStatus?: number;
    previousAssets?: Record<string, Uint8Array>;
  } = {},
) {
  let networkAvailable = options.networkAvailable ?? true;
  const source = await readFile(
    new URL('../dist/web/sw.js', import.meta.url),
    'utf8',
  );
  const callbacks = new Map<string, (event: WorkerEvent) => void>();
  const cache = new Map<string, Response>();
  const stores = new Map<string, Map<string, Response>>([
    ['0xdmme-public-alerts', new Map()],
    ['unrelated-project-cache', new Map()],
    ['hash-talk-shell-older', new Map()],
    ['hash-talk-shell-old', new Map()],
  ]);
  if (options.alertCache)
    stores.set('0xdmme-public-alerts', options.alertCache);
  const deleted: string[] = [];
  let writes = 0;
  let activations = 0;
  let networkRequests = 0;
  let unreadResponses = 0;
  let peakUnread = 0;
  let elapsed = 0;
  let networkBody = 'public-shell';
  let lastResponse: Response | undefined;
  const deadlines = new WeakMap<
    AbortSignal,
    { at: number; controller: AbortController }
  >();
  const notifications: { title: string; options: NotificationOptions }[] = [];
  const opened: string[] = [];
  const clientMessages: { url: string; message: unknown }[] = [];
  const origin = 'https://hash-talk.example';
  const pushResult = pushInspection(options);
  const networkResponses = new WeakSet<Response>();
  for (const [path, bytes] of Object.entries(options.previousAssets ?? {})) {
    const response = new Response(bytes as BodyInit);
    Object.defineProperty(response, 'type', { value: 'basic' });
    stores.get('hash-talk-shell-old')?.set(origin + path, response);
  }
  initializeDevicePreferences(cache, origin, {
    sound: options.pushSound,
    language: options.language,
  });
  function fetchPath(input: string | Request, request: RequestInit): string {
    if (typeof input === 'string') {
      assert.ok(request.signal instanceof AbortSignal);
      return input;
    }
    const path = new URL(input.url).pathname;
    assert.equal(input.mode, 'navigate');
    assert.ok(path.startsWith('/') && !path.startsWith('/api/'));
    assert.equal(request.cache, 'no-store');
    assert.equal(request.redirect, 'error');
    return path;
  }
  function advanceNetwork(signal: AbortSignal | null | undefined): void {
    networkRequests++;
    elapsed += options.networkDelayMs ?? 0;
    if (!signal) return;
    const deadline = deadlines.get(signal);
    if (deadline && elapsed > deadline.at)
      deadline.controller.abort(new Error('synthetic-installation-timeout'));
    signal.throwIfAborted();
  }
  runInNewContext(source, {
    location: { origin },
    addEventListener: (type: string, callback: (event: WorkerEvent) => void) =>
      callbacks.set(type, callback),
    skipWaiting: () => {
      activations++;
      return Promise.resolve();
    },
    Request,
    Response,
    TextDecoder,
    AbortSignal: {
      timeout(milliseconds: number) {
        const controller = new AbortController();
        deadlines.set(controller.signal, {
          at: elapsed + milliseconds,
          controller,
        });
        return controller.signal;
      },
    },
    URL,
    URLSearchParams,
    JSON,
    crypto,
    registration: {
      showNotification: (title: string, options: NotificationOptions) => {
        notifications.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      matchAll: () =>
        Promise.resolve(
          options.openClient
            ? [origin, 'https://unrelated.example'].map((url) => ({
                url,
                focus: () => Promise.resolve(),
                postMessage: (message: unknown) => {
                  clientMessages.push({ url, message });
                },
              }))
            : [],
        ),
      openWindow: (url: string) => {
        opened.push(url);
        return Promise.resolve();
      },
    },
    caches: {
      open: (name: string) => {
        let storage = stores.get(name);
        if (!storage) {
          storage = cache;
          stores.set(name, storage);
        }
        const records = storage;
        return Promise.resolve({
          put: async (path: string, response: Response) => {
            if (++writes === options.failWriteAt)
              return Promise.reject(new Error('synthetic-cache-full'));
            const stored = response.clone();
            await response.arrayBuffer();
            if (networkResponses.has(response)) unreadResponses--;
            records.set(`${origin}${path}`, stored);
            return Promise.resolve();
          },
          match: (url: string) => {
            const original = records.get(new URL(url, origin).href);
            const copy = original?.clone();
            if (copy && original?.type === 'basic')
              Object.defineProperty(copy, 'type', { value: 'basic' });
            return Promise.resolve(copy);
          },
        });
      },
      keys: () => Promise.resolve([...stores.keys()]),
      delete: (name: string) => {
        assert.ok(name.startsWith('hash-talk-shell-'));
        deleted.push(name);
        if (stores.get(name) === cache) cache.clear();
        return Promise.resolve(stores.delete(name));
      },
    },
    fetch: (input: string | Request, request: RequestInit = {}) => {
      const path = fetchPath(input, request);
      advanceNetwork(request.signal);
      if (path === '/api/account/push-check') {
        assert.equal(request.credentials, 'same-origin');
        assert.equal(request.cache, 'no-store');
        if (options.pushCheckFails)
          return Promise.reject(new Error('synthetic-unavailable'));
        return Promise.resolve(Response.json(pushResult));
      }
      if (!networkAvailable)
        return Promise.reject(new Error('synthetic-offline'));
      if (unreadResponses >= (options.unreadLimit ?? 16))
        return Promise.reject(new Error('synthetic-unconsumed-response-limit'));
      unreadResponses++;
      peakUnread = Math.max(peakUnread, unreadResponses);
      const response = new Response(networkBody, {
        status: options.networkStatus ?? 200,
      });
      Object.defineProperty(response, 'type', { value: 'basic' });
      networkResponses.add(response);
      return Promise.resolve(response);
    },
  });
  async function dispatch(type: string, input: Partial<WorkerEvent> = {}) {
    lastResponse = undefined;
    const promises: Promise<unknown>[] = [];
    let intercepted = false;
    callbacks.get(type)?.({
      ...input,
      waitUntil: (promise) => promises.push(promise),
      respondWith: (promise) => {
        intercepted = true;
        promises.push(promise.then((response) => (lastResponse = response)));
      },
    });
    await Promise.all(promises);
    return intercepted;
  }
  return {
    dispatch,
    cache,
    stores,
    deleted,
    activations: () => activations,
    networkRequests: () => networkRequests,
    peakUnread: () => peakUnread,
    response: () => lastResponse,
    setNetworkBody: (body: string) => {
      networkBody = body;
    },
    offline: () => {
      networkAvailable = false;
    },
    origin,
    notifications,
    pushResult,
    clientMessages,
    opened,
  };
}

function navigation(url: string): Request {
  // Node cannot construct navigate-mode requests; browsers supply them to SWs.
  return Object.defineProperty(new Request(url), 'mode', { value: 'navigate' });
}

await test('default URL opens current online HTML and preserves the complete version for offline navigation', async () => {
  const scope = await worker();
  await scope.dispatch('install');
  scope.setNetworkBody('current-online-shell');
  const request = navigation(`${scope.origin}/`);
  assert.equal(await scope.dispatch('fetch', { request }), true);
  assert.equal(await scope.response()?.text(), 'current-online-shell');
  assert.equal(
    await scope.cache.get(request.url)?.clone().text(),
    'public-shell',
  );
  for (const path of [
    '/split/feed',
    '/users/handle/karma',
    '/communities/new-community?view=manage',
  ]) {
    assert.equal(
      await scope.dispatch('fetch', {
        request: navigation(scope.origin + path),
      }),
      true,
    );
    assert.equal(await scope.response()?.text(), 'current-online-shell');
    assert.equal(scope.cache.has(scope.origin + path), false);
  }
  scope.offline();
  await scope.dispatch('fetch', { request });
  assert.equal(await scope.response()?.text(), 'public-shell');
  assert.equal(scope.activations(), 0);
  assert.equal(scope.deleted.length, 0);

  for (const path of [
    '/split/feed',
    '/users/handle/karma',
    '/communities/new-community?view=manage',
  ]) {
    assert.equal(
      await scope.dispatch('fetch', {
        request: navigation(scope.origin + path),
      }),
      true,
    );
    assert.equal(await scope.response()?.text(), 'public-shell');
    assert.equal(scope.cache.has(scope.origin + path), false);
  }
  for (const path of [
    '/?atualizar=1',
    '/?token=synthetic',
    '/wallet.html',
    '/api/messages',
  ])
    assert.equal(
      await scope.dispatch('fetch', {
        request: navigation(`${scope.origin}${path}`),
      }),
      false,
    );
});

await test('call notice shows type by default, privacy option stays generic and invalid invitation never appears', async () => {
  const visible = await worker({ pushAllowed: true, pushCall: true });
  await visible.dispatch('push');
  assert.equal(
    visible.notifications[0]?.options.body,
    'Incoming voice call. Open the app to answer.',
  );
  assert.equal(visible.notifications[0]?.options.tag, '0xdmme-call');
  const hidden = await worker({
    pushAllowed: true,
    pushCall: true,
    showCall: false,
  });
  await hidden.dispatch('push');
  assert.equal(
    hidden.notifications[0]?.options.body,
    'New activity. Open the app to sync.',
  );
  assert.equal(hidden.notifications[0]?.options.tag, '0xdmme-call');
  const stale = await worker({ pushAllowed: false, pushCall: true });
  await stale.dispatch('push');
  assert.equal(stale.notifications.length, 0);
});

await test('navigation without network or cache fails and server HTTP error cannot be masked by cache', async () => {
  const offline = await worker({ networkAvailable: false });
  await assert.rejects(
    offline.dispatch('fetch', { request: navigation(`${offline.origin}/`) }),
    /synthetic-offline/,
  );
  const unavailable = await worker({ networkStatus: 503 });
  unavailable.cache.set(`${unavailable.origin}/`, new Response('old-shell'));
  await unavailable.dispatch('fetch', {
    request: navigation(`${unavailable.origin}/`),
  });
  assert.equal(unavailable.response()?.status, 503);
  assert.equal(
    await unavailable.cache.get(`${unavailable.origin}/`)?.text(),
    'old-shell',
  );
  const stalled = await worker({ networkDelayMs: 9000 });
  stalled.cache.set(`${stalled.origin}/`, new Response('installed-shell'));
  await stalled.dispatch('fetch', {
    request: navigation(`${stalled.origin}/`),
  });
  assert.equal(await stalled.response()?.text(), 'installed-shell');
  assert.equal(stalled.activations(), 0);
});

await test('real worker installs only public shell and serves offline without intercepting API', async () => {
  const scope = await worker();
  await scope.dispatch('install');
  assert.equal(scope.activations(), 0);
  assert.ok(scope.cache.size >= 7);
  assert.ok([...scope.cache.keys()].every((url) => !url.includes('/api/')));
  assert.equal(scope.cache.has(`${scope.origin}/wallet.html`), false);
  assert.ok(
    [...scope.cache.keys()].every((url) => !url.includes('/phantom-probe')),
  );
  const count = scope.networkRequests();
  scope.offline();
  assert.equal(
    await scope.dispatch('fetch', { request: new Request(`${scope.origin}/`) }),
    true,
  );
  for (const path of [
    '/api/messages',
    '/health/ready',
    '/objects/private',
    '/wallet.html',
    '/phantom-probe.html',
    '/phantom-probe.html?state=synthetic&phase=connect',
    '/wallet-entry?ticket=synthetic',
    '/api/account/approval-request',
    '/?token=synthetic',
  ])
    assert.equal(
      await scope.dispatch('fetch', {
        request: new Request(`${scope.origin}${path}`),
      }),
      false,
    );
  assert.equal(scope.networkRequests(), count);
  await scope.dispatch('activate');
  assert.equal(scope.stores.has('unrelated-project-cache'), true);
  assert.equal(scope.stores.has('hash-talk-shell-old'), true);
  assert.equal(scope.stores.has('hash-talk-shell-older'), false);
  assert.equal(
    [...scope.stores.keys()].filter((name) =>
      name.startsWith('hash-talk-shell-'),
    ).length,
    2,
  );
});
await test('push revalidates mute and session, ignores received content and opens only the app', async () => {
  const scope = await worker({ pushAllowed: true });
  await scope.dispatch('push', {
    data: { title: 'Texto legível malicioso', url: 'https://evil.test' },
  });
  assert.equal(scope.notifications.length, 1);
  assert.equal(scope.notifications[0]?.options.silent, false);
  assert.equal(scope.notifications[0]?.title, '0xDMme');
  assert.equal(
    scope.notifications[0]?.options.body,
    'New activity. Open the app to sync.',
  );
  assert.equal(
    JSON.stringify(scope.notifications).includes('malicioso'),
    false,
  );
  let closed = false;
  await scope.dispatch('notificationclick', {
    notification: {
      close() {
        closed = true;
      },
    },
  });
  assert.equal(closed, true);
  assert.deepEqual(scope.opened, [scope.origin + '/chats']);
  for (const options of [
    { pushAllowed: false },
    { pushAllowed: true, pushCheckFails: true },
    { pushAllowed: true, pushSound: 'invalid' },
  ]) {
    const denied = await worker(options);
    await denied.dispatch('push');
    assert.equal(denied.notifications.length, 0);
  }
  const silent = await worker({ pushAllowed: true, pushSound: 'false' });
  await silent.dispatch('push');
  assert.equal(silent.notifications[0]?.options.silent, true);
});

await test('worker rejects incomplete installation and activation by invalid message', async () => {
  const failed = await worker({ networkAvailable: false });
  await assert.rejects(failed.dispatch('install'), /synthetic-offline/);
  assert.equal(failed.cache.size, 0);
  const scope = await worker();
  for (const input of [
    {
      data: { type: 'ACTIVATE_PUBLIC_SHELL' },
      source: { url: 'https://attacker.example/' },
    },
    { data: { type: 'WRONG' }, source: { url: `${scope.origin}/` } },
    { data: { type: 'ACTIVATE_PUBLIC_SHELL' } },
  ])
    await scope.dispatch('message', input);
  assert.equal(scope.activations(), 0);
  await scope.dispatch('message', {
    data: { type: 'ACTIVATE_PUBLIC_SHELL' },
    source: { url: `${scope.origin}/` },
  });
  assert.equal(scope.activations(), 1);
});

await test('write error removes only the incomplete candidate and preserves previous cache', async () => {
  const scope = await worker({ failWriteAt: 3 });
  await assert.rejects(scope.dispatch('install'), /synthetic-cache-full/);
  assert.equal(scope.cache.size, 0);
  assert.equal(scope.deleted.length, 1);
  assert.equal(scope.stores.has('hash-talk-shell-old'), true);
  assert.equal(scope.stores.has('unrelated-project-cache'), true);
});

await test('installation consumes bodies before new fetches under a small connection budget', async () => {
  const scope = await worker({ unreadLimit: 3 });
  await scope.dispatch('install');
  assert.ok(scope.cache.size >= 7);
  assert.equal(scope.peakUnread(), 1);
  for (const response of scope.cache.values()) {
    assert.equal(await response.clone().text(), 'public-shell');
  }
});

await test('slow downloads install beyond eight seconds; installation past its deadline preserves the previous version', async () => {
  const available = await worker();
  await available.dispatch('install');
  const slow = await worker({
    networkDelayMs: Math.ceil(16_000 / available.networkRequests()),
  });
  await slow.dispatch('install');
  assert.ok(slow.cache.size >= 7);
  assert.equal(slow.activations(), 0);
  const stalled = await worker({ networkDelayMs: 10_000 });
  await assert.rejects(
    stalled.dispatch('install'),
    /synthetic-installation-timeout/,
  );
  assert.equal(stalled.cache.size, 0);
  assert.equal(stalled.deleted.length, 1);
  assert.equal(stalled.stores.has('hash-talk-shell-old'), true);
  assert.equal(stalled.stores.has('unrelated-project-cache'), true);
});

await test('update reuses public WASM only when its hash matches the build and preserves the previous version', async () => {
  const path = '/matrix-crypto-18.9.0.wasm';
  const bytes = await readFile(
    new URL('../dist/web/matrix-crypto-18.9.0.wasm', import.meta.url),
  );
  const fresh = await worker();
  await fresh.dispatch('install');
  const reused = await worker({ previousAssets: { [path]: bytes } });
  await reused.dispatch('install');
  assert.equal(reused.networkRequests(), fresh.networkRequests() - 1);
  assert.deepEqual(
    new Uint8Array(await reused.cache.get(reused.origin + path)!.arrayBuffer()),
    new Uint8Array(bytes),
  );
  assert.ok(
    reused.stores.get('hash-talk-shell-old')?.has(reused.origin + path),
  );
  const altered = await worker({
    previousAssets: { [path]: new TextEncoder().encode('wrong-version') },
  });
  await altered.dispatch('install');
  assert.equal(altered.networkRequests(), fresh.networkRequests());
  assert.equal(
    await altered.cache.get(altered.origin + path)?.text(),
    'public-shell',
  );
  assert.ok(altered.stores.has('unrelated-project-cache'));
});

await test('public push shows validated author and preview with monochrome symbol and internal link', async () => {
  const publicPreview = {
    author: {
      id: crypto.randomUUID(),
      handle: 'sintetico',
      avatar: null as string | null,
    },
    post: crypto.randomUUID(),
    community: crypto.randomUUID(),
    text: 'Pequena prévia pública',
    reply: true,
    followed: false,
  };
  publicPreview.author.avatar = `/api/public-media/avatar/${publicPreview.author.id}/${crypto.randomUUID()}`;
  const scope = await worker({ pushAllowed: true, publicPreview });
  await scope.dispatch('push');
  const notification = scope.notifications[0]!;
  assert.match(notification.title, /@sintetico replied/u);
  assert.equal(notification.options.icon, publicPreview.author.avatar);
  assert.equal(notification.options.body, publicPreview.text);
  assert.equal(notification.options.badge, '/notification-badge.png');
  await scope.dispatch('notificationclick', {
    notification: { close() {}, data: notification.options.data as unknown },
  });
  assert.deepEqual(scope.opened, [
    `${scope.origin}/communities/id/${publicPreview.community}/posts/${publicPreview.post}`,
  ]);
  await scope.dispatch('notificationclick', {
    notification: {
      close() {},
      data: {
        href: `/#comunidades?id=${publicPreview.community}&post=${publicPreview.post}`,
      },
    },
  });
  assert.equal(scope.opened[1], scope.opened[0]);
  const blocked = await worker({ pushAllowed: false, publicPreview });
  await blocked.dispatch('push');
  assert.equal(blocked.notifications.length, 0);
  const invalid = await worker({
    pushAllowed: true,
    publicPreview: {
      ...publicPreview,
      author: { ...publicPreview.author, wallet: 'private' },
    },
  });
  await invalid.dispatch('push');
  assert.equal(invalid.notifications.length, 0);
});

await test('posts and replies from followed profiles show the author photo and handle, one alert per post', async () => {
  const author = crypto.randomUUID(),
    review = crypto.randomUUID();
  const publicPreview = {
    author: {
      id: author,
      handle: 'followed',
      avatar: `/api/public-media/avatar/${author}/${review}`,
    },
    post: crypto.randomUUID(),
    community: crypto.randomUUID(),
    text: 'Oui Madamme',
    reply: false,
    followed: true,
  };
  const scope = await worker({ pushAllowed: true, publicPreview });
  await scope.dispatch('push');
  const notification = scope.notifications[0]!;
  assert.equal(notification.title, '@followed');
  assert.equal(notification.options.body, 'Oui Madamme');
  assert.equal(notification.options.icon, publicPreview.author.avatar);
  assert.equal(notification.options.tag, `0xdmme-post-${publicPreview.post}`);
  const plain = await worker({
    pushAllowed: true,
    publicPreview: {
      ...publicPreview,
      reply: true,
      author: { ...publicPreview.author, avatar: null },
    },
  });
  await plain.dispatch('push');
  assert.equal(plain.notifications[0]?.title, '@followed');
  assert.equal(plain.notifications[0]?.options.icon, '/icon-192.png');
  const foreign = await worker({
    pushAllowed: true,
    publicPreview: {
      ...publicPreview,
      author: { ...publicPreview.author, avatar: 'https://example.com/a.png' },
    },
  });
  await foreign.dispatch('push');
  assert.equal(foreign.notifications.length, 0);
});

await test('Chinese background alerts localize app text without translating public content', async () => {
  const generic = await worker({ pushAllowed: true, language: 'zh-CN' });
  await generic.dispatch('push');
  assert.equal(generic.notifications[0]?.title, '0xDMme');
  assert.equal(
    generic.notifications[0]?.options.body,
    '有新动态。请打开应用以同步。',
  );
  const call = await worker({
    pushAllowed: true,
    pushCall: true,
    language: 'zh-CN',
  });
  await call.dispatch('push');
  assert.equal(
    call.notifications[0]?.options.body,
    '收到语音来电。请打开应用接听。',
  );
  const preview = {
    author: {
      id: crypto.randomUUID(),
      handle: 'sintetico',
      avatar: null as string | null,
    },
    post: crypto.randomUUID(),
    community: crypto.randomUUID(),
    text: publicNotificationText('', ''),
    reply: true,
    followed: false,
  };
  assert.equal(preview.text, '');
  const media = await worker({
    pushAllowed: true,
    publicPreview: preview,
    language: 'zh-CN',
  });
  await media.dispatch('push');
  assert.equal(media.notifications[0]?.title, '@sintetico 回复了 · 0xDMme');
  assert.equal(media.notifications[0]?.options.body, '新的媒体发布。');
  const content = await worker({
    pushAllowed: true,
    publicPreview: { ...preview, text: 'New media publication.' },
    language: 'zh-CN',
  });
  await content.dispatch('push');
  assert.equal(
    content.notifications[0]?.options.body,
    'New media publication.',
  );
  const invalid = await worker({ pushAllowed: true, language: 'pt-BR' });
  await invalid.dispatch('push');
  assert.equal(invalid.notifications.length, 0);
});

await test('verified push wakes same-origin open pages without notification contents; rejected pushes do not', async () => {
  const scope = await worker({ pushAllowed: true, openClient: true });
  await scope.dispatch('push');
  assert.equal(scope.clientMessages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(scope.clientMessages)), [
    { url: scope.origin, message: { type: 'ACTIVITY_CHANGED' } },
  ]);
  const denied = await worker({ pushAllowed: false, openClient: true });
  await denied.dispatch('push');
  assert.equal(denied.clientMessages.length, 0);
});

await test('aggregate pushes never repeat a displayed public reply as a new chat message, including worker restart', async () => {
  const preview = {
    author: { id: crypto.randomUUID(), handle: 'reply_author', avatar: null },
    community: crypto.randomUUID(),
    post: crypto.randomUUID(),
    text: 'Old public reply',
    reply: true,
    followed: false,
  };
  const scope = await worker({
    pushAllowed: true,
    publicPreview: preview,
    openClient: true,
  });
  await Promise.all([scope.dispatch('push'), scope.dispatch('push')]);
  assert.equal(
    scope.notifications.filter((item) => item.options.body === preview.text)
      .length,
    1,
  );
  assert.equal(scope.notifications[1]?.options.tag, '0xdmme-activity');
  assert.equal(scope.notifications[1]?.options.icon, '/icon-192.png');
  const restarted = await worker({
    pushAllowed: true,
    publicPreview: preview,
    alertCache: scope.stores.get('0xdmme-public-alerts')!,
  });
  await restarted.dispatch('push');
  assert.equal(restarted.notifications[0]?.options.tag, '0xdmme-activity');
  restarted.pushResult.publicPreview = {
    ...preview,
    post: crypto.randomUUID(),
    text: 'New public reply',
  };
  await restarted.dispatch('push');
  assert.equal(restarted.notifications[1]?.options.body, 'New public reply');
  restarted.pushResult.publicScope = 'b'.repeat(64);
  restarted.pushResult.publicPreview = preview;
  await restarted.dispatch('push');
  assert.equal(
    restarted.notifications[2]?.options.body,
    preview.text,
    'A different signed-in session has independent alerts',
  );
  const stored = [
    ...restarted.stores.get('0xdmme-public-alerts')!.values(),
  ][0]!;
  const history = await stored.clone().text();
  assert.equal(history.includes(preview.text), false);
  assert.equal(history.includes(preview.author.id), false);
});

await test('public alert bookkeeping stays bounded and does not mark posts read', async () => {
  const preview = {
    author: { id: crypto.randomUUID(), handle: 'author', avatar: null },
    community: crypto.randomUUID(),
    post: crypto.randomUUID(),
    text: 'Public content',
    reply: true,
    followed: false,
  };
  const scope = await worker({ pushAllowed: true, publicPreview: preview });
  for (let index = 0; index < 40; index++) {
    scope.pushResult.publicPreview = { ...preview, post: crypto.randomUUID() };
    await scope.dispatch('push');
  }
  const saved = [...scope.stores.get('0xdmme-public-alerts')!.values()][0]!;
  const history = (await saved.clone().json()) as { posts: string[] };
  assert.equal(history.posts.length, 32);
  assert.equal(
    scope.networkRequests(),
    40,
    'Only the authenticated push inspection is requested',
  );
});
