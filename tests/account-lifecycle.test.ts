import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import type { startAccount } from '../src/client/account/index.ts';
import { Wallet } from 'ethers';
import { createIdentity, openFrom } from '../src/client/device-keys/index.ts';
import { createWalletRecovery } from '../src/client/wallet-recovery/index.ts';
import { openingTicket } from '../src/shared/wallet-opening/index.ts';
import { sealedSecret } from '../src/shared/devices/index.ts';
import {
  recoveryMessage,
  transferContext,
} from '../src/shared/wallet-recovery/index.ts';

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
  storage?: Map<string, string>;
  storageRejected?: boolean;
  clock?: { now: number };
  approvalResponse?: Promise<Response>;
  approvalDocument?: string;
  approvalRejection?: string;
  privateKey?: Parameters<typeof startAccount>[0]['privateKey'];
  walletSigner?: Wallet;
  handoffSubmit?: (input: unknown) => void;
  mobileOpening?: true;
  handoffStatus?: Promise<Response>;
}) {
  const address = options.walletSigner?.address ?? `0x${'1'.repeat(40)}`;
  const listeners = new Map<string, () => void>();
  const requests: string[] = [];
  const inputs = new Map<string, unknown>();
  const navigated: string[] = [];
  const providerRequests: string[] = [];
  const historyWrites: unknown[] = [];
  const storage = options.storage ?? new Map<string, string>();
  const storedBeforeHistory: boolean[] = [];
  class LocalDate extends Date {
    static override now() {
      return options.clock?.now ?? Date.now();
    }
  }
  const location = {
    origin: 'https://0xdmme.app',
    pathname: options.pathname ?? '/',
    hash: options.hash ?? '',
    assign: (url: string) => navigated.push(url),
  };
  const window = Object.assign(new EventTarget(), {
    ethereum: {
      isMetaMask: true,
      request(input: { method: string; params?: unknown[] }): Promise<unknown> {
        providerRequests.push(input.method);
        if (input.method === 'eth_requestAccounts')
          return options.accounts ?? Promise.resolve([address]);
        if (input.method === 'eth_accounts') return Promise.resolve([address]);
        if (input.method === 'eth_chainId') return Promise.resolve('0x1');
        if (options.walletSigner && typeof input.params?.[0] === 'string')
          return options.walletSigner.signMessage(
            Uint8Array.from(
              input.params[0].slice(2).match(/.{2}/gu) ?? [],
              (byte) => Number.parseInt(byte, 16),
            ),
          );
        return options.signature ?? Promise.resolve(`0x${'a'.repeat(130)}`);
      },
      on(event: string, listener: () => void) {
        listeners.set(event, listener);
      },
      removeListener(event: string) {
        listeners.delete(event);
      },
    },
    setTimeout(callback: () => void, delay = 0) {
      const id = ++timerId;
      // Browsers cannot represent a timeout above the signed 32-bit limit.
      timers.set(id, {
        callback,
        delay: delay > 2_147_483_647 ? 1 : delay,
      });
      return id;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
  });
  Object.assign(window, { backpack: { ethereum: window.ethereum } });
  let documentRemoved = false;
  const approvalDocument = {
    textContent: options.approvalDocument,
    getAttribute: (name: string) =>
      name === 'data-rejected' ? (options.approvalRejection ?? null) : null,
    remove: () => {
      documentRemoved = true;
    },
  };
  const timers = new Map<number, { callback: () => void; delay: number }>();
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
  const intro = { hidden: false, textContent: '' };
  const manual = { hidden: false };
  const purpose = { hidden: false };
  const diagnosticsPanel = { hidden: false };
  const returnPanel = { hidden: true };
  const returnCandidate = { textContent: '' };
  const returnConfirm = Object.assign(new EventTarget(), {
    hidden: true,
    disabled: false,
  });
  const nodes = new Map<string, unknown>([
    ['[data-wallet-approve]', approve],
    ['[data-wallet-picker-toggle]', picker],
    ['[data-account-status]', status],
    ['[data-wallet-diagnostic]', diagnostic],
    ['[data-account-intro]', intro],
    ['[data-wallet-manual]', manual],
    ['[data-wallet-purpose]', purpose],
    ['[data-wallet-diagnostics]', diagnosticsPanel],
    ['[data-wallet-return]', returnPanel],
    ['[data-wallet-candidate]', returnCandidate],
    ['[data-wallet-confirm]', returnConfirm],
  ]);
  const attributes = new Map<string, string>();
  const mounted = {
    innerHTML: '',
    addEventListener: () => {},
    setAttribute: (name: string, value: string) => attributes.set(name, value),
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
  const loginStorage = new Map<string, string>([
    ['hash-talk:login-device', session.deviceId],
  ]);
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
    [
      '/api/account/approval-request',
      () => options.approvalResponse ?? Promise.resolve(Response.json(null)),
    ],
    [
      '/api/account/handoff-status',
      () => options.handoffStatus ?? Promise.resolve(Response.json(null)),
    ],
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
    TextDecoder,
    btoa,
    atob,
    DOMException,
    setTimeout,
    clearTimeout,
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
        storedBeforeHistory.push(storage.size > 0);
        location.hash = hash;
      },
    },
    performance: {
      getEntriesByType: () => [{ type: options.navigationType ?? 'navigate' }],
    },
    document: Object.assign(new EventTarget(), {
      activeElement: null,
      getElementById: (id: string) =>
        id === 'xdmme-wallet-approval-request' &&
        options.approvalDocument !== undefined
          ? approvalDocument
          : null,
    }),
    localStorage: {
      getItem: (key: string) => loginStorage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (options.storageRejected && options.pathname === '/wallet.html')
          throw new Error('LocalStorage blocked');
        loginStorage.set(key, value);
      },
    },
    sessionStorage: {
      getItem: (key: string) => {
        if (options.storageRejected) throw new Error('Storage blocked');
        return storage.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (options.storageRejected) throw new Error('Storage blocked');
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        if (options.storageRejected) throw new Error('Storage blocked');
        storage.delete(key);
      },
    },
    Date: LocalDate,
    async fetch(path: string, init?: RequestInit) {
      requests.push(path);
      if (typeof init?.body === 'string')
        inputs.set(path, JSON.parse(init.body) as unknown);
      if (path === '/api/account/handoff-opening-submit')
        options.handoffSubmit?.(inputs.get(path));
      return responses.get(path)?.() ?? Response.json({ status: 'signed-out' });
    },
  }) as { startAccount: typeof startAccount };
  const account = api.startAccount({
    changed: (value) => states.push(value),
    ...(options.privateKey ? { privateKey: options.privateKey } : {}),
    ...(options.mobileOpening ? { mobileOpening: options.mobileOpening } : {}),
  });
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
    intro,
    manual,
    purpose,
    diagnosticsPanel,
    returnPanel,
    returnConfirm,
    returnCandidate,
    view: mounted,
    attributes,
    navigated,
    providerRequests,
    historyWrites,
    storage,
    storedBeforeHistory,
    inputs,
    documentRemoved: () => documentRemoved,
    confirmApproval: () => approve.dispatchEvent(new Event('click')),
    incoming: (ticket = 'b'.repeat(64)) => {
      location.hash = `#configuracoes?ticket=${ticket}&wallet=MetaMask&ecosystem=evm`;
      window.dispatchEvent(new Event('hashchange'));
    },
    click: () => button.dispatchEvent(new Event('click')),
    changed: () => listeners.get('accountsChanged')?.(),
    expire: () => {
      for (const timer of [...timers.values()]) timer.callback();
    },
    nextTimer: () => {
      const next = [...timers.entries()].sort(
        (a, b) => a[1].delay - b[1].delay,
      )[0];
      assert.ok(next);
      timers.delete(next[0]);
      return next[1];
    },
    resume: () => window.dispatchEvent(new Event('focus')),
    dispose: () => window.dispatchEvent(new Event('pagehide')),
  };
}

await test('sessão de 160 dias permanece conectada entre timers e expira apenas no prazo completo', async () => {
  const clock = { now: Date.now() };
  const lifetime = 160 * 24 * 60 * 60 * 1000;
  const expiresAt = clock.now + lifetime;
  const restored = deferred<Response>();
  const browser = scope({
    clock,
    sessionResponse: restored.promise,
    privateKey: () => Promise.resolve(null),
  });
  restored.resolve(
    Response.json({
      ...browser.session,
      expiresAt: new Date(expiresAt).toISOString(),
    }),
  );
  await tick();
  assert.equal(browser.attributes.get('data-connected'), 'true');
  for (let step = 0; step < 10 && clock.now < expiresAt; step++) {
    const timer = browser.nextTimer();
    assert.ok(timer.delay > 0 && timer.delay <= 2_147_483_647);
    clock.now += timer.delay;
    assert.ok(clock.now <= expiresAt);
    timer.callback();
    assert.equal(
      browser.attributes.get('data-connected'),
      clock.now < expiresAt ? 'true' : 'false',
    );
  }
  assert.equal(clock.now, expiresAt);
  assert.equal(browser.attributes.get('data-connected'), 'false');
  assert.match(browser.status.textContent, /Sessão expirada/u);
  browser.dispose();
});

await test('restaurar sessão abre somente chaves locais; novo login pode solicitar a wallet', async () => {
  const modes: string[] = [];
  const restored = {
    accountId: randomUUID(),
    deviceId: randomUUID(),
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    csrf: 'c'.repeat(64),
    name: '',
    deviceState: 'pending',
    historyAuthorized: false,
    walletConfirmed: true,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    profileRevision: 0,
  };
  const browser = scope({
    sessionResponse: Promise.resolve(Response.json(restored)),
    privateKey: (_session, mode) => {
      modes.push(mode);
      return Promise.resolve(null);
    },
  });
  await tick();
  assert.deepEqual(modes, ['restore']);
  assert.equal(browser.account.canActivate(), true);
  assert.match(browser.status.textContent, /Sessão conectada/);
  assert.equal(browser.attributes.get('data-connected'), 'true');
  browser.click();
  await tick();
  assert.deepEqual(modes, ['restore', 'login']);
  browser.dispose();
});

await test('sessão anterior não oculta o pedido assinado nem sua confirmação ao restaurar a aba', async () => {
  const restored = deferred<Response>();
  const browser = scope({
    sessionResponse: restored.promise,
    mobileOpening: true,
    privateKey: () => Promise.resolve(null),
    handoffStatus: Promise.resolve(
      Response.json({
        address: '0x' + '1'.repeat(40),
        ecosystem: 'evm',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        serverTime: new Date().toISOString(),
      }),
    ),
  });
  browser.account.mount(browser.view as unknown as HTMLElement, 'login');
  restored.resolve(Response.json(browser.session));
  await tick();
  assert.equal(browser.returnPanel.hidden, false);
  assert.equal(browser.attributes.get('data-connected'), 'false');
  assert.equal(browser.returnConfirm.hidden, false);
  assert.match(browser.returnCandidate.textContent, /Endereço verificado/u);
  assert.equal(
    (browser.view as typeof browser.view & { hidden: boolean }).hidden,
    false,
  );
  assert.equal(
    browser.requests.includes('/api/account/handoff-confirm'),
    false,
  );
  assert.deepEqual(browser.navigated, []);
  browser.dispose();
});

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

await test('entrada de aprovação aceita assinatura sem criar sessão independente e orienta retorno manual', async () => {
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
  assert.equal(browser.intro.hidden, false);
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
  assert.equal(browser.intro.hidden, true);
  assert.match(browser.status.textContent, /Assinatura confirmada/u);
  assert.deepEqual(browser.navigated, []);
  assert.deepEqual(browser.states, []);
  assert.equal(browser.storage.size, 0);
  assert.match(browser.diagnostic.textContent, /etapa=retorno-manual/u);
  assert.doesNotMatch(browser.diagnostic.textContent, /a{64}|0x|https:/u);
  browser.dispose();
});

await test('pedido salvo antes de limpar URL sobrevive reabertura sem marcador, sem renovar prazo nem autenticar', async () => {
  const clock = { now: Date.now() };
  const first = scope({ pathname: '/wallet.html', hash: approvalHash, clock });
  await tick();
  assert.deepEqual(first.storedBeforeHistory, [true]);
  assert.equal(first.storage.size, 1);
  const record = [...first.storage.values()][0];
  assert.ok(record);
  assert.doesNotMatch(
    record,
    /address|signature|csrf|accountId|session|secret/u,
  );
  first.dispose();
  clock.now += 60_000;
  const reopened = scope({
    pathname: '/wallet.html',
    hash: '#configuracoes',
    navigationType: 'navigate',
    storage: first.storage,
    clock,
  });
  await tick();
  assert.equal(reopened.approve.hidden, false);
  assert.match(reopened.diagnostic.textContent, /etapa=pedido-restaurado/u);
  assert.deepEqual(reopened.requests, ['/api/account/approval-request']);
  assert.deepEqual(reopened.states, []);
  assert.equal([...reopened.storage.values()][0], record);
  reopened.incoming('a'.repeat(64));
  assert.equal([...reopened.storage.values()][0], record);
  reopened.confirmApproval();
  await tick();
  assert.equal(reopened.requests.includes('/api/account/login'), false);
  assert.equal(reopened.requests.includes('/api/account/handoff-sign'), true);
  assert.equal(reopened.storage.size, 0);
  reopened.dispose();
});

await test('prazo local encerra pedido ao retomar e ao reabrir; novo fragmento inválido não recupera anterior', async () => {
  const clock = { now: Date.now() };
  const live = scope({ pathname: '/wallet.html', hash: approvalHash, clock });
  await tick();
  clock.now += 300_000;
  live.resume();
  assert.equal(live.storage.size, 0);
  assert.equal(live.approve.hidden, true);
  assert.match(live.diagnostic.textContent, /etapa=pedido-expirado/u);
  live.dispose();
  const another = scope({
    pathname: '/wallet.html',
    hash: approvalHash,
    clock,
  });
  await tick();
  another.dispose();
  const invalid = scope({
    pathname: '/wallet.html',
    hash: '#configuracoes?ticket=invalid&wallet=MetaMask&ecosystem=evm',
    storage: another.storage,
    clock,
  });
  await tick();
  assert.equal(invalid.storage.size, 0);
  assert.equal(invalid.approve.hidden, true);
  assert.deepEqual(invalid.requests, []);
  invalid.dispose();
  const last = scope({ pathname: '/wallet.html', hash: approvalHash, clock });
  await tick();
  last.dispose();
  clock.now += 300_000;
  const expired = scope({
    pathname: '/wallet.html',
    storage: last.storage,
    clock,
  });
  await tick();
  assert.equal(expired.storage.size, 0);
  assert.equal(expired.approve.hidden, true);
  assert.deepEqual(expired.requests, ['/api/account/approval-request']);
  expired.dispose();
});

await test('armazenamento bloqueado mantém só pedido recebido em memória, sem recuperar pedido ou abrir sessão', async () => {
  const browser = scope({
    pathname: '/wallet.html',
    hash: approvalHash,
    storageRejected: true,
  });
  await tick();
  assert.equal(browser.approve.hidden, false);
  assert.match(browser.diagnostic.textContent, /armazenamento=indisponivel/u);
  browser.confirmApproval();
  await tick();
  assert.equal(browser.storage.size, 0);
  assert.equal(browser.requests.includes('/api/account/login'), false);
  assert.equal(browser.requests.includes('/api/account/handoff-sign'), true);
  browser.dispose();
});

await test('registro corrompido, excedido ou com prazo adulterado nunca inicia autenticação', async () => {
  const clock = { now: Date.now() };
  const first = scope({ pathname: '/wallet.html', hash: approvalHash, clock });
  await tick();
  const entry = [...first.storage.entries()][0];
  assert.ok(entry);
  const [key, value] = entry;
  const record = JSON.parse(value) as Record<string, unknown>;
  first.dispose();
  const invalid = [
    '{',
    'x'.repeat(513),
    JSON.stringify({ ...record, private: 'PRIVATE' }),
    JSON.stringify({ ...record, expiresAt: clock.now + 600_000 }),
    JSON.stringify({
      ...record,
      createdAt: clock.now + 1,
      expiresAt: clock.now + 300_001,
    }),
    JSON.stringify({ ...record, request: { ticket: 'invalid' } }),
  ];
  for (const altered of invalid) {
    const browser = scope({
      pathname: '/wallet.html',
      storage: new Map([[key, altered]]),
      clock,
    });
    await tick();
    browser.confirmApproval();
    await tick();
    assert.equal(browser.storage.size, 0);
    assert.equal(browser.approve.hidden, true);
    assert.deepEqual(browser.requests, ['/api/account/approval-request']);
    assert.deepEqual(browser.states, []);
    assert.doesNotMatch(browser.diagnostic.textContent, /PRIVATE|a{64}/u);
    browser.dispose();
  }
});

await test('app normal não recupera pedido temporário da entrada de aprovação', async () => {
  const first = scope({ pathname: '/wallet.html', hash: approvalHash });
  await tick();
  first.dispose();
  const normal = scope({ storage: first.storage, hash: '#configuracoes' });
  await tick();
  assert.equal(
    normal.requests.includes('/api/account/handoff-challenge'),
    false,
  );
  assert.equal(normal.requests.includes('/api/account/handoff-sign'), false);
  assert.equal(normal.picker.hidden, false);
  assert.deepEqual(normal.providerRequests, []);
  assert.deepEqual(normal.requests, [
    '/api/account/session',
    '/api/account/handoff-status',
  ]);
  assert.deepEqual(normal.states, []);
  normal.dispose();
});

await test('assinatura aceita de pedido anterior não apaga nem confirma um novo pedido', async () => {
  const signed = deferred<unknown>();
  const browser = scope({
    pathname: '/wallet.html',
    hash: approvalHash,
    handoffSign: signed.promise,
  });
  await tick();
  browser.confirmApproval();
  await tick();
  assert.ok(browser.requests.includes('/api/account/handoff-sign'));
  browser.incoming();
  const replacement = [...browser.storage.values()][0];
  assert.ok(replacement?.includes('b'.repeat(64)));
  signed.resolve({ status: 'signed' });
  await tick();
  assert.equal([...browser.storage.values()][0], replacement);
  assert.doesNotMatch(browser.status.textContent, /Assinatura confirmada/u);
  assert.equal(browser.approve.hidden, false);
  assert.deepEqual(browser.navigated, []);
  assert.match(browser.diagnostic.textContent, /etapa=pedido-lido/u);
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
    assert.deepEqual(
      browser.requests,
      hash === '' ? ['/api/account/approval-request'] : [],
    );
    assert.deepEqual(browser.states, []);
    assert.deepEqual(browser.navigated, []);
    assert.equal(browser.picker.hidden, true);
    assert.equal(browser.approve.hidden, true);
    assert.doesNotMatch(browser.status.textContent, /Assinatura confirmada/u);
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
    assert.deepEqual(browser.requests, ['/api/account/approval-request']);
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
  assert.doesNotMatch(browser.status.textContent, /Assinatura confirmada/u);
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
      options: { hash: '#configuracoes?invalid=1&reason=parameters' },
      stage: 'pedido-invalido',
      input: 'entrada-rejeitada-parametros',
    },
    {
      options: { hash: '#configuracoes?invalid=1&reason=unavailable' },
      stage: 'pedido-invalido',
      input: 'entrada-rejeitada-pedido',
    },
    {
      options: { hash: '#configuracoes?invalid=1&reason=PRIVATE' },
      stage: 'pedido-invalido',
      input: 'entrada-rejeitada',
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
    if (input.startsWith('entrada-rejeitada')) {
      assert.doesNotMatch(
        browser.intro.textContent,
        /Pedido ausente ou perdido/u,
      );
      assert.equal(browser.approve.hidden, true);
      assert.deepEqual(browser.providerRequests, []);
    }
    assert.doesNotMatch(
      browser.diagnostic.textContent,
      /PRIVATE|ticket=|0x|https:|a{64}/u,
    );
    assert.deepEqual(
      browser.requests,
      options.hash === '' || options.hash === '#configuracoes'
        ? ['/api/account/approval-request']
        : [],
    );
    assert.doesNotMatch(browser.status.textContent, /Assinatura confirmada/u);
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

function approvalDocumentPayload(ecosystem = 'evm', remaining = 60_000) {
  const now = Date.now();
  return JSON.stringify({
    request: { ticket: 'a'.repeat(64), wallet: 'Backpack', ecosystem },
    serverTime: new Date(now).toISOString(),
    expiresAt: new Date(now + remaining).toISOString(),
  });
}

await test('documento final conserva o pedido sem mudar URL, sem sessão de armazenamento e sem conectar automaticamente', async () => {
  for (const ecosystem of ['evm', 'solana']) {
    const browser = scope({
      pathname: '/wallet-approval',
      approvalDocument: approvalDocumentPayload(ecosystem),
      historyRejected: true,
      storageRejected: true,
    });
    await tick();
    assert.equal(browser.documentRemoved(), true);
    assert.deepEqual(browser.historyWrites, []);
    assert.deepEqual(browser.requests, []);
    assert.deepEqual(browser.providerRequests, []);
    assert.deepEqual(browser.states, []);
    assert.equal(browser.approve.hidden, false);
    assert.match(
      browser.diagnostic.textContent,
      /entrada=entrada-documento.*etapa=pedido-lido/u,
    );
    if (ecosystem === 'evm') {
      browser.confirmApproval();
      await tick();
      assert.deepEqual(browser.requests, [
        '/api/account/handoff-challenge',
        '/api/account/handoff-sign',
      ]);
      assert.deepEqual(browser.historyWrites, []);
      assert.deepEqual(browser.states, []);
      assert.match(browser.status.textContent, /Assinatura confirmada/u);
    }
    browser.dispose();
  }
});

await test('documento final com cookie ausente ou recusado não restaura pedido anterior nem chama provider', async () => {
  const previous = scope({ pathname: '/wallet.html', hash: approvalHash });
  await tick();
  previous.dispose();
  for (const reason of ['parameters', 'unavailable', 'missing']) {
    const browser = scope({
      pathname: '/wallet-approval',
      approvalDocument: 'null',
      approvalRejection: reason,
      storage: new Map(previous.storage),
    });
    await tick();
    assert.equal(browser.approve.hidden, true);
    assert.equal(browser.storage.size, 0);
    assert.deepEqual(browser.historyWrites, []);
    assert.deepEqual(browser.requests, []);
    assert.deepEqual(browser.providerRequests, []);
    assert.match(browser.diagnostic.textContent, /etapa=pedido-invalido/u);
    if (reason === 'missing')
      assert.match(
        browser.diagnostic.textContent,
        /entrada=entrada-sem-cookie/u,
      );
    browser.dispose();
  }
});

await test('documento entrega Backpack EVM/Solana sem fragmento ou cookie e remove ticket antes de qualquer RPC', async () => {
  for (const ecosystem of ['evm', 'solana']) {
    const browser = scope({
      pathname: `/wallet-entry/${'a'.repeat(64)}/${ecosystem}/Backpack`,
      approvalDocument: approvalDocumentPayload(ecosystem),
      approvalResponse: Promise.resolve(cookieApprovalResponse()),
    });
    await tick();
    assert.deepEqual(browser.requests, []);
    assert.deepEqual(browser.providerRequests, []);
    assert.deepEqual(browser.states, []);
    assert.equal(browser.documentRemoved(), true);
    assert.deepEqual(browser.storedBeforeHistory, [true]);
    assert.equal(browser.storage.size, 1);
    assert.match(browser.diagnostic.textContent, /entrada=entrada-documento/u);
    assert.match(browser.diagnostic.textContent, /etapa=pedido-lido/u);
    assert.doesNotMatch(browser.diagnostic.textContent, /a{64}|0x|https:/u);
    if (ecosystem === 'evm') {
      assert.equal(browser.approve.hidden, false);
      browser.confirmApproval();
      await tick();
      assert.deepEqual(browser.requests, [
        '/api/account/handoff-challenge',
        '/api/account/handoff-sign',
      ]);
      assert.equal(
        (
          browser.inputs.get('/api/account/handoff-challenge') as {
            ticket: string;
          }
        ).ticket,
        'a'.repeat(64),
      );
      assert.deepEqual(browser.states, []);
      assert.equal(browser.storage.size, 0);
      assert.match(browser.status.textContent, /Assinatura confirmada/u);
      browser.incoming('b'.repeat(64));
      await tick();
      assert.match(browser.diagnostic.textContent, /chegada=novo-fragmento/u);
      assert.match(browser.diagnostic.textContent, /etapa=pedido-lido/u);
      assert.match(browser.intro.textContent, /MetaMask/u);
    }
    browser.dispose();
  }
});

await test('documento ausente, inválido ou expirado não recupera pedido antigo nem cookie e nunca conecta', async () => {
  const previous = scope({ pathname: '/wallet.html', hash: approvalHash });
  await tick();
  previous.dispose();
  for (const payload of [
    undefined,
    'null',
    'bad',
    'x'.repeat(1025),
    approvalDocumentPayload('evm', 0),
    approvalDocumentPayload().replace('Backpack', 'MetaMask'),
  ]) {
    const browser = scope({
      pathname: '/wallet-entry',
      storage: new Map(previous.storage),
      approvalResponse: Promise.resolve(cookieApprovalResponse()),
      ...(payload === undefined ? {} : { approvalDocument: payload }),
    });
    await tick();
    assert.equal(browser.approve.hidden, true);
    assert.equal(browser.storage.size, 0);
    assert.deepEqual(browser.requests, []);
    assert.deepEqual(browser.providerRequests, []);
    assert.deepEqual(browser.states, []);
    assert.match(browser.diagnostic.textContent, /etapa=pedido-invalido/u);
    browser.dispose();
  }
});

await test('rejeição documental chega sem redirecionamento ou fragmento e não recupera pedido nem conecta', async () => {
  for (const [reason, category] of [
    ['parameters', 'entrada-rejeitada-parametros'],
    ['unavailable', 'entrada-rejeitada-pedido'],
  ] as const) {
    const browser = scope({
      pathname: `/wallet-entry/${'a'.repeat(64)}/evm/Backpack`,
      approvalDocument: 'null',
      approvalRejection: reason,
    });
    await tick();
    assert.equal(browser.approve.hidden, true);
    assert.equal(browser.storage.size, 0);
    assert.deepEqual(browser.requests, []);
    assert.deepEqual(browser.providerRequests, []);
    assert.ok(browser.diagnostic.textContent.includes(`entrada=${category}`));
    assert.match(
      browser.diagnostic.textContent,
      /etapa=pedido-invalido.*protocolo=doc-3/u,
    );
    assert.doesNotMatch(
      browser.diagnostic.textContent,
      /a{64}|ticket=|https:/u,
    );
    assert.equal(browser.documentRemoved(), true);
    browser.dispose();
  }
});

function cookieApprovalResponse(ticket = 'b'.repeat(64), remaining = 60_000) {
  const now = Date.now();
  return Response.json({
    request: { ticket, wallet: 'MetaMask', ecosystem: 'evm' },
    serverTime: new Date(now).toISOString(),
    expiresAt: new Date(now + remaining).toISOString(),
  });
}

await test('URL limpa recupera pedido pelo cookie sem armazenamento novo, sessão ou assinatura automática', async () => {
  const browser = scope({
    pathname: '/wallet.html',
    hash: '#configuracoes',
    approvalResponse: Promise.resolve(cookieApprovalResponse()),
  });
  await tick();
  assert.deepEqual(browser.requests, ['/api/account/approval-request']);
  assert.equal(browser.storage.size, 0);
  assert.equal(browser.approve.hidden, false);
  assert.match(browser.diagnostic.textContent, /etapa=pedido-cookie-recebido/u);
  assert.deepEqual(browser.providerRequests, []);
  browser.confirmApproval();
  await tick();
  assert.equal(
    (browser.inputs.get('/api/account/handoff-challenge') as { ticket: string })
      .ticket,
    'b'.repeat(64),
  );
  assert.equal(browser.requests.includes('/api/account/login'), false);
  assert.equal(browser.requests.includes('/api/account/session'), false);
  assert.deepEqual(browser.states, []);
  assert.match(browser.status.textContent, /Assinatura confirmada/u);
  browser.dispose();
});

await test('recuperação por cookie substitui registro antigo; cancelamento não recupera pedido obsoleto', async () => {
  const first = scope({ pathname: '/wallet.html', hash: approvalHash });
  await tick();
  first.dispose();
  const stored = first.storage;
  const fresh = scope({
    pathname: '/wallet.html',
    hash: '#configuracoes',
    storage: stored,
    approvalResponse: Promise.resolve(cookieApprovalResponse()),
  });
  await tick();
  assert.equal(stored.size, 0);
  fresh.confirmApproval();
  await tick();
  assert.equal(
    (fresh.inputs.get('/api/account/handoff-challenge') as { ticket: string })
      .ticket,
    'b'.repeat(64),
  );
  fresh.dispose();
  const failed = scope({
    pathname: '/wallet.html',
    hash: '#configuracoes',
    approvalResponse: Promise.resolve(
      Response.json({ error: 'Pedido expirou.' }, { status: 401 }),
    ),
  });
  await tick();
  assert.equal(failed.approve.hidden, true);
  assert.deepEqual(failed.providerRequests, []);
  assert.match(failed.diagnostic.textContent, /falha=HTTP-401/u);
  failed.dispose();
});

await test('resposta tardia do cookie não substitui fragmento novo nem revive tela encerrada', async () => {
  for (const action of ['replace', 'dispose']) {
    const response = deferred<Response>();
    const browser = scope({
      pathname: '/wallet.html',
      hash: '#configuracoes',
      approvalResponse: response.promise,
    });
    if (action === 'replace') browser.incoming('c'.repeat(64));
    else browser.dispose();
    response.resolve(cookieApprovalResponse());
    await tick();
    assert.deepEqual(browser.providerRequests, []);
    if (action === 'replace') {
      browser.confirmApproval();
      await tick();
      assert.equal(
        (
          browser.inputs.get('/api/account/handoff-challenge') as {
            ticket: string;
          }
        ).ticket,
        'c'.repeat(64),
      );
      browser.dispose();
    }
  }
});

await test('prazo inválido do cookie bloqueia aprovação; expiração local suspensa é conferida no foco', async () => {
  for (const remaining of [-1, 300_001]) {
    const browser = scope({
      pathname: '/wallet.html',
      approvalResponse: Promise.resolve(
        cookieApprovalResponse('b'.repeat(64), remaining),
      ),
    });
    await tick();
    assert.equal(browser.approve.hidden, true);
    assert.deepEqual(browser.providerRequests, []);
    browser.dispose();
  }
  const clock = { now: Date.now() };
  const browser = scope({
    pathname: '/wallet.html',
    clock,
    approvalResponse: Promise.resolve(
      cookieApprovalResponse('b'.repeat(64), 60_000),
    ),
  });
  await tick();
  clock.now += 60_001;
  browser.resume();
  await tick();
  assert.equal(browser.approve.hidden, true);
  assert.match(browser.diagnostic.textContent, /etapa=pedido-expirado/u);
  browser.dispose();
});

await test('assinatura aceita mostra somente aviso de retorno manual, inclusive para pedido antigo do Chrome', async () => {
  const now = Date.now();
  const signed = deferred<unknown>();
  const response = Response.json({
    request: {
      ticket: 'a'.repeat(64),
      wallet: 'MetaMask',
      ecosystem: 'evm',
      returnBrowser: 'chrome',
    },
    serverTime: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
  });
  const browser = scope({
    pathname: '/wallet.html',
    hash: '#configuracoes',
    approvalResponse: Promise.resolve(response),
    handoffSign: signed.promise,
  });
  await tick();
  assert.deepEqual(browser.navigated, []);
  assert.doesNotMatch(browser.view.innerHTML, /data-wallet-back/u);
  assert.equal(browser.intro.hidden, false);
  assert.equal(browser.manual.hidden, false);
  assert.equal(browser.purpose.hidden, false);
  assert.equal(browser.diagnosticsPanel.hidden, false);
  browser.confirmApproval();
  await tick();
  assert.deepEqual(browser.navigated, []);
  assert.doesNotMatch(browser.status.textContent, /Assinatura confirmada/u);
  signed.resolve({ status: 'signed' });
  await tick();
  assert.equal(browser.intro.hidden, true);
  assert.equal(browser.manual.hidden, true);
  assert.equal(browser.purpose.hidden, true);
  assert.equal(browser.diagnosticsPanel.hidden, true);
  assert.equal(browser.approve.hidden, true);
  assert.equal(
    browser.status.textContent,
    'Assinatura confirmada. Feche a MetaMask e volte ao navegador onde iniciou o login para confirmar o endereço.',
  );
  assert.deepEqual(browser.navigated, []);
  browser.resume();
  await tick();
  assert.deepEqual(browser.navigated, []);
  assert.equal(browser.requests.includes('/api/account/login'), false);
  assert.deepEqual(browser.states, []);
  browser.dispose();
});

await test(
  'entrada mobile assina login e prova privada na mesma wallet, sem sessão ou segunda navegação',
  { timeout: 10000 },
  async () => {
    const signer = new Wallet(`0x${'1'.padStart(64, '0')}`);
    const identity = await createIdentity(randomUUID(), 'Navegador original');
    const receiver = {
      receiver: identity.public.wrapping,
      nonce: 'f'.repeat(64),
      wallet: 'MetaMask' as const,
    };
    const ticket = await openingTicket(receiver);
    const config = createWalletRecovery(
      {
        accountId: randomUUID(),
        ecosystem: 'evm',
        address: signer.address.toLowerCase(),
        deviceId: randomUUID(),
        csrf: 'c'.repeat(64),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        name: '',
        profileRevision: 0,
        deviceState: 'pending',
        historyAuthorized: false,
        walletConfirmed: true,
      },
      'https://0xdmme.app',
    );
    const transfer = {
      version: 1 as const,
      ticket,
      wallet: receiver.wallet,
      receiver: receiver.receiver,
      config,
      count: 2 as const,
    };
    const submitted = deferred<unknown>();
    const browser = scope({
      pathname: '/wallet.html',
      hash: `#configuracoes?ticket=${ticket}&wallet=MetaMask&ecosystem=evm`,
      walletSigner: signer,
      handoffSign: Promise.resolve({
        status: 'signed',
        opening: { transfer, nonce: receiver.nonce },
      }),
      handoffSubmit: (input) => submitted.resolve(input),
    });
    await tick();
    browser.confirmApproval();
    const packet = (await submitted.promise) as { envelope: unknown };
    await tick();
    const opened = (await openFrom(
      identity.wrapping,
      sealedSecret(packet.envelope),
      transferContext(transfer),
    )) as { signatures: string[] };
    const expected = await signer.signMessage(recoveryMessage(config));
    assert.deepEqual(opened.signatures, [expected, expected]);
    assert.equal(
      JSON.stringify(browser.inputs.get('/api/account/handoff-sign')).includes(
        expected,
      ),
      false,
    );
    assert.equal(
      browser.providerRequests.filter((method) => method === 'personal_sign')
        .length,
      3,
    );
    assert.equal(browser.requests.includes('/api/account/login'), false);
    assert.equal(browser.navigated.length, 0);
    assert.match(browser.status.textContent, /Assinatura confirmada/u);
    browser.dispose();
  },
);
