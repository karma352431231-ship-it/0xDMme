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

await test('view invalidation hides an old read without rejecting confirmation of its own creation or entry', async () => {
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

await test('session change or revocation still cancels a mutation, including during its HTTP response', async (t) => {
  const { authority } = fixture();
  await assert.rejects(
    authority.mutate(() => {
      authority.invalidate();
      return Promise.resolve('saved');
    }),
    /Account authorization changed/u,
  );
  t.mock.method(globalThis, 'fetch', () => {
    authority.invalidate();
    return Promise.resolve(Response.json({ status: 'saved' }));
  });
  await assert.rejects(
    authority.mutate((context) => context.api('group-link-revoke', {})),
    /Account authorization changed/u,
  );
});

await test('vault authority must match the current account, device and session', async () => {
  for (const field of ['accountId', 'deviceId', 'csrf'] as const) {
    const { authority, vault, session } = fixture();
    vault.session = { ...session, [field]: crypto.randomUUID() };
    await assert.rejects(
      authority.mutate(() => Promise.resolve('saved')),
      /Account changed/u,
    );
  }
});
