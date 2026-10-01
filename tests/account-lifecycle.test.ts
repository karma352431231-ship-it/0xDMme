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
  hash?: string;
  pathname?: string;
  challenge?: Promise<unknown>;
  handoffSign?: Promise<unknown>;
  sessionResponse?: Promise<Response>;
  navigationType?: string;
  historyState?: unknown;
  historyRejected?: boolean;
  challengeFailure?: number;
}) {
  const address = `0x${'1'.repeat(40)}`;
  const listeners = new Map<string, () => void>();
  const requests: string[] = [];
  const inputs = new Map<string, unknown>();
  const navigated: string[] = [];
  const providerRequests: string[] = [];
  const historyWrites: unknown[] = [];
  const location = {
    origin: 'https://0xdmme.app',
    pathname: options.pathname ?? '/',
    hash: options.hash ?? '',
    assign: (url: string) => navigated.push(url),
  };
  const window = Object.assign(new EventTarget(), {
    ethereum: {
      isMetaMask: true,
      request(input: { method: string }): Promise<unknown> {
        providerRequests.push(input.method);
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
  const approve = Object.assign(new EventTarget(), {
    disabled: false,
    hidden: false,
    textContent: '',
  });
  const picker = Object.assign(new EventTarget(), {
    hidden: false,
    setAttribute: () => {},
    focus: () => {},
  });
  const status = { textContent: '' };
  const diagnostic = { textContent: '' };
  const back = { hidden: false, href: '' };
  const nodes = new Map<string, unknown>([
    ['[data-wallet-approve]', approve],
    ['[data-wallet-picker-toggle]', picker],
    ['[data-account-status]', status],
    ['[data-wallet-diagnostic]', diagnostic],
    ['[data-wallet-back]', back],
  ]);
  const mounted = {
    innerHTML: '',
    addEventListener: () => {},
    querySelector: (selector: string) => nodes.get(selector) ?? null,
    querySelectorAll: (selector: string) =>
      selector === 'button'
        ? [button, approve]
        : selector === '[data-wallet]'
          ? [button]
          : [],
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
  const challengeResponse = async () => {
    if (options.challengeFailure)
      return Response.json(
        { error: 'Pedido rejeitado.' },
        { status: options.challengeFailure },
      );
    return Response.json(
      options.challenge
        ? await options.challenge
        : { id: randomUUID(), message: 'synthetic login' },
    );
  };
  const responses = new Map<string, () => Promise<Response>>([
    ['/api/account/handoff-status', () => Promise.resolve(Response.json(null))],
    [
      '/api/account/session',
      async () =>
        options.sessionResponse ?? new Response('{}', { status: 401 }),
    ],
    ['/api/account/challenge', challengeResponse],
    ['/api/account/handoff-challenge', challengeResponse],
    [
      '/api/account/handoff-sign',
      async () =>
        Response.json(
          options.handoffSign
            ? await options.handoffSign
            : { status: 'signed' },
        ),
    ],
    [
      '/api/account/login',
      async () => Response.json(options.login ? await options.login : session),
    ],
  ]);
  const api = runInNewContext(`${source}\nAccount;`, {
    window,
    Event,
    CustomEvent,
    URL,
    TextEncoder,
    URLSearchParams,
    crypto,
    AbortSignal,
    Response,
    location,
    navigator: { userAgent: 'Android' },
    history: {
      state: options.historyState ?? null,
      replaceState: (_state: unknown, _title: string, hash: string) => {
        if (options.historyRejected) throw new Error('History blocked');
        historyWrites.push(_state);
        location.hash = hash;
      },
    },
    performance: {
      getEntriesByType: () => [{ type: options.navigationType ?? 'navigate' }],
    },
    document: { activeElement: null },
    localStorage: { getItem: () => session.deviceId },
    async fetch(path: string, init?: RequestInit) {
      requests.push(path);
      if (typeof init?.body === 'string')
        inputs.set(path, JSON.parse(init.body) as unknown);
      return responses.get(path)?.() ?? Response.json({ status: 'signed-out' });
    },
  }) as { startAccount: typeof startAccount };
  const account = api.startAccount({ changed: (value) => states.push(value) });
  account.mount(mounted as unknown as HTMLElement);
  return {
    account,
    states,
    requests,
    session,
    status,
    diagnostic,
    approve,
    picker,
    back,
    navigated,
    providerRequests,
    historyWrites,
    inputs,
    confirmApproval: () => approve.dispatchEvent(new Event('click')),
    incoming: (ticket = 'b'.repeat(64)) => {
      location.hash = `#configuracoes?ticket=${ticket}&wallet=MetaMask&ecosystem=evm`;
      window.dispatchEvent(new Event('hashchange'));
    },
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

const approvalHash = `#configuracoes?ticket=${'a'.repeat(64)}&wallet=MetaMask&ecosystem=evm`;

await test('entrada de aprovação assina o retorno sem criar sessão independente e só depois tenta voltar ao navegador', async () => {
  const signed = deferred<unknown>();
  const browser = scope({
    pathname: '/wallet.html',
    hash: approvalHash,
    handoffSign: signed.promise,
  });
  await tick();
  assert.deepEqual(browser.requests, []);
  assert.equal(browser.picker.hidden, true);
  assert.equal(browser.approve.hidden, false);
  assert.match(browser.approve.textContent, /MetaMask/u);
  assert.equal(browser.back.hidden, true);
  assert.match(browser.diagnostic.textContent, /etapa=pedido-lido/u);
  assert.equal(browser.historyWrites.length, 1);
  assert.deepEqual(Object.keys(browser.historyWrites[0] as object), [
    'xdmmeApprovalDiagnostic',
  ]);
  browser.confirmApproval();
  await tick();
  assert.deepEqual(browser.navigated, []);
  assert.deepEqual(browser.requests, [
    '/api/account/handoff-challenge',
    '/api/account/handoff-sign',
  ]);
  assert.match(browser.diagnostic.textContent, /etapa=assinatura-enviada/u);
  signed.resolve({ status: 'signed' });
  await tick();
  assert.equal(browser.approve.hidden, true);
  assert.equal(browser.back.hidden, false);
  assert.match(browser.status.textContent, /Assinatura confirmada/u);
  assert.deepEqual(browser.navigated, [browser.back.href]);
  assert.ok(!browser.back.href.includes('a'.repeat(64)));
  assert.deepEqual(browser.states, []);
  assert.match(browser.diagnostic.textContent, /etapa=retorno-tentado/u);
  assert.doesNotMatch(browser.diagnostic.textContent, /a{64}|0x|https:/u);
  browser.dispose();
});

await test('aprovação sem ticket ou com ticket inválido não restaura sessão nem faz login comum', async () => {
  for (const hash of [
    '',
    '#configuracoes?ticket=invalid&wallet=MetaMask&ecosystem=evm',
  ]) {
    const browser = scope({ pathname: '/wallet.html', hash });
    await tick();
    browser.click();
    browser.confirmApproval();
    await tick();
    assert.deepEqual(browser.requests, []);
    assert.deepEqual(browser.states, []);
    assert.deepEqual(browser.navigated, []);
    assert.equal(browser.picker.hidden, true);
    assert.equal(browser.approve.hidden, true);
    assert.equal(browser.back.hidden, true);
    assert.match(browser.diagnostic.textContent, /provider=nao-avaliado/u);
    browser.dispose();
  }
});

await test('marcador de diagnóstico expirado ou inválido nunca prova recebimento nem recupera pedido', async () => {
  for (const xdmmeApprovalDiagnostic of [
    Date.now() - 1,
    Date.now() + 600_000,
    'PRIVATE',
  ]) {
    const browser = scope({
      pathname: '/wallet.html',
      hash: '#configuracoes',
      navigationType: 'reload',
      historyState: { xdmmeApprovalDiagnostic },
    });
    await tick();
    assert.doesNotMatch(
      browser.diagnostic.textContent,
      /fragmento-recebido-antes|PRIVATE/u,
    );
    assert.deepEqual(browser.requests, []);
    assert.equal(browser.approve.hidden, true);
    browser.dispose();
  }
});

await test('falha HTTP do desafio informa somente categoria e etapa, sem assinatura, sessão ou retorno', async () => {
  const browser = scope({
    pathname: '/wallet.html',
    hash: approvalHash,
    challengeFailure: 403,
  });
  await tick();
  browser.confirmApproval();
  await tick();
  assert.match(browser.diagnostic.textContent, /etapa=desafio-solicitado/u);
  assert.match(browser.diagnostic.textContent, /falha=HTTP-403/u);
  assert.doesNotMatch(
    browser.diagnostic.textContent,
    /Pedido rejeitado|a{64}|0x|https:/u,
  );
  assert.deepEqual(browser.requests, ['/api/account/handoff-challenge']);
  assert.equal(browser.providerRequests.includes('personal_sign'), false);
  assert.deepEqual(browser.states, []);
  assert.deepEqual(browser.navigated, []);
  assert.equal(browser.back.hidden, true);
  browser.dispose();
});

await test('página reutilizada aceita novo fragmento e descarta resposta tardia de restauração de sessão', async () => {
  const restoring = deferred<Response>();
  const browser = scope({ sessionResponse: restoring.promise });
  browser.incoming();
  restoring.resolve(Response.json(browser.session));
  await tick();
  assert.deepEqual(browser.states, [null]);
  browser.confirmApproval();
  await tick();
  assert.ok(browser.requests.includes('/api/account/handoff-sign'));
  assert.equal(browser.requests.includes('/api/account/login'), false);
  assert.equal(browser.requests.includes('/api/account/profile'), false);
  assert.deepEqual(browser.inputs.get('/api/account/handoff-challenge'), {
    ticket: 'b'.repeat(64),
    address: browser.session.address,
    chainId: 1,
  });
  browser.dispose();
});

await test('diagnóstico distingue pedido ausente, inválido, recarga após fragmento e falha de limpeza sem revelar dados', async () => {
  const cases = [
    { options: { hash: '' }, stage: 'pedido-ausente', input: 'sem-fragmento' },
    {
      options: {
        hash: '#configuracoes?ticket=PRIVATE&wallet=MetaMask&ecosystem=evm',
      },
      stage: 'pedido-invalido',
      input: 'fragmento-de-pedido',
    },
    {
      options: {
        hash: '#configuracoes',
        navigationType: 'reload',
        historyState: {
          xdmmeApprovalDiagnostic: Date.now() + 60_000,
          private: 'PRIVATE',
        },
      },
      stage: 'pedido-ausente',
      input: 'rota-sem-pedido',
    },
    {
      options: { hash: approvalHash, historyRejected: true },
      stage: 'limpeza-url-falhou',
      input: 'fragmento-de-pedido',
    },
  ];
  for (const { options, stage, input } of cases) {
    const browser = scope({ pathname: '/wallet.html', ...options });
    await tick();
    assert.match(
      browser.diagnostic.textContent,
      new RegExp(`etapa=${stage}`, 'u'),
    );
    assert.ok(browser.diagnostic.textContent.includes(`entrada=${input}`));
    assert.doesNotMatch(
      browser.diagnostic.textContent,
      /PRIVATE|ticket=|0x|https:|a{64}/u,
    );
    assert.deepEqual(browser.requests, []);
    assert.equal(browser.back.hidden, true);
    if (options.navigationType === 'reload') {
      assert.match(browser.diagnostic.textContent, /navegacao=reload/u);
      assert.match(
        browser.diagnostic.textContent,
        /historico=fragmento-recebido-antes/u,
      );
    }
    browser.dispose();
  }
});

await test('novo pedido durante desafio descarta resposta antiga sem abrir prompt de assinatura ou voltar ao navegador', async () => {
  const challenge = deferred<unknown>();
  const browser = scope({
    pathname: '/wallet.html',
    hash: approvalHash,
    challenge: challenge.promise,
  });
  await tick();
  browser.confirmApproval();
  await tick();
  browser.incoming();
  challenge.resolve({ id: randomUUID(), message: 'old challenge' });
  await tick();
  assert.equal(browser.requests.includes('/api/account/handoff-sign'), false);
  assert.equal(browser.providerRequests.includes('personal_sign'), false);
  assert.deepEqual(browser.navigated, []);
  assert.deepEqual(browser.states, [null]);
  assert.match(browser.diagnostic.textContent, /chegada=novo-fragmento/u);
  assert.match(browser.diagnostic.textContent, /etapa=pedido-lido/u);
  assert.match(browser.diagnostic.textContent, /falha=nao/u);
  browser.dispose();
});
