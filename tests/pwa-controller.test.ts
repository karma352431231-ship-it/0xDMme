import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { startPwa } from '../src/client/pwa/index.ts';

const bundle = await build({
  entryPoints: ['src/client/pwa/index.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Pwa',
  platform: 'browser',
});
const source = bundle.outputFiles[0]?.text;
if (!source) throw new Error('Build de teste ausente.');

class Worker extends EventTarget {
  state = 'installing';
  messages: unknown[] = [];
  /** Hashed files of this release; `null` models an older worker that never replies. */
  release: string[] | null = null;
  postMessage(message: unknown, ports?: MessagePort[]): void {
    const query = message as { type?: string; paths?: string[] };
    if (query.type === 'SHELL_INCLUDES') {
      if (this.release)
        ports?.[0]?.postMessage({
          type: 'SHELL_INCLUDES_RESULT',
          included: (query.paths ?? []).every((path) =>
            this.release?.includes(path),
          ),
        });
      return;
    }
    this.messages.push(message);
  }
  change(state: string): void {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}
class Registration extends EventTarget {
  installing: Worker | null = new Worker();
  active: Worker | null = null;
  waiting: Worker | null = null;
  updates = 0;
  updateResult: Promise<Registration> = Promise.resolve(this);
  update(): Promise<Registration> {
    this.updates++;
    return this.updateResult;
  }
}

function browser(
  locationValues: { search?: string; hash?: string } = {},
  page: string[] | null = null,
) {
  const elements = new Map(
    ['pwa-state', 'update', 'apply-update', 'update-result'].map((id) => [
      id,
      Object.assign(new EventTarget(), { textContent: '', hidden: true }),
    ]),
  );
  const window = Object.assign(new EventTarget(), {
    isSecureContext: true,
    setTimeout(callback: () => void) {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
  });
  const timers = new Map<number, () => void>();
  let timerId = 0;
  let reloads = 0;
  const replacements: string[] = [];
  let calls = 0;
  let result: Promise<Registration>;
  const registration = new Registration();
  result = Promise.resolve(registration);
  const serviceWorker = Object.assign(new EventTarget(), {
    register() {
      calls++;
      return result;
    },
  });
  const location = {
    search: '',
    hash: '',
    pathname: '/',
    href: 'https://0xdmme.app/',
    origin: 'https://0xdmme.app',
    ...locationValues,
    reload() {
      reloads++;
    },
    replace(url: string) {
      replacements.push(url);
    },
  };
  const scripts = (page ?? []).map((src) => ({
    getAttribute: (name: string) => (name === 'src' ? src : null),
  }));
  const api = runInNewContext(`${source}\nPwa;`, {
    document: {
      getElementById: (id: string) => elements.get(id),
      querySelectorAll: () => scripts,
    },
    // Only pages that list their files compare releases, as in the browser.
    ...(page ? { MessageChannel } : {}),
    window,
    navigator: { serviceWorker },
    location,
    URLSearchParams,
    URL,
    Event,
    queueMicrotask,
    history: {
      pushState: (_state: unknown, _title: string, href: string) => {
        const url = new URL(href, 'http://local.invalid');
        Object.assign(location, {
          hash: url.hash,
          pathname: url.pathname,
          search: url.search,
        });
      },
    },
  }) as { startPwa: typeof startPwa };
  const status = () => elements.get('pwa-state')?.textContent ?? '';
  const expire = () => {
    for (const callback of [...timers.values()]) callback();
  };
  return {
    start: api.startPwa,
    registration,
    serviceWorker,
    location,
    window,
    elements,
    status,
    expire,
    setResult(promise: Promise<Registration>) {
      result = promise;
    },
    calls: () => calls,
    reloads: () => reloads,
    replacements: () => replacements,
    timers: () => timers.size,
  };
}

await test('registro resolvido não afirma offline antes de ativação e instalação perdida permite retry limitado', async () => {
  const scope = browser();
  const pwa = scope.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  pwa.render();
  assert.match(scope.status(), /Preparing/);
  const worker = scope.registration.installing;
  assert.ok(worker);
  scope.registration.installing = null;
  worker.change('redundant');
  assert.match(scope.status(), /unavailable/);
  await pwa.check();
  assert.equal(scope.calls(), 2);
  await pwa.check();
  assert.equal(scope.calls(), 2);
  assert.match(scope.status(), /Reopen/);
});

await test('entrada online volta ao endereço offline após ativação explícita, preservando a tela escolhida', async () => {
  const scope = browser({ search: '?atualizar=1', hash: '#contatos' });
  scope.registration.installing = null;
  scope.registration.active = new Worker();
  scope.registration.waiting = new Worker();
  scope.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(scope.replacements(), []);
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  scope.serviceWorker.dispatchEvent(new Event('controllerchange'));
  assert.deepEqual(scope.replacements(), ['/#contatos']);
  assert.equal(scope.reloads(), 0);
});

await test('registro pendente tem prazo visual sem acumular promessas e página encerrada ignora conclusão tardia', async () => {
  const scope = browser();
  let complete: ((value: Registration) => void) | undefined;
  scope.setResult(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const pwa = scope.start();
  scope.expire();
  assert.match(scope.status(), /Offline preparation continues/);
  await pwa.check();
  assert.equal(scope.calls(), 1);
  assert.match(scope.status(), /Update in progress/);
  scope.window.dispatchEvent(new Event('pagehide'));
  complete?.(scope.registration);
  await new Promise<void>((resolve) => setImmediate(resolve));
  scope.registration.dispatchEvent(new Event('updatefound'));
  assert.equal(scope.timers(), 0);
  assert.match(scope.status(), /Update in progress/);
});

await test('atualização exige escolha explícita, evita duplicação e recupera timeout de ativação', async () => {
  const scope = browser();
  scope.registration.installing = null;
  scope.registration.active = new Worker();
  scope.registration.waiting = new Worker();
  const pwa = scope.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.match(scope.status(), /New version/);
  assert.equal(scope.registration.waiting.messages.length, 0);
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  assert.equal(scope.registration.waiting.messages.length, 1);
  assert.equal(scope.reloads(), 0);
  scope.expire();
  assert.match(
    scope.elements.get('update-result')?.textContent ?? '',
    /not completed/,
  );
  scope.serviceWorker.dispatchEvent(new Event('controllerchange'));
  assert.equal(scope.reloads(), 0);
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  scope.serviceWorker.dispatchEvent(new Event('controllerchange'));
  assert.equal(scope.reloads(), 1);
  scope.registration.waiting = null;
  scope.registration.updateResult = Promise.reject(
    new Error('synthetic-offline'),
  );
  await pwa.check();
  assert.match(scope.status(), /installed version remains/);
});

await test('consulta de atualização pendente não inicia concorrentes depois do prazo', async () => {
  const scope = browser();
  scope.registration.installing = null;
  scope.registration.active = new Worker();
  scope.registration.updateResult = new Promise(() => {
    /* Native API can remain pending. */
  });
  const pwa = scope.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  void pwa.check();
  scope.expire();
  await pwa.check();
  assert.equal(scope.registration.updates, 1);
  assert.match(scope.status(), /Update in progress/);
  scope.window.dispatchEvent(new Event('pagehide'));
  assert.equal(scope.timers(), 0);
});

await test('instalação só publica sucesso após ativação e nova versão aguarda escolha', async () => {
  const scope = browser();
  const pwa = scope.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const initial = scope.registration.installing;
  assert.ok(initial);
  scope.registration.installing = null;
  scope.registration.active = initial;
  initial.change('activated');
  assert.match(scope.status(), /installed for offline use/);
  assert.equal(scope.timers(), 0);
  const candidate = new Worker();
  scope.registration.installing = candidate;
  scope.registration.dispatchEvent(new Event('updatefound'));
  assert.match(scope.status(), /Preparing/);
  scope.registration.installing = null;
  scope.registration.waiting = candidate;
  candidate.change('installed');
  assert.match(scope.status(), /New version/);
  assert.equal(scope.elements.get('update')?.hidden, false);
  assert.equal(candidate.messages.length, 0);
  assert.equal(scope.reloads(), 0);
  pwa.render();
});

await test('atualização espera operação de conta e alterações não salvas', async () => {
  const scope = browser();
  scope.registration.installing = null;
  scope.registration.active = new Worker();
  scope.registration.waiting = new Worker();
  let allowed = false;
  let reason: string | null =
    'Abertura pendente. Cancele em Configurações → Aparelhos.';
  scope.start({ canActivate: () => allowed, blockedReason: () => reason });
  await new Promise<void>((resolve) => setImmediate(resolve));
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  assert.equal(scope.registration.waiting.messages.length, 0);
  assert.match(
    scope.elements.get('update-result')?.textContent ?? '',
    /Aparelhos/,
  );
  reason = null;
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  assert.equal(scope.registration.waiting.messages.length, 0);
  assert.match(scope.elements.get('update-result')?.textContent ?? '', /save/);
  allowed = true;
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  assert.equal(scope.registration.waiting.messages.length, 1);
  scope.window.dispatchEvent(new Event('pagehide'));
});

await test('Atualizar agora aguarda uma sincronização transitória e revalida antes de ativar', async () => {
  const scope = browser();
  scope.registration.waiting = new Worker();
  let idle = false;
  scope.start({ waitForIdle: true, canActivate: () => idle });
  await new Promise<void>((resolve) => setImmediate(resolve));
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  assert.equal(scope.registration.waiting.messages.length, 0);
  idle = true;
  scope.expire();
  assert.equal(scope.registration.waiting.messages.length, 1);
  scope.window.dispatchEvent(new Event('pagehide'));
  assert.equal(scope.timers(), 0);
});

await test('abrir push público muda só a rota da aba, sem recarga, e recusa destinos externos', () => {
  const scope = browser();
  scope.start();
  const id = crypto.randomUUID(),
    post = crypto.randomUUID();
  const hash = `#comunidades?id=${id}&post=${post}`;
  scope.serviceWorker.dispatchEvent(
    new MessageEvent('message', { data: { type: 'OPEN_PUBLIC_POST', hash } }),
  );
  assert.equal(scope.location.pathname, `/communities/id/${id}/posts/${post}`);
  scope.serviceWorker.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'OPEN_PUBLIC_POST', hash: 'https://other.example' },
    }),
  );
  assert.equal(scope.location.pathname, `/communities/id/${id}/posts/${post}`);
  assert.equal(scope.reloads(), 0);
  scope.window.dispatchEvent(new Event('pagehide'));
});

const current = ['/app-1111111111111111.js', '/app-2222222222222222.css'];
const older = ['/app-0000000000000000.js', '/app-2222222222222222.css'];
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

await test('página recarregada já na versão nova não pede atualização nem ativa o worker sozinha', async () => {
  const scope = browser({}, current);
  scope.registration.installing = null;
  scope.registration.active = Object.assign(new Worker(), { release: older });
  scope.registration.waiting = Object.assign(new Worker(), {
    release: current,
  });
  scope.start();
  await settle();
  assert.equal(scope.elements.get('update')?.hidden, true);
  // Other tabs may still run the old release: no automatic skipWaiting.
  assert.equal(scope.registration.waiting.messages.length, 0);
  assert.match(scope.status(), /already runs the latest/);
  assert.equal(scope.reloads(), 0);
  scope.window.dispatchEvent(new Event('pagehide'));
});

await test('página antiga mostra o aviso e recarrega pela ativação do worker, sem esperar controllerchange', async () => {
  const scope = browser({}, older);
  scope.registration.installing = null;
  scope.registration.active = Object.assign(new Worker(), { release: older });
  const waiting = Object.assign(new Worker(), { release: current });
  scope.registration.waiting = waiting;
  scope.start();
  await settle();
  assert.equal(scope.elements.get('update')?.hidden, false);
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  assert.equal(
    JSON.stringify(waiting.messages),
    '[{"type":"ACTIVATE_PUBLIC_SHELL"}]',
  );
  waiting.change('activated');
  scope.serviceWorker.dispatchEvent(new Event('controllerchange'));
  assert.equal(scope.reloads(), 1);
  scope.window.dispatchEvent(new Event('pagehide'));
});

await test('aba antiga sob worker já ativo e mais novo atualiza só recarregando; worker antigo mudo não inventa aviso', async () => {
  const scope = browser({}, older);
  scope.registration.installing = null;
  scope.registration.active = Object.assign(new Worker(), { release: current });
  scope.start();
  await settle();
  assert.equal(scope.elements.get('update')?.hidden, false);
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  assert.equal(scope.reloads(), 1);
  const silent = browser({}, older);
  silent.registration.installing = null;
  silent.registration.active = new Worker();
  silent.start();
  await settle();
  silent.expire();
  await settle();
  assert.equal(silent.elements.get('update')?.hidden, true);
  scope.window.dispatchEvent(new Event('pagehide'));
  silent.window.dispatchEvent(new Event('pagehide'));
});
