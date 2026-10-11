import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupAuthority } from '../src/client/groups/authority.ts';
import { PeerIdentity } from '../src/client/peer-identity/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';

function fixture() {
  const session = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
  };
  const vault: VaultAuthority = {
    session,
    offline: false,
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    key: () => Promise.reject(new Error('Sem chave neste teste de ciclo.')),
    sign: () => Promise.resolve('assinatura-sintética'),
  };
  const access: VaultAccess = {
    withVault: (_offline, work) => work(vault),
    withLocalVault: () => Promise.reject(new Error('Sem cofre offline.')),
  };
  const authority = new GroupAuthority({
    access,
    identities: new PeerIdentity(new VaultSync(access)),
    session: () => session,
  });
  return { authority, vault, session };
}

await test('invalidar a vista oculta uma leitura antiga sem rejeitar a confirmação da própria criação/entrada', async () => {
  const { authority } = fixture();
  let viewRevision = 0;
  const expected = viewRevision;
  const readGuard = () => {
    if (expected !== viewRevision) throw new Error('Vista alterada.');
  };
  await assert.rejects(
    authority.run(readGuard, () => {
      viewRevision++;
      return Promise.resolve('conteúdo antigo');
    }),
    /Vista alterada/u,
  );
  assert.equal(
    await authority.mutate(() => {
      viewRevision++;
      return Promise.resolve('saved');
    }),
    'saved',
  );
});

await test('troca de sessão ou revogação ainda cancela uma mutação, inclusive durante sua resposta HTTP', async (t) => {
  const { authority } = fixture();
  await assert.rejects(
    authority.mutate(() => {
      authority.invalidate();
      return Promise.resolve('saved');
    }),
    /Autorização da conta alterada/u,
  );
  t.mock.method(globalThis, 'fetch', () => {
    authority.invalidate();
    return Promise.resolve(Response.json({ status: 'saved' }));
  });
  await assert.rejects(
    authority.mutate((context) => context.api('group-link-revoke', {})),
    /Autorização da conta alterada/u,
  );
});

await test('autoridade do cofre precisa coincidir com conta, aparelho e sessão atuais', async () => {
  for (const field of ['accountId', 'deviceId', 'csrf'] as const) {
    const { authority, vault, session } = fixture();
    vault.session = { ...session, [field]: crypto.randomUUID() };
    await assert.rejects(
      authority.mutate(() => Promise.resolve('saved')),
      /Conta alterada/u,
    );
  }
});
