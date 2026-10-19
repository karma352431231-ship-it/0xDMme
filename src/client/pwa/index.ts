import { t } from '../../shared/i18n/index.ts';
import { startNotificationNavigation } from './notification-navigation.ts';

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
    if (
      url.origin === location.origin &&
      /-[a-f0-9]{16}\.(?:js|css)$/u.test(url.pathname)
    )
      paths.add(url.pathname);
  }
  return [...paths].slice(0, 32);
}

function comparableAssets(): string[] {
  return typeof MessageChannel === 'function' ? pageReleaseAssets() : [];
}

/**
 * Whether a worker's release contains every given file of this page. `null`
 * means unknown: no reply in time (an older worker) or the channel failed.
 */
function runsRelease(
  worker: ServiceWorker,
  paths: string[],
): Promise<boolean | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let timer = 0;
    const done = (value: boolean | null) => {
      window.clearTimeout(timer);
      channel.port1.close();
      resolve(value);
    };
    timer = window.setTimeout(() => done(null), 3000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      done(
        typeof data === 'object' &&
          data !== null &&
          'included' in data &&
          typeof data.included === 'boolean'
          ? data.included
          : null,
      );
    };
    try {
      worker.postMessage({ type: 'SHELL_INCLUDES', paths }, [channel.port2]);
    } catch {
      done(null);
    }
  });
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
  let state = t('Preparando interface offline…');
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
            'Atualização offline indisponível. A versão instalada permanece disponível.',
          )
        : t('Interface offline indisponível. Tente novamente com conexão.'),
    );
  const begin = () => {
    state = t('Preparando interface offline…');
    render();
    window.clearTimeout(deadline);
    deadline = window.setTimeout(() => {
      // Browser registration/update promises cannot be cancelled. Keep the
      // concurrency lock until they settle rather than accumulating retries.
      finish(
        t(
          'O preparo offline continua. Mantenha o app aberto e conectado; a versão atual segue disponível.',
        ),
      );
    }, 10_000);
  };

  function status(): void {
    if (registration?.waiting) {
      assess(registration.waiting, true);
      return;
    }
    if (registration?.installing) {
      render();
      return;
    }
    if (registration?.active) {
      finish(t('Interface pública instalada para uso offline.'));
      assess(registration.active, false);
      return;
    }
    failed();
  }
  /**
   * A reload already brings the new HTML and files from the network while the
   * new worker may still be installing. Such a page is current: it gets no
   * prompt for an update it already has. Its worker still waits for the old
   * tabs to close (no automatic skipWaiting, so other tabs keep their release).
   */
  function assess(worker: ServiceWorker, waiting: boolean): void {
    const id = ++assessment;
    const paths = comparableAssets();
    if (waiting) finish(t('Nova versão pronta. Escolha quando atualizar.'));
    if (!paths.length) {
      // Nothing to compare: a waiting worker keeps the explicit choice.
      outdated = waiting;
      render();
      return;
    }
    void runsRelease(worker, paths).then((current) => {
      if (disposed || id !== assessment) return;
      outdated = current === null ? waiting : !current;
      if (current && waiting) {
        finish(t('Esta página já usa a versão mais recente.'));
        return;
      }
      render();
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
    status();
  }

  async function prepare(): Promise<void> {
    if (busy || disposed) return;
    if (attempts >= 2) {
      finish(
        t(
          'O navegador não concluiu o modo offline. Reabra a página para tentar novamente.',
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
      ? t('Conclua a operação ou salve suas alterações antes de atualizar.')
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
          'Atualização não concluída. Reabra a página quando for conveniente.',
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
      'Instalação e modo offline exigem navegador compatível e HTTPS ou loopback.',
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
        state = t(
          'Atualização em andamento. Mantenha o app aberto e conectado.',
        );
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
