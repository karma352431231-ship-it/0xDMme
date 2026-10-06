import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from '../src/shared/account/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import { PublicProfiles } from '../src/client/public-profile/controller.ts';

function session(): AccountSession {
  return {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    name: 'Nome privado',
    address: `0x${'1'.repeat(40)}`,
    ecosystem: 'evm',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    profileRevision: 0,
    walletConfirmed: true,
  };
}
function access(
  session: AccountSession,
  signing: () => Promise<string>,
): VaultAccess {
  const authority: VaultAuthority = {
    session,
    offline: false,
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    sign: signing,
    key: () =>
      Promise.reject(
        new Error('Chave privada não é necessária nesta operação.'),
      ),
  };
  return {
    withVault: (_offline, work) => work(authority),
    withLocalVault: (_locator, work) => work(authority),
  };
}
const result = () => ({
  profile: { id: crypto.randomUUID(), handle: 'sintetico', avatar: null },
  revision: 1,
  pendingAvatar: null,
});
await test('resposta atrasada do perfil público não repõe identidade após troca de conta', async (t) => {
  const first = session(),
    controller = new PublicProfiles(
      access(first, () => Promise.resolve('assinatura-sintetica')),
    );
  controller.setSession(first);
  let finish: (response: Response) => void = () => {
    throw new Error('Resposta não preparada.');
  };
  const response = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  let sent: () => void = () => {
    throw new Error('Pedido não preparado.');
  };
  const started = new Promise<void>((resolve) => {
    sent = resolve;
  });
  t.mock.method(globalThis, 'fetch', () => {
    sent();
    return response;
  });
  const pending = controller.refresh();
  await started;
  controller.setSession(session());
  finish(Response.json(result()));
  await assert.rejects(pending, /Sessão alterada/);
  assert.equal(controller.profile, null);
});
await test('troca de sessão durante assinatura impede o envio e campos privados são recusados', async (t) => {
  const first = session();
  let complete: (signature: string) => void = () => {
    throw new Error('Assinatura não preparada.');
  };
  let signing: () => void = () => {
    throw new Error('Pedido não preparado.');
  };
  const started = new Promise<void>((resolve) => {
    signing = resolve;
  });
  const signature = new Promise<string>((resolve) => {
    complete = resolve;
  });
  const controller = new PublicProfiles(
    access(first, () => {
      signing();
      return signature;
    }),
  );
  controller.setSession(first);
  const fetch = t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json(result())),
  );
  const pending = controller.refresh();
  await started;
  controller.setSession(session());
  complete('assinatura-sintetica');
  await assert.rejects(pending, /Sessão alterada/);
  assert.equal(fetch.mock.callCount(), 0);
  const clean = new PublicProfiles(
    access(first, () => Promise.resolve('assinatura-sintetica')),
  );
  clean.setSession(first);
  fetch.mock.mockImplementation(() =>
    Promise.resolve(Response.json({ ...result(), accountId: first.accountId })),
  );
  await assert.rejects(clean.refresh(), /Campos inválidos/);
  assert.equal(clean.profile, null);
});
