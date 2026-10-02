import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base58 } from '@scure/base';
import { getWallets } from '@wallet-standard/app';
import {
  discoverWallets,
  walletBrowserUrl,
} from '../src/client/wallet/index.ts';
import {
  canonicalAddress,
  solanaPublicKey,
} from '../src/shared/wallet-identity/index.ts';

await test('links mobile limitam destino à entrada HTTPS própria sem fragmento ou token de sessão', () => {
  const ticket = 'a'.repeat(64);
  const origin = 'https://hash-talk.example';
  for (const wallet of ['MetaMask', 'Phantom', 'Backpack'] as const) {
    const result = walletBrowserUrl({
      origin,
      wallet,
      ticket,
      ecosystem: wallet === 'MetaMask' ? 'evm' : 'solana',
    });
    assert.ok(result);
    const link = new URL(result);
    assert.equal(link.hash, '');
    const decoded = decodeURIComponent(link.pathname + link.search);
    assert.ok(decoded.includes('/wallet-entry?ticket='));
    assert.ok(!decoded.includes('#'));
    assert.ok(decoded.includes(ticket));
    assert.ok(!link.searchParams.has('session'));
    assert.ok(!link.searchParams.has('signature'));
  }
  assert.equal(
    walletBrowserUrl({
      origin: 'http://127.0.0.1:45100',
      wallet: 'Phantom',
      ticket,
      ecosystem: 'solana',
    }),
    null,
  );
  assert.throws(() =>
    walletBrowserUrl({
      origin,
      wallet: 'Phantom',
      ticket: 'wrong',
      ecosystem: 'solana',
    }),
  );
});
await test('MetaMask abre o destino HTTPS completo sem exigir decodificação dos delimitadores, em EVM e Solana', () => {
  const ticket = 'b'.repeat(64);
  for (const ecosystem of ['evm', 'solana'] as const) {
    const link = walletBrowserUrl({
      origin: 'https://0xdmme.app:8443',
      wallet: 'MetaMask',
      ticket,
      ecosystem,
    });
    assert.ok(link);
    const prefix = 'https://link.metamask.io/dapp/';
    assert.ok(link.startsWith(prefix));
    // The native dapp handler prepends HTTPS to the suffix as received.
    // An encoded slash or question mark would become part of the hostname.
    const destination = new URL('https://' + link.slice(prefix.length));
    assert.equal(destination.origin, 'https://0xdmme.app:8443');
    assert.equal(destination.pathname, '/wallet-entry');
    assert.equal(destination.hash, '');
    assert.deepEqual(
      [...destination.searchParams],
      [
        ['ticket', ticket],
        ['ecosystem', ecosystem],
        ['wallet', 'MetaMask'],
      ],
    );
  }
});
await test('endereços Solana são Base58 de 32 bytes e EVM normaliza somente seu ecossistema', () => {
  const bytes = new Uint8Array(32).fill(42);
  const address = base58.encode(bytes);
  assert.deepEqual(solanaPublicKey(address), bytes);
  assert.equal(canonicalAddress('solana', address), address);
  assert.throws(() => solanaPublicKey(`${address}1`));
  assert.throws(() => canonicalAddress('solana', '0x' + 'a'.repeat(40)));
  assert.equal(
    canonicalAddress('evm', '0x' + 'A'.repeat(40)),
    '0x' + 'a'.repeat(40),
  );
});
await test('descobre outra wallet EIP-6963 e MetaMask Solana anunciada após a página abrir, rejeitando mensagem alterada', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: target,
  });
  const wallets = discoverWallets();
  t.after(() => wallets.close());
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const uuid = '12345678-1234-4123-8123-123456789abc';
  const methods: string[] = [];
  target.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: { uuid, name: 'Outra wallet', rdns: 'example.wallet' },
        provider: {
          request(input: { method: string }) {
            methods.push(input.method);
            if (input.method === 'eth_requestAccounts')
              return Promise.resolve(['0x' + 'A'.repeat(40)]);
            if (input.method === 'eth_chainId') return Promise.resolve('0x1');
            return Promise.resolve('0x' + 'a'.repeat(130));
          },
        },
      },
    }),
  );
  const evm = wallets.get(uuid);
  assert.ok(evm);
  const identity = await evm.identity(true);
  assert.equal(identity.ecosystem, 'evm');
  await evm.sign('Login sem transação', identity.address);
  assert.deepEqual(methods, [
    'eth_requestAccounts',
    'eth_chainId',
    'personal_sign',
  ]);
  const account = {
    address: base58.encode(new Uint8Array(32).fill(42)),
    publicKey: new Uint8Array(32).fill(42),
    chains: ['solana:mainnet'] as const,
    features: ['solana:signMessage'] as const,
  };
  let alter = false;
  let connected = false;
  let observed: (() => void) | undefined;
  const standard = {
    version: '1.0.0' as const,
    name: 'MetaMask',
    icon: 'data:image/png;base64,' as const,
    chains: ['solana:mainnet'] as const,
    get accounts() {
      return connected ? [account] : [];
    },
    features: {
      'standard:connect': {
        connect: () => {
          connected = true;
          return Promise.resolve({ accounts: [account] });
        },
      },
      'standard:events': {
        on: (_event: string, listener: () => void) => {
          observed = listener;
          return () => {
            observed = undefined;
          };
        },
      },
      'solana:signMessage': {
        signMessage: (input: { message: Uint8Array }) =>
          Promise.resolve([
            {
              signedMessage: alter ? new Uint8Array([0]) : input.message,
              signature: new Uint8Array(64),
            },
          ]),
      },
    },
  };
  assert.equal(wallets.get('MetaMask:solana'), undefined);
  let announcements = 0;
  const unsubscribe = wallets.onChange(() => announcements++);
  t.after(unsubscribe);
  const unregister = getWallets().register(standard);
  t.after(unregister);
  assert.equal(announcements, 1);
  const sol = wallets.get('MetaMask:solana');
  assert.ok(sol);
  assert.equal(sol.ecosystem, 'solana');
  assert.equal(sol.name, 'MetaMask');
  const offSolflare = getWallets().register({ ...standard, name: 'Solflare' });
  t.after(offSolflare);
  assert.equal(wallets.get('Solflare:solana'), undefined);
  assert.equal(
    wallets.list().some((item) => item.name === 'Solflare'),
    false,
  );
  await assert.rejects(sol.identity(false), /Selecione uma conta Solana/u);
  assert.equal((await sol.identity(true)).address, account.address);
  let changes = 0;
  const off = sol.observe(() => changes++);
  observed?.();
  assert.equal(changes, 1);
  off();
  assert.ok(await sol.sign('Login', account.address));
  alter = true;
  await assert.rejects(sol.sign('Login', account.address), /alterou/u);
});
