import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import type {
  createWalletReturn,
  incomingWalletRequest,
  launchMobileWallet,
} from '../src/client/account/wallet-return.ts';
const bundle = await build({
  entryPoints: ['src/client/account/wallet-return.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'Return',
  write: false,
});
const source = bundle.outputFiles[0]?.text;
if (!source) throw new Error('Bundle ausente.');
function scope(hash = '', userAgent = 'Android', active = true, offsetMs = 0) {
  class DeviceDate extends Date {
    static override now() {
      return Date.now() + offsetMs;
    }
  }
  const window = new EventTarget() as EventTarget & {
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
  };
  // Poll scheduling is observed without creating timers in the test process.
  window.setTimeout = (() => 1) as unknown as typeof setTimeout;
  window.clearTimeout = () => {};
  const replaced: string[] = [];
  const navigated: string[] = [];
  const activation = { isActive: active };
  const navigation = { rejected: false };
  const api = runInNewContext(`${source}\nReturn;`, {
    window,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Date: DeviceDate,
    location: {
      hash,
      origin: 'https://0xdmme.app',
      assign: (link: string) => {
        if (navigation.rejected) throw new Error('Navigation rejected.');
        navigated.push(link);
      },
    },
    navigator: { userAgent, userActivation: activation },
    history: {
      replaceState: (_state: unknown, _title: string, value: string) =>
        replaced.push(value),
    },
  }) as {
    createWalletReturn: typeof createWalletReturn;
    incomingWalletRequest: typeof incomingWalletRequest;
    launchMobileWallet: typeof launchMobileWallet;
  };
  return { api, replaced, navigated, activation, navigation };
}
function session() {
  return {
    accountId: randomUUID(),
    ecosystem: 'evm' as const,
    address: '0x' + 'a'.repeat(40),
    name: '',
    deviceId: randomUUID(),
    deviceState: 'pending' as const,
    historyAuthorized: false as const,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    csrf: 'c'.repeat(64),
    profileRevision: 0,
  };
}
await test('pedido recebido é retirado do histórico antes de continuar e nunca aceita ticket inválido', () => {
  const incoming = scope(
    `#configuracoes?ticket=${'a'.repeat(64)}&ecosystem=solana&wallet=Phantom`,
  );
  assert.equal(incoming.api.incomingWalletRequest()?.ecosystem, 'solana');
  assert.deepEqual(incoming.replaced, ['#configuracoes']);
  const invalid = scope(
    '#configuracoes?ticket=wrong&ecosystem=evm&wallet=MetaMask',
  );
  assert.throws(() => invalid.api.incomingWalletRequest());
  assert.deepEqual(invalid.replaced, ['#configuracoes']);
});
await test('assinatura encontrada exibe candidato, mas não autentica antes da confirmação do navegador', async () => {
  const { api } = scope();
  const authenticated = session();
  const received: unknown[] = [];
  const calls: string[] = [];
  const controller = api.createWalletReturn({
    deviceId: () => authenticated.deviceId,
    changed: () => {},
    message: () => {},
    authenticated: (value) => {
      received.push(value);
      return Promise.resolve();
    },
    api: (path) => {
      calls.push(path);
      if (path === 'handoff-start')
        return Promise.resolve({
          ticket: 'a'.repeat(64),
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          serverTime: new Date().toISOString(),
        });
      if (path === 'handoff-status')
        return Promise.resolve({
          address: authenticated.address,
          ecosystem: 'evm',
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          serverTime: new Date().toISOString(),
        });
      return Promise.resolve(authenticated);
    },
  });
  await controller.start('MetaMask', 'evm');
  assert.ok(controller.link());
  await controller.refresh();
  assert.equal(controller.state()?.address, authenticated.address);
  assert.equal(received.length, 0);
  await controller.confirm();
  assert.equal(received.length, 1);
  assert.equal(controller.state(), null);
  assert.equal(controller.link(), null);
  assert.deepEqual(calls, [
    'handoff-start',
    'handoff-status',
    'handoff-confirm',
  ]);
  controller.close();
});

function launchController(
  startResponse: Promise<unknown>,
  userAgent = 'Android',
) {
  const { api } = scope('', userAgent);
  const opened: string[] = [];
  const controller = api.createWalletReturn({
    deviceId: randomUUID,
    changed: () => {},
    message: () => {},
    authenticated: () => Promise.resolve(),
    openWallet: (link) => {
      opened.push(link);
      return true;
    },
    api: (path) =>
      path === 'handoff-start'
        ? startResponse
        : Promise.resolve({ status: 'ok' }),
  });
  return { controller, opened };
}

function handoffResponse() {
  return {
    ticket: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 290_000).toISOString(),
    serverTime: new Date().toISOString(),
  };
}

await test('cancelar enquanto o pedido local é recuperado não confirma nem cria uma sessão tardia', async () => {
  const { api } = scope();
  const authenticated = session();
  const calls: string[] = [];
  let release: (ticket: string) => void = () => {};
  let sessions = 0;
  const controller = api.createWalletReturn({
    deviceId: () => authenticated.deviceId,
    changed: () => {},
    message: () => {},
    authenticated: () => {
      sessions++;
      return Promise.resolve();
    },
    prepareOpening: () =>
      Promise.resolve({
        receiver: 'receiver',
        nonce: 'a'.repeat(64),
        wallet: 'MetaMask',
      }),
    openingTicket: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    api: (path) => {
      calls.push(path);
      return Promise.resolve(
        path === 'handoff-start'
          ? handoffResponse()
          : path === 'handoff-status'
            ? {
                ...handoffResponse(),
                address: authenticated.address,
                ecosystem: 'evm',
              }
            : authenticated,
      );
    },
  });
  await controller.start('MetaMask', 'evm');
  await controller.refresh();
  const confirming = controller.confirm();
  await controller.cancel();
  release('a'.repeat(64));
  await confirming;
  assert.equal(sessions, 0);
  assert.equal(calls.includes('handoff-confirm'), false);
  controller.close();
});

await test('falha do armazenamento local não impede cancelar o pedido no servidor', async () => {
  const { api } = scope();
  let cancelled = false;
  const controller = api.createWalletReturn({
    deviceId: randomUUID,
    changed: () => {},
    message: () => {},
    authenticated: () => Promise.resolve(),
    forgetOpening: () => Promise.reject(new Error('Storage failed.')),
    api: (path) => {
      if (path === 'handoff-cancel') cancelled = true;
      return Promise.resolve(handoffResponse());
    },
  });
  await controller.start('MetaMask', 'evm');
  await assert.rejects(controller.cancel(), /Storage failed/u);
  assert.equal(cancelled, true);
  assert.equal(controller.state(), null);
  controller.close();
});

await test('seleção abre a wallet uma vez após pedido válido; consulta não abre novamente', async () => {
  const { controller, opened } = launchController(
    Promise.resolve(handoffResponse()),
    'Android Chrome/141.0',
  );
  await controller.start('Phantom', 'solana');
  assert.equal(opened.length, 1);
  assert.match(opened[0] ?? '', /^https:\/\/phantom\.com\/ul\/browse\//u);
  assert.match(decodeURIComponent(opened[0] ?? ''), /0xdmme\.app/u);
  const link = new URL(opened[0] ?? '');
  const destination = new URL(
    decodeURIComponent(link.pathname.slice('/ul/browse/'.length)),
  );
  assert.equal(destination.searchParams.has('returnBrowser'), false);
  assert.equal(destination.searchParams.has('userAgent'), false);
  // A failed status response must not cause a second app launch.
  await controller.refresh();
  assert.equal(opened.length, 1);
  assert.equal(controller.state()?.address, null);
  controller.close();
});

await test('pedido Backpack conserva o destino completo no caminho do documento Android/iOS', async () => {
  for (const agent of ['Android Chrome/141.0', 'iPhone']) {
    for (const ecosystem of ['evm', 'solana'] as const) {
      const { controller, opened } = launchController(
        Promise.resolve(handoffResponse()),
        agent,
      );
      await controller.start('Backpack', ecosystem);
      const diagnostic = controller.openingDiagnostic();
      assert.ok(diagnostic);
      assert.match(diagnostic, /^D2 · protocolo=doc-3/u);
      assert.match(diagnostic, /pedido=presente/u);
      assert.match(
        diagnostic,
        agent === 'iPhone'
          ? /plataforma=ios.*modo=documento/u
          : /plataforma=android.*modo=documento/u,
      );
      assert.doesNotMatch(diagnostic, /a{64}|0x|https:|ticket=/u);
      assert.equal(opened.length, 1);
      const link = new URL(opened[0] ?? '');
      assert.ok(link.pathname.startsWith('/ul/v1/browse/'));
      const destination = new URL(
        decodeURIComponent(link.pathname.slice('/ul/v1/browse/'.length)),
      );
      assert.equal(destination.origin, 'https://0xdmme.app');
      if (agent.startsWith('Android')) {
        assert.equal(link.search, '');
      } else {
        assert.equal(link.searchParams.get('ref'), 'https://0xdmme.app');
      }
      assert.equal(
        destination.pathname,
        `/wallet-entry/${handoffResponse().ticket}/${ecosystem}/Backpack`,
      );
      assert.equal(destination.hash, '');
      assert.equal(destination.search, '');
      assert.equal(controller.state()?.address, null);
      controller.close();
      assert.equal(controller.openingDiagnostic(), null);
    }
  }
});
await test('relógio do dispositivo adiantado ou atrasado não impede abertura nem consulta; confirmação continua obrigatória', async () => {
  for (const offset of [-3_600_000, -5000, 0, 3_600_000]) {
    const { api, navigated } = scope('', 'Android', true, offset);
    let sessions = 0;
    const controller = api.createWalletReturn({
      deviceId: randomUUID,
      changed: () => {},
      message: () => {},
      authenticated: () => {
        sessions++;
        return Promise.resolve();
      },
      openWallet: api.launchMobileWallet,
      api: (path) =>
        Promise.resolve(
          path === 'handoff-start'
            ? handoffResponse()
            : {
                ...handoffResponse(),
                ecosystem: 'solana',
                address: 'So11111111111111111111111111111111111111112',
              },
        ),
    });
    await controller.start('Phantom', 'solana');
    assert.equal(navigated.length, 1);
    const remaining =
      Date.parse(controller.state()?.expiresAt ?? '') - Date.now() - offset;
    assert.ok(remaining > 280_000 && remaining <= 300_000);
    await controller.refresh();
    assert.equal(controller.state()?.ecosystem, 'solana');
    assert.equal(sessions, 0);
    assert.equal(navigated.length, 1);
    controller.close();
  }
});

await test('falha ao preparar o pedido explica a etapa sem expor erro interno nem abrir a wallet', async () => {
  const { controller, opened } = launchController(
    Promise.reject(new Error('private transport details')),
  );
  await assert.rejects(controller.start('MetaMask', 'evm'), {
    status: 503,
    message:
      'Não foi possível criar o pedido para abrir a wallet. Confira a conexão e tente novamente.',
  });
  assert.equal(opened.length, 0);
  assert.equal(controller.link(), null);
  assert.equal(controller.state(), null);
  controller.close();
});

await test('pedido resolvido após fechar ou cancelar nunca abre wallet nem restaura estado', async () => {
  for (const action of ['close', 'cancel'] as const) {
    let resolve!: (value: unknown) => void;
    const response = new Promise<unknown>((complete) => {
      resolve = complete;
    });
    const { controller, opened } = launchController(response);
    const starting = controller.start('Phantom', 'solana');
    await controller[action]();
    resolve(handoffResponse());
    await starting;
    assert.equal(opened.length, 0);
    assert.equal(controller.link(), null);
    assert.equal(controller.state(), null);
    controller.close();
  }
});

await test('resposta inválida ou expirada nunca navega para a wallet', async () => {
  for (const response of [
    { ...handoffResponse(), ticket: 'wrong' },
    { ...handoffResponse(), expiresAt: 'invalid' },
    { ...handoffResponse(), expiresAt: new Date(0).toISOString() },
    { ...handoffResponse(), serverTime: 'invalid' },
    {
      ...handoffResponse(),
      serverTime: new Date(Date.now() + 300_000).toISOString(),
    },
    {
      ...handoffResponse(),
      serverTime: new Date(Date.now() - 60_000).toISOString(),
    },
  ]) {
    const { controller, opened } = launchController(Promise.resolve(response));
    await assert.rejects(controller.start('Phantom', 'solana'));
    assert.equal(opened.length, 0);
    controller.close();
  }
});

await test('navegação mobile não é vetada por ativação expirada; desktop continua sem abertura automática', () => {
  const link = 'https://phantom.app/ul/browse/example';
  for (const userAgent of ['Android', 'iPhone']) {
    const mobile = scope('', userAgent, false);
    assert.equal(mobile.api.launchMobileWallet(link), true);
    assert.deepEqual(mobile.navigated, [link]);
  }
  const desktop = scope('', 'Macintosh');
  assert.equal(desktop.api.launchMobileWallet(link), false);
  assert.deepEqual(desktop.navigated, []);
});

await test('resposta de rede após expirar o clique ainda tenta abrir uma vez e preserva link alternativo', async () => {
  for (const [wallet, network] of [
    ['MetaMask', 'evm'],
    ['Phantom', 'solana'],
  ] as const) {
    const mobile = scope();
    let complete!: (value: unknown) => void;
    const response = new Promise<unknown>((resolve) => {
      complete = resolve;
    });
    const controller = mobile.api.createWalletReturn({
      api: (path) =>
        path === 'handoff-start' ? response : Promise.resolve(null),
      deviceId: randomUUID,
      changed: () => {},
      message: () => {},
      authenticated: () => Promise.resolve(),
      openWallet: mobile.api.launchMobileWallet,
    });
    const starting = controller.start(wallet, network);
    assert.deepEqual(mobile.navigated, []);
    mobile.activation.isActive = false;
    complete(handoffResponse());
    await starting;
    assert.equal(mobile.navigated.length, 1);
    assert.equal(mobile.navigated[0], controller.link());
    await controller.refresh();
    assert.equal(mobile.navigated.length, 1);
    controller.close();
  }
});

await test('recusa de navegação mantém o pedido e oferece o link explícito sem simular abertura', async () => {
  const mobile = scope();
  mobile.navigation.rejected = true;
  const messages: string[] = [];
  const controller = mobile.api.createWalletReturn({
    api: () => Promise.resolve(handoffResponse()),
    deviceId: randomUUID,
    changed: () => {},
    message: (value) => messages.push(value),
    authenticated: () => Promise.resolve(),
    openWallet: mobile.api.launchMobileWallet,
  });
  await controller.start('Phantom', 'solana');
  assert.equal(mobile.navigated.length, 0);
  assert.ok(controller.link());
  assert.ok(controller.state());
  assert.match(messages.at(-1) ?? '', /^Toque em Abrir Phantom/u);
  controller.close();
});
await test('confirmação tardia após cancelar é revogada e não abre a conta nem seu perfil', async () => {
  const { api } = scope();
  const authenticated = session();
  const received: unknown[] = [];
  const calls: string[] = [];
  let resolve: ((value: unknown) => void) | undefined;
  const late = new Promise<unknown>((done) => {
    resolve = done;
  });
  let submitted: () => void = () => {};
  const started = new Promise<void>((done) => {
    submitted = done;
  });
  const controller = api.createWalletReturn({
    deviceId: () => authenticated.deviceId,
    changed: () => {},
    message: () => {},
    authenticated: (value) => {
      received.push(value);
      return Promise.resolve();
    },
    api: (path) => {
      calls.push(path);
      if (path === 'handoff-start')
        return Promise.resolve({
          ticket: 'a'.repeat(64),
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          serverTime: new Date().toISOString(),
        });
      if (path === 'handoff-status')
        return Promise.resolve({
          address: authenticated.address,
          ecosystem: 'evm',
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          serverTime: new Date().toISOString(),
        });
      if (path === 'handoff-confirm') {
        submitted();
        return late;
      }
      return Promise.resolve({ status: 'ok' });
    },
  });
  await controller.start('MetaMask', 'evm');
  await controller.refresh();
  const confirming = controller.confirm();
  await started;
  await controller.cancel();
  resolve?.(authenticated);
  await confirming;
  assert.equal(received.length, 0);
  assert.ok(calls.includes('logout'));
  controller.close();
});
