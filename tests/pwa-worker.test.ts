import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

interface WorkerEvent {
  notification?: { close(): void };
  request?: Request;
  data?: unknown;
  source?: { url: string };
  waitUntil(promise: Promise<unknown>): void;
  respondWith(promise: Promise<Response>): void;
}

async function worker(
  options: {
    networkAvailable?: boolean;
    failWriteAt?: number;
    unreadLimit?: number;
    networkDelayMs?: number;
    pushAllowed?: boolean;
    pushCheckFails?: boolean;
    pushSound?: string;
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
    ['unrelated-project-cache', new Map()],
    ['hash-talk-shell-older', new Map()],
    ['hash-talk-shell-old', new Map()],
  ]);
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
  const origin = 'https://hash-talk.example';
  const pushResult = {
    allowed: options.pushAllowed ?? false,
    call: options.pushCall ?? false,
    showCall: options.showCall ?? true,
  };
  const networkResponses = new WeakSet<Response>();
  for (const [path, bytes] of Object.entries(options.previousAssets ?? {})) {
    const response = new Response(bytes as BodyInit);
    Object.defineProperty(response, 'type', { value: 'basic' });
    stores.get('hash-talk-shell-old')?.set(origin + path, response);
  }
  if (options.pushSound !== undefined)
    cache.set(
      origin + '/.0xdmme/sound-preference',
      new Response(options.pushSound),
    );
  function fetchPath(input: string | Request, request: RequestInit): string {
    if (typeof input === 'string') {
      assert.ok(request.signal instanceof AbortSignal);
      return input;
    }
    const path = new URL(input.url).pathname;
    assert.equal(input.mode, 'navigate');
    assert.equal(path, '/');
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
    JSON,
    crypto,
    registration: {
      showNotification: (title: string, options: NotificationOptions) => {
        notifications.push({ title, options });
        return Promise.resolve();
      },
    },
    clients: {
      matchAll: () => Promise.resolve([]),
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
        return Promise.resolve(new Response(JSON.stringify(pushResult)));
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
    opened,
  };
}

function navigation(url: string): Request {
  // Node cannot construct navigate-mode requests; browsers supply them to SWs.
  return Object.defineProperty(new Request(url), 'mode', { value: 'navigate' });
}

await test('URL padrão abre o HTML atual online e conserva a versão completa para navegação offline', async () => {
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
  scope.offline();
  await scope.dispatch('fetch', { request });
  assert.equal(await scope.response()?.text(), 'public-shell');
  assert.equal(scope.activations(), 0);
  assert.equal(scope.deleted.length, 0);

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

await test('aviso de chamada mostra tipo por padrão, opção de privacidade fica genérica e convite inválido não aparece', async () => {
  const visible = await worker({ pushAllowed: true, pushCall: true });
  await visible.dispatch('push');
  assert.equal(
    visible.notifications[0]?.options.body,
    'Chamada de voz recebida. Abra o app para atender.',
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
    'Há nova atividade. Abra o app para sincronizar.',
  );
  assert.equal(hidden.notifications[0]?.options.tag, '0xdmme-call');
  const stale = await worker({ pushAllowed: false, pushCall: true });
  await stale.dispatch('push');
  assert.equal(stale.notifications.length, 0);
});

await test('navegação sem rede nem cache falha e erro HTTP do servidor não é mascarado pelo cache', async () => {
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

await test('worker real instala só shell público e atende offline sem interceptar API', async () => {
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
await test('push revalida mute/sessão, ignora conteúdo recebido e abre somente o app', async () => {
  const scope = await worker({ pushAllowed: true });
  await scope.dispatch('push', {
    data: { title: 'Texto legível malicioso', url: 'https://evil.test' },
  });
  assert.equal(scope.notifications.length, 1);
  assert.equal(scope.notifications[0]?.options.silent, false);
  assert.equal(scope.notifications[0]?.title, '0xDMme');
  assert.equal(
    scope.notifications[0]?.options.body,
    'Há nova atividade. Abra o app para sincronizar.',
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
  assert.deepEqual(scope.opened, [scope.origin + '/#conversas']);
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

await test('worker rejeita instalação incompleta e ativação por mensagem inválida', async () => {
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

await test('erro de escrita remove somente candidato incompleto e preserva cache anterior', async () => {
  const scope = await worker({ failWriteAt: 3 });
  await assert.rejects(scope.dispatch('install'), /synthetic-cache-full/);
  assert.equal(scope.cache.size, 0);
  assert.equal(scope.deleted.length, 1);
  assert.equal(scope.stores.has('hash-talk-shell-old'), true);
  assert.equal(scope.stores.has('unrelated-project-cache'), true);
});

await test('instalação consome corpos antes de novos fetches sob orçamento pequeno de conexões', async () => {
  const scope = await worker({ unreadLimit: 3 });
  await scope.dispatch('install');
  assert.ok(scope.cache.size >= 7);
  assert.equal(scope.peakUnread(), 1);
  for (const response of scope.cache.values()) {
    assert.equal(await response.clone().text(), 'public-shell');
  }
});

await test('downloads lentos instalam além de oito segundos; instalação acima do prazo preserva versão anterior', async () => {
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

await test('atualização reaproveita WASM público somente com hash igual ao build e preserva a versão anterior', async () => {
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
