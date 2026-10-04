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
    pushAllowed?: boolean;
    pushCheckFails?: boolean;
    pushSound?: string;
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
  const notifications: { title: string; options: NotificationOptions }[] = [];
  const opened: string[] = [];
  const origin = 'https://hash-talk.example';
  if (options.pushSound !== undefined)
    cache.set(
      origin + '/.0xdmme/sound-preference',
      new Response(options.pushSound),
    );
  runInNewContext(source, {
    location: { origin },
    addEventListener: (type: string, callback: (event: WorkerEvent) => void) =>
      callbacks.set(type, callback),
    skipWaiting: () => {
      activations++;
      return Promise.resolve();
    },
    Request,
    AbortSignal,
    URL,
    JSON,
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
        stores.set(name, cache);
        return Promise.resolve({
          put: async (path: string, response: Response) => {
            if (++writes === options.failWriteAt)
              return Promise.reject(new Error('synthetic-cache-full'));
            const stored = response.clone();
            await response.arrayBuffer();
            unreadResponses--;
            cache.set(`${origin}${path}`, stored);
            return Promise.resolve();
          },
          match: (url: string) => Promise.resolve(cache.get(url)),
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
    fetch: (_path: string, request: RequestInit) => {
      assert.ok(request.signal instanceof AbortSignal);
      networkRequests++;
      if (_path === '/api/account/push-check') {
        assert.equal(request.credentials, 'same-origin');
        assert.equal(request.cache, 'no-store');
        if (options.pushCheckFails)
          return Promise.reject(new Error('synthetic-unavailable'));
        return Promise.resolve(
          new Response(
            JSON.stringify({ allowed: options.pushAllowed ?? false }),
          ),
        );
      }
      if (!networkAvailable)
        return Promise.reject(new Error('synthetic-offline'));
      if (unreadResponses >= (options.unreadLimit ?? 16))
        return Promise.reject(new Error('synthetic-unconsumed-response-limit'));
      unreadResponses++;
      peakUnread = Math.max(peakUnread, unreadResponses);
      const response = new Response('public-shell');
      Object.defineProperty(response, 'type', { value: 'basic' });
      return Promise.resolve(response);
    },
  });
  async function dispatch(type: string, input: Partial<WorkerEvent> = {}) {
    const promises: Promise<unknown>[] = [];
    let intercepted = false;
    callbacks.get(type)?.({
      ...input,
      waitUntil: (promise) => promises.push(promise),
      respondWith: (promise) => {
        intercepted = true;
        promises.push(promise);
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
    offline: () => {
      networkAvailable = false;
    },
    origin,
    notifications,
    opened,
  };
}

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
