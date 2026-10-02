import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base58 } from '@scure/base';
import { getWallets } from '@wallet-standard/app';
import {
  discoverWallets,
  SolanaConnectionError,
} from '../src/client/wallet/index.ts';
import { createApprovalDiagnostics } from '../src/client/account/approval-diagnostics.ts';

function connectionFixture(connect: () => Promise<unknown>) {
  let accounts: {
    address: string;
    publicKey: Uint8Array;
    chains: readonly ['solana:mainnet'];
    features: readonly ['solana:signMessage'];
  }[] = [];
  const wallet = {
    version: '1.0.0' as const,
    name: 'MetaMask',
    icon: 'data:image/png;base64,' as const,
    chains: ['solana:mainnet'] as const,
    get accounts() {
      return accounts;
    },
    features: {
      'standard:connect': { connect },
      'solana:signMessage': {
        signMessage: () => {
          throw new Error('Assinatura não deve ser solicitada neste teste.');
        },
      },
    },
  };
  const restoreWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: new EventTarget(),
  });
  const registry = discoverWallets();
  const unregister = getWallets().register(wallet);
  const connection = registry.get('MetaMask:solana');
  assert.ok(connection);
  return {
    connection,
    authorize(valid = true) {
      accounts = [
        {
          address: base58.encode(new Uint8Array(32).fill(42)),
          publicKey: new Uint8Array(32).fill(valid ? 42 : 43),
          chains: ['solana:mainnet'],
          features: ['solana:signMessage'],
        },
      ];
    },
    close() {
      unregister();
      registry.close();
      if (restoreWindow)
        Object.defineProperty(globalThis, 'window', restoreWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    },
  };
}

await test('conexão Solana distingue recusa do provider sem transportar texto ou dados privados', async (t) => {
  const fixture = connectionFixture(() =>
    Promise.reject(
      Object.assign(new Error('PRIVATE ticket=secret signature=secret'), {
        code: 4100,
        data: { address: 'PRIVATE' },
      }),
    ),
  );
  t.after(() => fixture.close());
  await assert.rejects(fixture.connection.identity(true), (error: unknown) => {
    assert.ok(error instanceof SolanaConnectionError);
    assert.equal(error.category, 'conexao-nao-autorizada');
    assert.doesNotMatch(error.message, /PRIVATE|secret|ticket|signature/u);
    assert.equal('cause' in error, false);
    assert.equal('data' in error, false);
    return true;
  });
});

await test('conexão resolvida sem conta não vira assinatura e conta autorizada posteriormente pode ser usada', async (t) => {
  let calls = 0;
  const fixture = connectionFixture(() => {
    calls++;
    return Promise.resolve({ accounts: [] });
  });
  t.after(() => fixture.close());
  await assert.rejects(fixture.connection.identity(true), (error: unknown) => {
    assert.ok(error instanceof SolanaConnectionError);
    assert.equal(error.category, 'conta-solana-ausente');
    return true;
  });
  assert.equal(calls, 1);
  fixture.authorize();
  assert.equal((await fixture.connection.identity(false)).ecosystem, 'solana');
  assert.equal(calls, 1);
  fixture.authorize(false);
  await assert.rejects(fixture.connection.identity(false), (error: unknown) => {
    assert.ok(error instanceof SolanaConnectionError);
    assert.equal(error.category, 'conta-solana-invalida');
    return true;
  });
});

await test('D1 recebe somente categoria fixa de conexão, mantendo HTTP e erro genérico separados', (t) => {
  const location = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { hash: '#configuracoes' },
  });
  t.after(() => {
    if (location) Object.defineProperty(globalThis, 'location', location);
    else Reflect.deleteProperty(globalThis, 'location');
  });
  const diagnostic = createApprovalDiagnostics();
  diagnostic.step('conexao-solicitada');
  diagnostic.fail(new SolanaConnectionError('conta-solana-ausente'));
  assert.match(
    diagnostic.text(true),
    /etapa=conexao-solicitada.*falha=conta-solana-ausente/u,
  );
  assert.doesNotMatch(diagnostic.text(true), /Selecione|0x|PRIVATE|signature/u);
  diagnostic.fail(403);
  assert.match(diagnostic.text(true), /falha=HTTP-403/u);
  diagnostic.fail();
  assert.match(diagnostic.text(true), /falha=local-ou-provider/u);
  diagnostic.step('conexao-recebida');
  assert.match(diagnostic.text(true), /falha=nao/u);
});
