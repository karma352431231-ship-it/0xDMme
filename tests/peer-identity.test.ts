import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PeerIdentity,
  readDirectories,
} from '../src/client/peer-identity/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type { VaultEntry } from '../src/client/vault-sync/index.ts';
import { pinFor } from '../src/client/peer-identity/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';
function identities(): PeerIdentity {
  const access = {
    withVault: () => Promise.reject(new Error('Sem rede neste teste.')),
    withLocalVault: () => Promise.reject(new Error('Sem cofre neste teste.')),
  };
  return new PeerIdentity(new VaultSync(access));
}
await test('avisos repetidos conferem o índice sem baixar identidades já autenticadas; novo registro é validado', async () => {
  const peer = await groupParticipant();
  const entry: VaultEntry = {
    change: {
      version: 1,
      entity: peer.accountId,
      kind: 'contact',
      parents: [],
      label: 'Identidade para mensagens',
    },
    commit: {
      version: 1,
      id: crypto.randomUUID(),
      accountId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      directory: peer.head,
      authorityRevision: 1,
      epoch: 1,
      sequence: 1,
      previous: null,
      block: { hash: peer.head, bytes: 32 },
      manifest: { iv: '', ciphertext: '' },
      signature: '',
    },
  };
  let opened = 0,
    refreshed = 0;
  let value = JSON.stringify({
    accountId: peer.accountId,
    pin: await pinFor([peer.directory]),
  });
  const heads = new Map([[peer.accountId, [entry]]]);
  const identity = new PeerIdentity({
    complete: true,
    currentHeads: () => heads,
    isRemoved: () => false,
    refresh: () => {
      refreshed++;
      return Promise.resolve();
    },
    open: () => {
      opened++;
      return Promise.resolve(value);
    },
    save: () => Promise.resolve(),
  });
  await identity.load();
  await identity.load();
  assert.equal(opened, 1);
  assert.equal(refreshed, 2);
  const replacement = await groupParticipant({ accountId: peer.accountId });
  value = JSON.stringify({
    accountId: peer.accountId,
    pin: await pinFor([replacement.directory]),
  });
  heads.set(peer.accountId, [
    {
      ...entry,
      commit: { ...entry.commit, id: crypto.randomUUID(), sequence: 2 },
    },
  ]);
  await assert.rejects(identity.load(), /Identidades fixadas em conflito/u);
  assert.equal(opened, 2);
  assert.equal(identity.get(peer.accountId)?.directory, peer.head);
});
await test('troca de conta invalida conferência pendente; raiz diferente da identidade fixada é recusada', async () => {
  const peer = await groupParticipant(),
    pins = identities();
  const pending = pins.remember(peer.accountId, [peer.directory]);
  pins.clear();
  await assert.rejects(pending, /Sessão alterada/u);
  assert.equal(pins.get(peer.accountId), null);
  await pins.remember(peer.accountId, [peer.directory]);
  const replacement = await groupParticipant({ accountId: peer.accountId });
  await assert.rejects(
    pins.verify({
      account: peer.accountId,
      events: [replacement.directory],
      expected: replacement.head,
      current: true,
    }),
  );
  assert.equal(pins.get(peer.accountId)?.directory, peer.head);
});
await test('diretórios de grupo usam lotes limitados e recusam repetição ou cápsulas excedidas', async () => {
  const peers = await Promise.all(
      Array.from({ length: 33 }, () => groupParticipant()),
    ),
    rows = new Map(peers.map((p) => [p.accountId, p])),
    sizes: number[] = [];
  const result = await readDirectories({
    accounts: peers.map((p) => p.accountId),
    identities: identities(),
    load: (requests) => {
      sizes.push(requests.length);
      return Promise.resolve({
        directories: requests.map((r) => {
          const p = rows.get(r.accountId);
          if (!p) throw new Error('Fixture ausente.');
          return {
            accountId: p.accountId,
            head: p.head,
            revision: 1,
            events: [p.directory],
          };
        }),
        recovery: [],
      });
    },
  });
  assert.equal(result.size, 33);
  assert.deepEqual(sizes, [16, 16, 1]);
  const p = peers[0];
  assert.ok(p);
  const directory = {
    accountId: p.accountId,
    head: p.head,
    revision: 1,
    events: [p.directory],
  };
  await assert.rejects(
    readDirectories({
      accounts: [p.accountId, peers[1]!.accountId],
      identities: identities(),
      load: () =>
        Promise.resolve({ directories: [directory, directory], recovery: [] }),
    }),
    /repetido/u,
  );
  await assert.rejects(
    readDirectories({
      accounts: [p.accountId],
      identities: identities(),
      load: () =>
        Promise.resolve({ directories: [directory], recovery: [{}, {}] }),
    }),
    /incompletos/u,
  );
});
