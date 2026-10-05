import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { AddressBook, walletEntity } from '../src/client/contacts/index.ts';
import { ContactDirectory } from '../src/client/messages/contact-directory.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type { VaultEntry } from '../src/client/vault-sync/index.ts';
import type { AddressBookEntry } from '../src/shared/contacts/index.ts';

function contact(number: number): AddressBookEntry {
  return {
    version: 1,
    ecosystem: 'evm',
    address: '0x' + number.toString(16).padStart(40, '0'),
    alias: `Contato ${number}`,
    accountId: null,
    identity: null,
    directory: null,
    identityRevision: 0,
    removed: false,
  };
}
function version(entity: string, sequence: number): VaultEntry {
  return {
    change: {
      version: 1,
      entity,
      kind: 'address-book',
      parents: [],
      label: 'Contato',
    },
    commit: {
      version: 1,
      id: crypto.randomUUID(),
      accountId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      directory: 'a'.repeat(64),
      authorityRevision: 1,
      epoch: 1,
      sequence,
      previous: null,
      block: { hash: 'a'.repeat(64), bytes: 32 },
      manifest: { iv: '', ciphertext: '' },
      signature: '',
    },
  };
}
function fixture(t: TestContext) {
  const heads = new Map<string, VaultEntry[]>(),
    values = new Map<string, string>(),
    reads: string[] = [];
  const sync = new VaultSync({
    withVault: () =>
      Promise.reject(new Error('Não consultar permissões neste teste.')),
    withLocalVault: () =>
      Promise.reject(new Error('Não consultar permissões neste teste.')),
  });
  sync.complete = true;
  t.mock.method(sync, 'currentHeads', () => heads);
  t.mock.method(sync, 'heads', (entity: string) => heads.get(entity) ?? []);
  t.mock.method(sync, 'isRemoved', () => false);
  t.mock.method(sync, 'open', (id: string) => {
    reads.push(id);
    return Promise.resolve(values.get(id)!);
  });
  const save = t.mock.method(
    sync,
    'save',
    (input: { change: VaultEntry['change']; value: string }) => {
      const row = version(input.change.entity, values.size + 1);
      row.change = input.change;
      const prior = heads.get(row.change.entity) ?? [];
      heads.set(row.change.entity, [
        ...prior.filter(
          (head) => !input.change.parents.includes(head.commit.id),
        ),
        row,
      ]);
      sync.entries.set(row.commit.id, row);
      values.set(row.commit.id, input.value);
      return Promise.resolve();
    },
  );
  async function add(value: AddressBookEntry, sequence: number) {
    const row = version(await walletEntity(value), sequence);
    heads.set(row.change.entity, [
      ...(heads.get(row.change.entity) ?? []),
      row,
    ]);
    values.set(row.commit.id, JSON.stringify(value));
    sync.entries.set(row.commit.id, row);
    return row;
  }
  return { sync, heads, values, reads, save, add };
}
await test('salvar mostra wallet sem aprovação; remover escreve somente marcador cifrado e salvar novamente restaura sem criar conflito', async (t) => {
  const f = fixture(t),
    book = new AddressBook(f.sync),
    directory = new ContactDirectory(f.sync),
    value = contact(1);
  await book.save(value, null);
  await directory.saved(value);
  assert.equal(directory.entries[0]?.contact.accountId, null);
  assert.equal(directory.entries[0]?.contact.alias, value.alias);
  const entity = await walletEntity(value),
    prior = f.heads.get(entity)![0]!;
  await directory.remove(value);
  assert.equal(directory.find(value)?.contact.removed, true);
  const removal = f.save.mock.calls.at(-1)?.arguments[0];
  assert.ok(removal);
  assert.deepEqual(removal.change.parents, [prior.commit.id]);
  assert.equal(removal.change.kind, 'address-book');
  const removed = f.heads.get(entity)![0]!;
  await book.save({ ...value, alias: 'Restaurado' }, null);
  assert.deepEqual(f.save.mock.calls.at(-1)?.arguments[0].change.parents, [
    removed.commit.id,
  ]);
  assert.equal(f.heads.get(entity)?.length, 1);
  await directory.load();
  assert.equal(directory.find(value)?.contact.removed, false);
  assert.equal(directory.find(value)?.contact.alias, 'Restaurado');
  // Approval changes neither the wallet's favorite key nor its private alias.
  const peer = {
    ecosystem: value.ecosystem,
    address: value.address,
    accountId: crypto.randomUUID(),
    name: 'Nome público',
  };
  await directory.prepare([peer]);
  assert.equal(directory.id(peer), entity);
  assert.equal(directory.find(peer)?.contact.alias, 'Restaurado');
});
await test('agenda abre 16 contatos por página e remoção concorrente vence até uma escolha explícita', async (t) => {
  const f = fixture(t),
    book = new AddressBook(f.sync);
  for (let number = 1; number <= 17; number++)
    await f.add(contact(number), number);
  const first = await book.page();
  assert.equal(first.items.length, 16);
  assert.equal(f.reads.length, 16);
  const last = await book.page(first.next);
  assert.equal(last.items.length, 1);
  assert.equal(last.next, null);
  assert.equal(new Set(f.reads).size, 17);
  await f.add({ ...contact(17), removed: true }, 18);
  assert.equal((await book.page()).items[0]?.contact.removed, true);
  await assert.rejects(book.page(crypto.randomUUID()), /agenda mudou/);
});
await test('trocar a conta durante abertura não restaura apelidos nem wallets da conta anterior', async (t) => {
  const f = fixture(t);
  await f.add(contact(1), 1);
  let release: (value: string) => void = () => undefined;
  t.mock.method(
    f.sync,
    'open',
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  );
  const directory = new ContactDirectory(f.sync),
    loading = directory.load();
  directory.clear();
  release(JSON.stringify(contact(1)));
  await assert.rejects(loading, /Sessão alterada/);
  assert.deepEqual(directory.entries, []);
  assert.deepEqual(directory.ids, []);
});
await test('troca de conta antes de cifrar a remoção impede escrever o contato na conta nova', async (t) => {
  const f = fixture(t),
    directory = new ContactDirectory(f.sync);
  const removing = directory.remove(contact(1));
  directory.clear();
  await assert.rejects(removing, /Sessão alterada/);
  assert.equal(f.save.mock.callCount(), 0);
});
