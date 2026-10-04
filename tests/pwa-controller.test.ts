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
  postMessage(message: unknown): void {
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

function browser(locationValues: { search?: string; hash?: string } = {}) {
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
  const api = runInNewContext(`${source}\nPwa;`, {
    document: { getElementById: (id: string) => elements.get(id) },
    window,
    navigator: { serviceWorker },
    location: {
      search: '',
      hash: '',
      ...locationValues,
      reload() {
        reloads++;
      },
      replace(url: string) {
        replacements.push(url);
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
  assert.match(scope.status(), /Preparando/);
  const worker = scope.registration.installing;
  assert.ok(worker);
  scope.registration.installing = null;
  worker.change('redundant');
  assert.match(scope.status(), /indisponível/);
  await pwa.check();
  assert.equal(scope.calls(), 2);
  await pwa.check();
  assert.equal(scope.calls(), 2);
  assert.match(scope.status(), /Reabra/);
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
  assert.match(scope.status(), /preparo offline continua/);
  await pwa.check();
  assert.equal(scope.calls(), 1);
  assert.match(scope.status(), /Atualização em andamento/);
  scope.window.dispatchEvent(new Event('pagehide'));
  complete?.(scope.registration);
  await new Promise<void>((resolve) => setImmediate(resolve));
  scope.registration.dispatchEvent(new Event('updatefound'));
  assert.equal(scope.timers(), 0);
  assert.match(scope.status(), /Atualização em andamento/);
});

await test('atualização exige escolha explícita, evita duplicação e recupera timeout de ativação', async () => {
  const scope = browser();
  scope.registration.installing = null;
  scope.registration.active = new Worker();
  scope.registration.waiting = new Worker();
  const pwa = scope.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.match(scope.status(), /Nova versão/);
  assert.equal(scope.registration.waiting.messages.length, 0);
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  assert.equal(scope.registration.waiting.messages.length, 1);
  assert.equal(scope.reloads(), 0);
  scope.expire();
  assert.match(
    scope.elements.get('update-result')?.textContent ?? '',
    /não concluída/,
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
  assert.match(scope.status(), /versão instalada permanece/);
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
  assert.match(scope.status(), /Atualização em andamento/);
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
  assert.match(scope.status(), /instalada para uso offline/);
  assert.equal(scope.timers(), 0);
  const candidate = new Worker();
  scope.registration.installing = candidate;
  scope.registration.dispatchEvent(new Event('updatefound'));
  assert.match(scope.status(), /Preparando/);
  scope.registration.installing = null;
  scope.registration.waiting = candidate;
  candidate.change('installed');
  assert.match(scope.status(), /Nova versão/);
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
  scope.start({ canActivate: () => allowed });
  await new Promise<void>((resolve) => setImmediate(resolve));
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  assert.equal(scope.registration.waiting.messages.length, 0);
  assert.match(scope.elements.get('update-result')?.textContent ?? '', /salve/);
  allowed = true;
  scope.elements.get('apply-update')?.dispatchEvent(new Event('click'));
  assert.equal(scope.registration.waiting.messages.length, 1);
  scope.window.dispatchEvent(new Event('pagehide'));
});
