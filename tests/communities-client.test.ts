import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from '../src/shared/account/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import { Communities } from '../src/client/communities/controller.ts';

function session(): AccountSession {
  return {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    name: 'Privado',
    address: `0x${'1'.repeat(40)}`,
    ecosystem: 'evm',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    profileRevision: 0,
    walletConfirmed: true,
  };
}
function access(
  account: AccountSession,
  signing: () => Promise<string>,
): VaultAccess {
  const authority: VaultAuthority = {
    session: account,
    offline: false,
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    sign: signing,
    key: () =>
      Promise.reject(new Error('Operação não precisa de chave de conteúdo.')),
  };
  return {
    withVault: (_offline, work) => work(authority),
    withLocalVault: (_locator, work) => work(authority),
  };
}
const result = () => ({
  community: {
    id: crypto.randomUUID(),
    name: 'Sintética',
    description: '',
    rules: '',
    revision: 1,
    archived: false,
    avatar: null,
    owner: null,
    followers: 0,
  },
  role: 'participant',
  following: false,
  canPost: true,
  pendingPhoto: null,
  sanction: null,
  transfer: null,
});
await test('troca de sessão durante assinatura de comunidade impede envio com autoridade antiga', async (t) => {
  const first = session();
  let started: () => void = () => {
    throw new Error('Não iniciado.');
  };
  let finish: (signature: string) => void = () => {
    throw new Error('Não iniciado.');
  };
  const signing = new Promise<void>((resolve) => {
      started = resolve;
    }),
    signed = new Promise<string>((resolve) => {
      finish = resolve;
    });
  const controller = new Communities(
    access(first, () => {
      started();
      return signed;
    }),
  );
  controller.setSession(first);
  const fetch = t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json(result())),
  );
  const pending = controller.request('discovery-preference-set', {
    id: crypto.randomUUID(),
    post: crypto.randomUUID(),
    preference: { saved: true, hidden: false, revision: 0 },
  });
  await signing;
  controller.setSession(session());
  finish('assinatura-sintetica');
  await assert.rejects(pending, /Sessão alterada/);
  assert.equal(fetch.mock.callCount(), 0);
});
await test('resposta atrasada não restaura comunidade de outra sessão; estado recusa campos privados', async (t) => {
  const first = session(),
    controller = new Communities(
      access(first, () => Promise.resolve('assinatura-sintetica')),
    );
  controller.setSession(first);
  let started: () => void = () => {
      throw new Error('Não iniciado.');
    },
    finish: (response: Response) => void = () => {
      throw new Error('Não iniciado.');
    };
  const sent = new Promise<void>((resolve) => {
      started = resolve;
    }),
    response = new Promise<Response>((resolve) => {
      finish = resolve;
    });
  t.mock.method(globalThis, 'fetch', () => {
    started();
    return response;
  });
  const pending = controller.state(crypto.randomUUID());
  await sent;
  controller.setSession(null);
  finish(Response.json(result()));
  await assert.rejects(pending, /Sessão alterada/);
  const clean = new Communities(
    access(first, () => Promise.resolve('assinatura-sintetica')),
  );
  clean.setSession(first);
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json({ ...result(), accountId: first.accountId })),
  );
  await assert.rejects(clean.state(crypto.randomUUID()), /Campos inválidos/);
});
