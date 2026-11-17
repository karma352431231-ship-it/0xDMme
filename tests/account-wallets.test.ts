import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Wallet } from 'ethers';
import { addSelectedWallet } from '../src/client/account-wallets/index.ts';
import type { WalletConnection } from '../src/client/wallet/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import {
  accountWallets,
  signaturesRequired,
  walletAdditionStatement,
} from '../src/shared/account-wallets/index.ts';
import type { AccountWallet } from '../src/shared/account-wallets/index.ts';

const origin = 'https://0xdmme.app';
const requestId = '33333333-3333-4333-8333-333333333333';
const expiresAt = '2026-11-17T12:05:00.000Z';
const primary = new Wallet(`0x${'1'.padStart(64, '0')}`);
const backup = new Wallet(`0x${'2'.padStart(64, '0')}`);
const session: AccountSession = {
  accountId: '11111111-1111-4111-8111-111111111111',
  ecosystem: 'evm',
  address: primary.address.toLowerCase(),
  name: '',
  deviceId: '22222222-2222-4222-8222-222222222222',
  deviceState: 'pending',
  historyAuthorized: false,
  expiresAt: '2027-11-17T00:00:00.000Z',
  csrf: 'a'.repeat(64),
  profileRevision: 0,
  walletConfirmed: true,
};
const current: AccountWallet[] = [
  { ecosystem: 'evm', address: session.address, primary: true },
];
function statement(address = backup.address.toLowerCase()): string {
  return walletAdditionStatement({
    origin,
    account: { ecosystem: 'evm', address: session.address },
    wallet: { ecosystem: 'evm', address },
    id: requestId,
    expiresAt,
  });
}
/** A wallet extension holding `signer`, optionally switching account while signing. */
function connection(
  signer: Wallet,
  after: Wallet = signer,
): WalletConnection & { signed: string[] } {
  const signed: string[] = [];
  let selected = signer;
  return {
    id: 'test:evm',
    name: 'Test wallet',
    ecosystem: 'evm',
    signed,
    identity: () =>
      Promise.resolve({
        ecosystem: 'evm',
        address: selected.address,
        chainId: 1,
      }),
    sign: async (message) => {
      signed.push(message);
      const signature = await signer.signMessage(message);
      selected = after;
      return signature;
    },
    observe: () => () => undefined,
  };
}
/** The server as this client sees it; records what was posted. */
function server(t: { after: (cleanup: () => void) => void }, message: string) {
  const posted: { path: string; input: unknown }[] = [];
  const scope = globalThis as { fetch: unknown; location?: unknown };
  const previous = { fetch: scope.fetch, location: scope.location };
  scope.location = { origin };
  scope.fetch = (path: string, init: RequestInit) => {
    const input: unknown = JSON.parse(
      typeof init.body === 'string' ? init.body : 'null',
    );
    posted.push({ path, input });
    return Promise.resolve(
      Response.json(
        path.endsWith('/request')
          ? { id: requestId, expiresAt, message }
          : {
              wallets: [
                ...current,
                {
                  ecosystem: 'evm',
                  address: backup.address.toLowerCase(),
                  primary: false,
                },
              ],
            },
      ),
    );
  };
  t.after(() => {
    scope.fetch = previous.fetch;
    scope.location = previous.location;
  });
  return posted;
}

await test('the selected wallet signs the expected statement and is added', async (t) => {
  const posted = server(t, statement());
  const wallet = connection(backup);
  const result = await addSelectedWallet({
    session,
    current,
    connection: wallet,
  });
  assert.deepEqual(wallet.signed, [statement()]);
  assert.deepEqual(
    posted.map((entry) => entry.path),
    ['/api/account/wallets/request', '/api/account/wallets/add'],
  );
  assert.deepEqual(posted[0]?.input, {
    ecosystem: 'evm',
    address: backup.address.toLowerCase(),
  });
  assert.equal(result.length, 2);
});

await test('a statement that differs from the expected one is never signed', async (t) => {
  for (const altered of [
    statement().replace(session.address, backup.address.toLowerCase()),
    statement().replace(origin, 'https://example.invalid'),
    statement(primary.address.toLowerCase()),
    `${statement()}\nAlso approve token spending.`,
  ]) {
    const posted = server(t, altered);
    const wallet = connection(backup);
    await assert.rejects(
      addSelectedWallet({ session, current, connection: wallet }),
      /unexpected request/u,
    );
    assert.deepEqual(wallet.signed, []);
    assert.equal(posted.length, 1);
  }
});

await test('a wallet already on the account is refused before any request', async (t) => {
  const posted = server(t, statement());
  const wallet = connection(primary);
  await assert.rejects(
    addSelectedWallet({ session, current, connection: wallet }),
    /must be different/u,
  );
  assert.deepEqual(posted, []);
  assert.deepEqual(wallet.signed, []);
});

await test('a wallet account switched during signing adds nothing', async (t) => {
  const posted = server(t, statement());
  await assert.rejects(
    addSelectedWallet({
      session,
      current,
      connection: connection(backup, primary),
    }),
    /changed during signing/u,
  );
  assert.deepEqual(
    posted.map((entry) => entry.path),
    ['/api/account/wallets/request'],
  );
});

await test('one or two wallets need one signature; three need two', () => {
  assert.deepEqual([1, 2, 3].map(signaturesRequired), [1, 1, 2]);
  assert.throws(() => signaturesRequired(0));
});

await test('a wallet list needs exactly one main wallet, no repeats and no more than the limit', () => {
  const extra = {
    ecosystem: 'evm',
    address: backup.address.toLowerCase(),
    primary: false,
  };
  assert.equal(accountWallets({ wallets: [...current, extra] }).length, 2);
  for (const wallets of [
    [],
    [extra],
    [...current, { ...current[0] }],
    [...current, { ...extra, primary: true }],
    [...current, extra, { ...extra, address: `0x${'3'.repeat(40)}` }],
    [{ ...current[0], address: 'not-an-address' }],
  ])
    assert.throws(() => accountWallets({ wallets }));
});
