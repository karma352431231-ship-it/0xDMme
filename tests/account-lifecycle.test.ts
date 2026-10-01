import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import type { startAccount } from '../src/client/account/index.ts';

const bundle = await build({
  entryPoints: ['src/client/account/index.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'Account',
});
const source = bundle.outputFiles[0]?.text;
if (!source) throw new Error('Build de teste ausente.');
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function scope(options: {
  accounts?: Promise<unknown>;
  signature?: Promise<unknown>;
  login?: Promise<unknown>;
}) {
  const address = `0x${'1'.repeat(40)}`;
  const listeners = new Map<string, () => void>();
  const requests: string[] = [];
  const window = Object.assign(new EventTarget(), {
    ethereum: {
      isMetaMask: true,
      request(input: { method: string }): Promise<unknown> {
        if (input.method === 'eth_requestAccounts')
          return options.accounts ?? Promise.resolve([address]);
        if (input.method === 'eth_accounts') return Promise.resolve([address]);
        if (input.method === 'eth_chainId') return Promise.resolve('0x1');
        return options.signature ?? Promise.resolve(`0x${'a'.repeat(130)}`);
      },
      on(event: string, listener: () => void) {
        listeners.set(event, listener);
      },
      removeListener(event: string) {
        listeners.delete(event);
      },
    },
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
  const button = Object.assign(new EventTarget(), {
    dataset: { wallet: 'MetaMask' },
    disabled: false,
    hidden: false,
  });
  const mounted = {
    innerHTML: '',
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: (selector: string) =>
      selector === 'button' || selector === '[data-wallet]' ? [button] : [],
  };
  const session = {
    accountId: randomUUID(),
    ecosystem: 'evm',
    address,
    name: '',
    deviceId: randomUUID(),
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    csrf: 'c'.repeat(64),
    profileRevision: 0,
  };
  const states: unknown[] = [];
  const api = runInNewContext(`${source}\nAccount;`, {
    window,
    Event,
    CustomEvent,
    URL,
    TextEncoder,
    crypto,
    AbortSignal,
    Response,
    location: { origin: 'http://127.0.0.1:45100' },
    document: { activeElement: null },
    localStorage: { getItem: () => session.deviceId },
    async fetch(path: string) {
      requests.push(path);
      if (path.endsWith('/handoff-status')) return Response.json(null);
      if (path.endsWith('/session')) return new Response('{}', { status: 401 });
      if (path.endsWith('/challenge'))
        return Response.json({ id: randomUUID(), message: 'synthetic login' });
      if (path.endsWith('/login'))
        return Response.json(options.login ? await options.login : session);
      return Response.json({ status: 'signed-out' });
    },
  }) as { startAccount: typeof startAccount };
  const account = api.startAccount({ changed: (value) => states.push(value) });
  account.mount(mounted as unknown as HTMLElement);
  return {
    account,
    states,
    requests,
    session,
    click: () => button.dispatchEvent(new Event('click')),
    changed: () => listeners.get('accountsChanged')?.(),
    expire: () => {
      for (const callback of [...timers.values()]) callback();
    },
    dispose: () => window.dispatchEvent(new Event('pagehide')),
  };
}

await test('prompt que resolve após prazo não cria desafio e não acumula pedidos', async () => {
  const accounts = deferred<unknown>();
  const browser = scope({ accounts: accounts.promise });
  await tick();
  browser.click();
  await tick();
  assert.equal(browser.account.canActivate(), false);
  browser.expire();
  browser.click();
  accounts.resolve([browser.session.address]);
  await tick();
  assert.deepEqual(browser.requests, [
    '/api/account/session',
    '/api/account/handoff-status',
  ]);
  assert.equal(browser.account.canActivate(), true);
  browser.dispose();
});

await test('troca de conta durante assinatura invalida login antes de enviá-lo', async () => {
  const signature = deferred<unknown>();
  const browser = scope({ signature: signature.promise });
  await tick();
  browser.click();
  await tick();
  browser.changed();
  signature.resolve(`0x${'a'.repeat(130)}`);
  await tick();
  assert.ok(browser.requests.includes('/api/account/challenge'));
  assert.equal(browser.requests.includes('/api/account/login'), false);
  assert.deepEqual(browser.states, []);
  browser.dispose();
});

await test('resposta autenticada tardia após mudança é revogada sem abrir perfil privado', async () => {
  const login = deferred<unknown>();
  const browser = scope({ login: login.promise });
  await tick();
  browser.click();
  await tick();
  assert.ok(browser.requests.includes('/api/account/login'));
  browser.changed();
  login.resolve(browser.session);
  await tick();
  assert.ok(browser.requests.includes('/api/account/logout'));
  assert.equal(browser.requests.includes('/api/account/profile'), false);
  assert.deepEqual(browser.states, []);
  browser.dispose();
});
