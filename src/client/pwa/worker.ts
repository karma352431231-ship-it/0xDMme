import { t } from '../../shared/i18n/index.ts';
import { cacheableRequest } from '../../shared/pwa-policy/index.ts';
import { genericNotification } from '../../shared/daily/index.ts';
import { publicNotificationPreview } from '../../shared/public-notification/index.ts';
import { pushSoundEnabled } from '../notification-sound/index.ts';
import { fetchApi, readApiJson } from '../api-response/index.ts';
import { pushLanguage } from '../language/index.ts';
import { setActiveLanguage } from '../../shared/i18n/index.ts';

// Narrow structural interfaces keep DOM client and worker contexts independent.
interface WorkerScope {
  registration: {
    showNotification(
      title: string,
      options: NotificationOptions & { renotify?: boolean },
    ): Promise<void>;
  };
  clients: {
    matchAll(options: {
      type: 'window';
      includeUncontrolled: boolean;
    }): Promise<
      {
        url: string;
        focus(): Promise<unknown>;
        postMessage(message: unknown): void;
      }[]
    >;
    openWindow(url: string): Promise<unknown>;
  };
  addEventListener(
    type: 'push',
    listener: (event: { waitUntil(promise: Promise<unknown>): void }) => void,
  ): void;
  addEventListener(
    type: 'notificationclick',
    listener: (event: {
      notification: { close(): void; data?: unknown };
      waitUntil(promise: Promise<unknown>): void;
    }) => void,
  ): void;
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
const hashes = JSON.parse('{{ASSET_HASHES}}') as Record<string, string>;
const cacheName = 'hash-talk-shell-{{VERSION}}';

async function previousAsset(
  path: string,
  previous: string[],
): Promise<Response | undefined> {
  if (path === '/') return undefined;
  for (const name of previous) {
    const cache = await caches.open(name);
    const response = await cache.match(path);
    if (!response?.ok || response.type !== 'basic') continue;
    const bytes = await response.clone().arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    if (hash === hashes[path]) return response;
  }
  return undefined;
}

scope.addEventListener('install', (event) => {
  // WASM and emoji assets must fit the same bounded installation on mobile.
  const signal = AbortSignal.timeout(60_000);
  event.waitUntil(
    caches
      .open(cacheName)
      .then(async (cache) => {
        const previous = (await caches.keys())
          .filter(
            (name) => name.startsWith('hash-talk-shell-') && name !== cacheName,
          )
          .slice(-2);
        // Consume each body before requesting another asset. Retaining every
        // unread Response can exhaust the browser's connection/stream budget.
        for (const path of assets) {
          signal.throwIfAborted();
          const reused = await previousAsset(path, previous);
          signal.throwIfAborted();
          const response =
            reused ??
            (await fetch(path, {
              cache: 'no-store',
              redirect: 'error',
              signal,
            }));
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
  if (
    event.request.mode === 'navigate' &&
    new URL(event.request.url).pathname === '/'
  ) {
    event.respondWith(appDocument(event.request));
    return;
  }
  event.respondWith(
    caches.open(cacheName).then(async (cache) => {
      const cached = await cache.match(event.request.url);
      if (cached) return cached;
      return fetch(event.request);
    }),
  );
});

async function appDocument(request: Request): Promise<Response> {
  try {
    // Online entry always uses the published HTML, independently of offline prep.
    return await fetch(request, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request.url);
    // Keep the offline document paired with its fully installed release assets.
    if (cached) return cached;
    throw error;
  }
}

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
async function notify(): Promise<void> {
  try {
    const response = await fetchApi(
      'account/push-check',
      '/api/account/push-check',
      {
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      },
    );
    const data = await readApiJson(response, 'account/push-check');
    if (
      !response.ok ||
      typeof data !== 'object' ||
      data === null ||
      !('allowed' in data) ||
      data.allowed !== true
    )
      return;
    await wakeOpenClients();
    const sound = await pushSoundEnabled();
    setActiveLanguage(await pushLanguage());
    const appearance = notificationAppearance(data);
    await scope.registration.showNotification(appearance.title, {
      ...appearance,
      icon: '/icon-192.png',
      badge: '/notification-badge.png',
      silent: !sound,
      renotify: sound,
    });
  } catch {
    /* Unverified authorization/mute never falls back to an alert. The message remains durable. */
  }
}
/** A closing window must not prevent the independently authorized OS alert. */
async function wakeOpenClients(): Promise<void> {
  try {
    const windows = await scope.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    for (const client of windows) {
      if (new URL(client.url).origin === scope.location.origin)
        client.postMessage({ type: 'ACTIVITY_CHANGED' });
    }
  } catch {
    // Live hints, return-to-app reconciliation and the foreground fallback remain active.
  }
}
function notificationAppearance(data: object): {
  title: string;
  body: string;
  tag: string;
  data?: { href: string };
} {
  const call = 'call' in data && data.call === true;
  const showCall = call && 'showCall' in data && data.showCall === true;
  if (!call && 'publicPreview' in data) {
    const preview = publicNotificationPreview(data.publicPreview);
    return {
      title: preview.reply
        ? t('@{0} respondeu · 0xDMme', [preview.author.handle])
        : t('@{0} publicou · 0xDMme', [preview.author.handle]),
      body: preview.text || t('Nova publicação com mídia.'),
      tag: '0xdmme-public-activity',
      data: {
        href: `/#comunidades?id=${preview.community}&post=${preview.post}`,
      },
    };
  }
  return {
    title: genericNotification.title,
    body: showCall
      ? t('Chamada de voz recebida. Abra o app para atender.')
      : t(genericNotification.body),
    tag: call ? '0xdmme-call' : '0xdmme-activity',
  };
}
scope.addEventListener('push', (event) => {
  event.waitUntil(notify());
});
function notificationHref(data: unknown): string {
  const href =
    typeof data === 'object' &&
    data !== null &&
    'href' in data &&
    typeof data.href === 'string'
      ? data.href
      : '';
  const publicPost =
    /^\/#comunidades\?id=[a-f0-9-]{36}&post=[a-f0-9-]{36}$/u.test(href);
  return new URL(publicPost ? href : '/#conversas', scope.location.origin).href;
}
scope.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = notificationHref(event.notification.data);
      const windows = await scope.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const existing = windows.find(
        (client) => new URL(client.url).origin === scope.location.origin,
      );
      if (existing) {
        if (url.includes('#comunidades'))
          existing.postMessage({
            type: 'OPEN_PUBLIC_POST',
            hash: new URL(url).hash,
          });
        await existing.focus();
      } else await scope.clients.openWindow(url);
    })(),
  );
});
