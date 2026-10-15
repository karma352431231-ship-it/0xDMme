import assert from 'node:assert/strict';
import { Contacts } from '../src/client/contacts/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import { directoryItems } from '../src/client/contacts/directory-view.ts';
import { test } from 'node:test';
import {
  contactSearchMatches,
  searchContacts,
} from '../src/client/contacts/view.ts';
import type { Peer } from '../src/shared/contacts/index.ts';

await test('busca local usa nomes e wallets da página carregada sem alterar identidade ou dados', () => {
  const peer: Peer = {
    accountId: crypto.randomUUID(),
    ecosystem: 'evm',
    address: '0x' + 'a'.repeat(40),
    name: 'Théo de Sá',
  };
  for (const query of [' theo ', 'DE SA', '0xaaaa', 'EVM', ''])
    assert.deepEqual(searchContacts([peer], query), [peer]);
  assert.deepEqual(searchContacts([peer], 'Outra pessoa'), []);
  assert.equal(peer.name, 'Théo de Sá');
  assert.equal(peer.address, '0x' + 'a'.repeat(40));
});

await test('busca por Solana não normaliza o endereço guardado e agenda aceita apelido sem acento', () => {
  const peer: Peer = {
    accountId: crypto.randomUUID(),
    ecosystem: 'solana',
    address: 'AbCdEf23456789abcdefghijkmnopqrstuvwxyzABCDEF',
    name: 'Contato Solana',
  };
  assert.deepEqual(searchContacts([peer], 'abcdef'), [peer]);
  assert.equal(peer.address.slice(0, 6), 'AbCdEf');
  assert.equal(contactSearchMatches('Álvaro particular', 'alvaro'), true);
});

await test('saved, pending and approved contacts share one row without granting chat consent', () => {
  const peer = {
    accountId: crypto.randomUUID(),
    requester: crypto.randomUUID(),
    ecosystem: 'evm' as const,
    address: '0x' + 'a'.repeat(40),
    name: 'Remote name',
  };
  const contact = {
    version: 1 as const,
    ecosystem: peer.ecosystem,
    address: peer.address,
    alias: 'Private alias',
    accountId: null,
    identity: null,
    directory: null,
    identityRevision: 0,
    removed: false,
  };
  const saved = [{ entity: 'e', contact }];
  const pending = directoryItems({
    saved,
    approved: [],
    outgoing: [peer],
    query: '',
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.kind, 'outgoing');
  assert.equal(pending[0]?.saved?.contact.alias, 'Private alias');
  assert.equal(
    directoryItems({ saved, approved: [peer], outgoing: [peer], query: '' })[0]
      ?.kind,
    'approved',
  );
  assert.equal(
    directoryItems({ saved, approved: [], outgoing: [], query: '' })[0]?.kind,
    'saved',
  );
  assert.equal(
    directoryItems({
      saved,
      approved: [],
      outgoing: [peer],
      query: 'private alias',
    }).length,
    1,
  );
  assert.equal(
    directoryItems({
      saved: [{ entity: 'e', contact: { ...contact, removed: true } }],
      approved: [],
      outgoing: [],
      query: '',
    }).length,
    0,
  );
});

await test('automatic snapshots return fresh incoming requests and retain unchanged pagination', async (t) => {
  const contacts = new Contacts({
    withVault: () =>
      Promise.reject(new Error('No remote authority in this test.')),
    withLocalVault: () =>
      Promise.reject(new Error('No local authority in this test.')),
  });
  contacts.setSession({
    accountId: crypto.randomUUID(),
    csrf: 'c',
  } as AccountSession);
  contacts.state.revision = 4;
  const peer = {
    accountId: crypto.randomUUID(),
    requester: crypto.randomUUID(),
    ecosystem: 'evm',
    address: '0x' + 'a'.repeat(40),
    name: 'Peer',
  };
  const current = { items: [], blocks: [], next: null };
  contacts.pages.set('approved', current);
  let revision = 4;
  t.mock.method(contacts, 'api', () =>
    Promise.resolve({
      state: { revision, mode: 'invite', inviteHash: null },
      lists: {
        incoming: { items: [peer], next: null },
        outgoing: { items: [], next: null },
        approved: { items: [peer], next: null },
        blocked: { items: [], next: null },
        rejected: { items: [], next: null },
      },
    }),
  );
  assert.equal(
    (await contacts.snapshot({ preservePages: true })).items.length,
    1,
  );
  assert.equal(contacts.pages.get('approved'), current);
  revision++;
  await contacts.snapshot({ preservePages: true });
  assert.equal(contacts.pages.get('approved')?.items.length, 1);
});
