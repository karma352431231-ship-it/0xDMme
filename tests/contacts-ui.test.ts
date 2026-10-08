import assert from 'node:assert/strict';
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
