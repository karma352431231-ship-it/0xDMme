import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchApi } from '../src/client/api-response/index.ts';
import { Contacts } from '../src/client/contacts/index.ts';
import { networkAvailable } from '../src/client/connectivity/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';

await test('a real server response resumes signed contacts despite a false browser offline hint', async (t) => {
  const hint = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: false,
  });
  t.after(() => {
    if (hint) Object.defineProperty(navigator, 'onLine', hint);
    else Reflect.deleteProperty(navigator, 'onLine');
  });
  const session: AccountSession = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    ecosystem: 'evm',
    address: '0x' + 'a'.repeat(40),
    name: '',
    csrf: 'c'.repeat(64),
    profileRevision: 0,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    walletConfirmed: true,
    deviceState: 'pending',
    historyAuthorized: false,
  };
  let signed = 0;
  const authority = {
    session,
    directory: 'synthetic-directory',
    sign: () => {
      signed++;
      return Promise.resolve('synthetic-signature');
    },
  } as unknown as VaultAuthority;
  const access: VaultAccess = {
    withVault: (offline, work) => {
      assert.equal(offline, false);
      return work(authority);
    },
    withLocalVault: () =>
      Promise.reject(new Error('Not an offline operation.')),
  };
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', (path: string) => {
    paths.push(path);
    return Promise.resolve(
      path === '/api/account/session'
        ? new Response(null, { status: 401 })
        : Response.json({ revision: 0, mode: 'invite', inviteHash: null }),
    );
  });
  const response = await fetchApi('account/session', '/api/account/session', {
    cache: 'no-store',
  });
  assert.equal(response.status, 401);
  const contacts = new Contacts(access);
  await assert.rejects(contacts.refresh(), /Sign in/u);
  assert.equal(signed, 0, 'Connectivity never supplies account authorization');
  contacts.setSession(session);
  await contacts.refresh();
  assert.equal(signed, 1);
  assert.deepEqual(paths, [
    '/api/account/session',
    '/api/account/contacts/state',
  ]);
  assert.equal(
    navigator.onLine,
    false,
    'The browser hint is never overwritten',
  );
  const cancellation = new AbortController();
  cancellation.abort();
  t.mock.method(globalThis, 'fetch', () =>
    Promise.reject(new DOMException('Cancelled', 'AbortError')),
  );
  await assert.rejects(
    fetchApi('account/session', '/api/account/session', {
      signal: cancellation.signal,
    }),
  );
  assert.equal(
    networkAvailable(),
    true,
    'Cancelling an operation does not revoke valid network evidence',
  );
  t.mock.method(globalThis, 'fetch', () =>
    Promise.reject(new TypeError('Offline')),
  );
  await assert.rejects(fetchApi('account/session', '/api/account/session', {}));
  assert.equal(networkAvailable(), false);
  await assert.rejects(contacts.refresh(), /connect/u);
  assert.equal(
    signed,
    1,
    'Failed connectivity does not release a signed operation',
  );
});
