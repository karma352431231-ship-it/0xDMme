import { cacheableRequest } from '../../shared/pwa-policy/index.ts';

// Narrow structural interfaces keep DOM client and worker contexts independent.
interface WorkerScope {
  location: Location;
  skipWaiting(): Promise<void>;
  addEventListener(
    type: 'install' | 'activate',
    listener: (event: { waitUntil(promise: Promise<unknown>): void }) => void,
  ): void;
  addEventListener(
    type: 'fetch',
    listener: (event: {
      request: Request;
      respondWith(promise: Promise<Response>): void;
    }) => void,
  ): void;
  addEventListener(
    type: 'message',
    listener: (event: {
      data: unknown;
      source: { url?: string } | null;
      waitUntil(promise: Promise<unknown>): void;
    }) => void,
  ): void;
}

const scope = globalThis as unknown as WorkerScope;
// Replaced by build; every release gets its own allowlist and cache identifier.
const assets: readonly string[] = JSON.parse('{{ASSETS}}') as string[];
const cacheName = 'hash-talk-shell-{{VERSION}}';

scope.addEventListener('install', (event) => {
  const signal = AbortSignal.timeout(8_000);
  event.waitUntil(
    caches
      .open(cacheName)
      .then(async (cache) => {
        // Consume each body before requesting another asset. Retaining every
        // unread Response can exhaust the browser's connection/stream budget.
        for (const path of assets) {
          signal.throwIfAborted();
          const response = await fetch(path, {
            cache: 'no-store',
            redirect: 'error',
            signal,
          });
          if (!response.ok || response.type !== 'basic')
            throw new Error('Shell incompleto.');
          await cache.put(path, response);
        }
      })
      .catch(async (error: unknown) => {
        // Failed candidates are never an accepted offline shell.
        await caches.delete(cacheName);
        throw error;
      }),
  );
});

scope.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (names) => {
      const old = names.filter(
        (name) => name.startsWith('hash-talk-shell-') && name !== cacheName,
      );
      // Retain one previous public shell for tabs already running that release.
      const previous = old.at(-1);
      await Promise.all(
        old
          .filter((name) => name !== previous)
          .map((name) => caches.delete(name)),
      );
    }),
  );
  // No clients.claim(): existing tabs keep their original application lifecycle.
});

scope.addEventListener('fetch', (event) => {
  if (!cacheableRequest(event.request, scope.location.origin, assets)) return;
  event.respondWith(
    caches.open(cacheName).then(async (cache) => {
      const cached = await cache.match(event.request.url);
      if (cached) return cached;
      return fetch(event.request);
    }),
  );
});

scope.addEventListener('message', (event) => {
  const data = event.data;
  if (
    typeof data !== 'object' ||
    data === null ||
    !('type' in data) ||
    data.type !== 'ACTIVATE_PUBLIC_SHELL' ||
    !event.source?.url
  )
    return;
  if (new URL(event.source.url).origin !== scope.location.origin) return;
  event.waitUntil(scope.skipWaiting());
});
