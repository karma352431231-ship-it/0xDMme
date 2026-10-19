import { t } from '../../shared/i18n/index.ts';
import { startNotificationNavigation } from './notification-navigation.ts';

const releaseFile = /-[a-f0-9]{16}\.(?:js|css)$/u;
/** Hashed release files this page loaded; unhashed or foreign files say nothing. */
function pageReleaseAssets(): string[] {
  const paths = new Set<string>();
  for (const node of document.querySelectorAll(
    'script[src], link[rel="stylesheet"][href], link[rel="modulepreload"][href]',
  )) {
    const url = new URL(
      node.getAttribute('src') ?? node.getAttribute('href') ?? '',
      location.href,
    );
    if (url.origin === location.origin && releaseFile.test(url.pathname))
      paths.add(url.pathname);
  }
  return [...paths].slice(0, 32);
}

/**
 * Whether this page runs the release the server publishes now. The answer is
 * the public app HTML (an app route, so the worker never serves it from cache;
 * no cookies, about 5 KB compressed). `null` means unknown: offline, server
 * error or a page without comparable files.
 */
async function runsPublishedRelease(own: string[]): Promise<boolean | null> {
  try {
    const response = await fetch('/communities', {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    const html = response.ok ? await response.text() : '';
    if (!html || html.length > 512 * 1024) return null;
    const published = new Set(
      [...html.matchAll(/(?:src|href)="(\/[^"?#]+)"/gu)]
        .map((match) => match[1] ?? '')
        .filter((path) => releaseFile.test(path)),
    );
    if (!published.size) return null;
    return own.every((path) => published.has(path));
  } catch {
    return null;
  }
}
/** Explicit shell activation waits for private operations and unsaved drafts. */
export function startPwa(
  options: {
    canActivate?: () => boolean;
    waitForIdle?: boolean;
    blockedReason?: () => string | null;
  } = {},
) {
  let registration: ServiceWorkerRegistration | undefined;
  let state = t('Preparing offline interface…');
  let busy = false;
  let attempts = 0;
  let deadline: number | undefined;
  let applying = false;
  let disposed = false;
  // Shown only when this page runs an older release than the newest worker.
  let outdated = false;
  let assessment = 0;
  const cleanup = new Set<() => void>();
  const supported = 'serviceWorker' in navigator && window.isSecureContext;
  if (supported) cleanup.add(startNotificationNavigation());

  const render = () => {
    if (disposed) return;
    const status = document.getElementById('pwa-state');
    if (status) status.textContent = state;
    const notice = document.getElementById('update');
    if (notice) notice.hidden = !outdated;
  };
  const finish = (message: string) => {
    window.clearTimeout(deadline);
    state = message;
    render();
  };
  const failed = () =>
    finish(
      registration?.active
        ? t(
            'Offline update unavailable. The installed version remains available.',
          )
        : t('Offline interface unavailable. Try again with a connection.'),
    );
  const begin = () => {
    state = t('Preparing offline interface…');
    render();
    window.clearTimeout(deadline);
    deadline = window.setTimeout(() => {
      // Browser registration/update promises cannot be cancelled. Keep the
      // concurrency lock until they settle rather than accumulating retries.
      finish(
        t(
          'Offline preparation continues. Keep the app open and connected; the current version remains available.',
        ),
      );
    }, 10_000);
  };

  function status(): void {
    if (registration?.waiting) {
      assess();
      return;
    }
    if (registration?.installing) {
      render();
      return;
    }
    if (registration?.active) {
      finish(t('Public interface installed for offline use.'));
      return;
    }
    failed();
  }
  /**
   * Decide the notice by what the server publishes, not by worker events: a
   * reload already brings the new HTML while the new worker may still be
   * installing, and an older waiting worker may linger from a past visit. The
   * notice appears only when this page is behind the published release and a
   * newer worker is ready (or already active). Nothing shows while unknown,
   * except a waiting worker offline, which keeps the explicit choice. A
   * current page never activates its worker by itself (no automatic
   * skipWaiting), so other tabs keep their release.
   */
  function assess(): void {
    const id = ++assessment;
    const own = typeof fetch === 'function' ? pageReleaseAssets() : [];
    if (!own.length) {
      // Nothing to compare: a waiting worker keeps the explicit choice.
      outdated = !!registration?.waiting;
      if (outdated) finish(t('New version ready. Choose when to update.'));
      else render();
      return;
    }
    void runsPublishedRelease(own).then((latest) => {
      if (disposed || id !== assessment) return;
      const waiting = !!registration?.waiting;
      outdated =
        latest === null ? waiting : !latest && !registration?.installing;
      if (outdated) finish(t('New version ready. Choose when to update.'));
      else if (waiting) finish(t('This page already runs the latest version.'));
      else render();
    });
  }

  function observe(worker: ServiceWorker): void {
    const stop = () => {
      worker.removeEventListener('statechange', changed);
      cleanup.delete(stop);
    };
    const changed = () => {
      if (disposed) return;
      if (worker.state === 'installed' || worker.state === 'activated')
        status();
      if (worker.state === 'redundant') failed();
      if (worker.state === 'activated' || worker.state === 'redundant') stop();
    };
    worker.addEventListener('statechange', changed);
    cleanup.add(stop);
  }

  function watch(result: ServiceWorkerRegistration): void {
    registration = result;
    if (result.installing) observe(result.installing);
    const found = () => {
      if (result.installing) {
        begin();
        observe(result.installing);
      }
    };
    result.addEventListener('updatefound', found);
    cleanup.add(() => result.removeEventListener('updatefound', found));
    // Another tab chose to update: this tab may now run behind the new worker.
    const replaced = () => {
      if (!applying && !disposed) assess();
    };
    navigator.serviceWorker.addEventListener('controllerchange', replaced);
    cleanup.add(() =>
      navigator.serviceWorker.removeEventListener('controllerchange', replaced),
    );
    status();
  }

  async function prepare(): Promise<void> {
    if (busy || disposed) return;
    if (attempts >= 2) {
      finish(
        t(
          'The browser did not complete offline mode. Reopen the page to try again.',
        ),
      );
      return;
    }
    attempts++;
    busy = true;
    begin();
    try {
      const result = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      });
      // register() completing is not evidence that installation/cache succeeded.
      if (!disposed) watch(result);
    } catch {
      if (!disposed) failed();
    } finally {
      busy = false;
    }
  }

  function activationBlock(): string | null {
    const blocked = options.blockedReason?.();
    if (blocked) return blocked;
    return options.canActivate?.() === false
      ? t('Finish the operation or save your changes before updating.')
      : null;
  }
  let activationRetry: number | undefined;
  let retryUntil = 0;
  const stopRetry = () => {
    window.clearTimeout(activationRetry);
    activationRetry = undefined;
  };
  cleanup.add(stopRetry);
  function requestApply(): void {
    stopRetry();
    retryUntil = Date.now() + 5000;
    apply();
  }
  /** Explains a blocked update and, when allowed, retries it briefly. */
  function deferred(): boolean {
    const blocked = activationBlock();
    if (!blocked) return false;
    const result = document.getElementById('update-result');
    if (result) result.textContent = blocked;
    if (options.waitForIdle && Date.now() < retryUntil)
      activationRetry = window.setTimeout(apply, 200);
    return true;
  }
  function reloadPage(): void {
    if (location.search === '?atualizar=1')
      location.replace((location.pathname ?? '/') + location.hash);
    else location.reload();
  }
  function apply(): void {
    const waiting = registration?.waiting;
    if (!(waiting || outdated) || applying || disposed || deferred()) return;
    // A newer worker is already active (another tab updated): reloading is the update.
    if (!waiting) reloadPage();
    else activate(waiting);
  }
  /**
   * Reload once the new worker takes over. A page the old worker never
   * controlled (hard reload, first visit) gets no controllerchange, so the
   * worker's own activation also counts; either signal reloads only once.
   */
  function activate(waiting: ServiceWorker): void {
    applying = true;
    const changed = () => {
      stop();
      reloadPage();
    };
    const activated = () => {
      if (waiting.state === 'activated') changed();
    };
    const stop = () => {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
      waiting.removeEventListener('statechange', activated);
      cleanup.delete(stop);
      applying = false;
    };
    const failedActivation = () => {
      stop();
      const result = document.getElementById('update-result');
      if (result)
        result.textContent = t(
          'Update not completed. Reopen the page when convenient.',
        );
    };
    const timer = window.setTimeout(failedActivation, 10_000);
    navigator.serviceWorker.addEventListener('controllerchange', changed, {
      once: true,
    });
    waiting.addEventListener('statechange', activated);
    cleanup.add(stop);
    try {
      waiting.postMessage({ type: 'ACTIVATE_PUBLIC_SHELL' });
    } catch {
      failedActivation();
    }
  }

  async function update(current: ServiceWorkerRegistration): Promise<void> {
    busy = true;
    begin();
    try {
      await current.update();
      if (!disposed) status();
    } catch {
      if (!disposed) failed();
    } finally {
      busy = false;
    }
  }

  function dispose(event: PageTransitionEvent): void {
    if (event.persisted) return; // Keep listeners when restored from back/forward cache.
    disposed = true;
    window.clearTimeout(deadline);
    for (const stop of cleanup) stop();
    document
      .getElementById('apply-update')
      ?.removeEventListener('click', requestApply);
    window.removeEventListener('pagehide', dispose);
  }

  if (supported) void prepare();
  else
    state = t(
      'Installation and offline mode require a compatible browser and HTTPS or loopback.',
    );
  document
    .getElementById('apply-update')
    ?.addEventListener('click', requestApply);
  window.addEventListener('pagehide', dispose);
  return {
    render,
    async check(): Promise<void> {
      if (!supported || disposed) {
        render();
        return;
      }
      if (busy || registration?.installing) {
        state = t('Update in progress. Keep the app open and connected.');
        render();
        return;
      }
      if (!registration?.active) {
        await prepare();
        return;
      }
      await update(registration);
    },
  };
}
