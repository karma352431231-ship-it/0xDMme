/** Public shell only. Activation is explicit; no account/crypto operations yet. */
export function startPwa(options: { canActivate?: () => boolean } = {}) {
  let registration: ServiceWorkerRegistration | undefined;
  let state = 'Preparando interface offline…';
  let busy = false;
  let attempts = 0;
  let deadline: number | undefined;
  let applying = false;
  let disposed = false;
  const cleanup = new Set<() => void>();
  const supported = 'serviceWorker' in navigator && window.isSecureContext;

  const render = () => {
    if (disposed) return;
    const status = document.getElementById('pwa-state');
    if (status) status.textContent = state;
    const notice = document.getElementById('update');
    if (notice) notice.hidden = !registration?.waiting;
  };
  const finish = (message: string) => {
    window.clearTimeout(deadline);
    state = message;
    render();
  };
  const failed = () =>
    finish(
      registration?.active
        ? 'Atualização offline indisponível. A versão instalada permanece disponível.'
        : 'Interface offline indisponível. Tente novamente com conexão.',
    );
  const begin = () => {
    state = 'Preparando interface offline…';
    render();
    window.clearTimeout(deadline);
    deadline = window.setTimeout(() => {
      // Browser registration/update promises cannot be cancelled. Keep the
      // concurrency lock until they settle rather than accumulating retries.
      finish(
        'O preparo offline continua. Mantenha o app aberto e conectado; a versão atual segue disponível.',
      );
    }, 10_000);
  };

  function status(): void {
    if (registration?.waiting) {
      finish('Nova versão pronta. Escolha quando atualizar.');
      return;
    }
    if (registration?.installing) {
      render();
      return;
    }
    if (registration?.active) {
      finish('Interface pública instalada para uso offline.');
      return;
    }
    failed();
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
        'O navegador não concluiu o modo offline. Reabra a página para tentar novamente.',
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

  function apply(): void {
    if (!registration?.waiting || applying || disposed) return;
    if (options.canActivate && !options.canActivate()) {
      const result = document.getElementById('update-result');
      if (result)
        result.textContent =
          'Conclua a operação ou salve suas alterações antes de atualizar.';
      return;
    }
    applying = true;
    const changed = () => {
      stop();
      if (location.search === '?atualizar=1')
        location.replace('/' + location.hash);
      else location.reload();
    };
    const stop = () => {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
      cleanup.delete(stop);
      applying = false;
    };
    const failedActivation = () => {
      stop();
      const result = document.getElementById('update-result');
      if (result)
        result.textContent =
          'Atualização não concluída. Reabra a página quando for conveniente.';
    };
    const timer = window.setTimeout(failedActivation, 10_000);
    navigator.serviceWorker.addEventListener('controllerchange', changed, {
      once: true,
    });
    cleanup.add(stop);
    try {
      registration.waiting.postMessage({ type: 'ACTIVATE_PUBLIC_SHELL' });
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
      ?.removeEventListener('click', apply);
    window.removeEventListener('pagehide', dispose);
  }

  if (supported) void prepare();
  else
    state =
      'Instalação e modo offline exigem navegador compatível e HTTPS ou loopback.';
  document.getElementById('apply-update')?.addEventListener('click', apply);
  window.addEventListener('pagehide', dispose);
  return {
    render,
    async check(): Promise<void> {
      if (!supported || disposed) {
        render();
        return;
      }
      if (busy || registration?.installing) {
        state = 'Atualização em andamento. Mantenha o app aberto e conectado.';
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
