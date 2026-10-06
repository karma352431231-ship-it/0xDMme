import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from '../src/shared/account/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import { SocialDms } from '../src/client/social-dm/index.ts';

await test('DM cancela antes do envio se a sessão muda durante assinatura; não usa autoridade de outra conta', async (t) => {
  const session: AccountSession = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    name: 'Sintético',
    address: `0x${'1'.repeat(40)}`,
    ecosystem: 'evm',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    profileRevision: 0,
    walletConfirmed: true,
  };
  let started: () => void = () => {
      throw new Error('Não iniciado.');
    },
    finish: (signature: string) => void = () => {
      throw new Error('Não iniciado.');
    };
  const signing = new Promise<void>((resolve) => {
      started = resolve;
    }),
    signed = new Promise<string>((resolve) => {
      finish = resolve;
    });
  const authority: VaultAuthority = {
    session,
    offline: false,
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    sign: () => {
      started();
      return signed;
    },
    key: () => Promise.reject(new Error('Sem chave neste teste.')),
  };
  const access: VaultAccess = {
    withVault: (_offline, work) => work(authority),
    withLocalVault: (_locator, work) => work(authority),
  };
  const controller = new SocialDms(access, new VaultSync(access)),
    fetch = t.mock.method(globalThis, 'fetch', () =>
      Promise.resolve(Response.json({ status: 'saved' })),
    );
  controller.setSession(session);
  const pending = controller.request('request', { peer: crypto.randomUUID() }),
    rejection = assert.rejects(pending, /Sessão/);
  await signing;
  controller.setSession(null);
  finish('a'.repeat(88));
  await rejection;
  assert.equal(fetch.mock.callCount(), 0);
  controller.setSession({ ...session, accountId: crypto.randomUUID() });
  await assert.rejects(
    controller.request('list', { after: null }),
    /outra conta/,
  );
  assert.equal(fetch.mock.callCount(), 0);
});
