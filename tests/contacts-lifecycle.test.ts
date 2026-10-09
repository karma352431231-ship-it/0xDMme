import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { startContacts, Contacts } from '../src/client/contacts/index.ts';
import { AddressBook } from '../src/client/contacts/agenda.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type { VaultAccess } from '../src/client/vault-authority/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import { invitationLink } from '../src/shared/contacts/index.ts';
import type {
  AddressBookEntry,
  Invitation,
  WalletContact,
} from '../src/shared/contacts/index.ts';

function browserEnvironment(t: TestContext, hash = ''): void {
  const saved = new Map(
    ['window', 'location', 'history'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const online = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: new EventTarget(),
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { hash, origin: 'https://0xdmme.app', pathname: '/' },
  });
  Object.defineProperty(globalThis, 'history', {
    configurable: true,
    value: { replaceState: () => undefined },
  });
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  t.after(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    if (online) Object.defineProperty(navigator, 'onLine', online);
    else Reflect.deleteProperty(navigator, 'onLine');
  });
}

for (const withInvite of [false, true])
  await test(`sessão aberta durante carga local retoma contatos sem remontar e preserva convite=${withInvite}`, async (t) => {
    const invite = { owner: crypto.randomUUID(), token: 'a'.repeat(64) };
    const link = invitationLink('https://0xdmme.app', invite);
    browserEnvironment(t, withInvite ? new URL(link).hash : '');
    const access: VaultAccess = {
      withVault: () =>
        Promise.reject(new Error('Autoridade não usada pela fixture de UI.')),
      withLocalVault: () =>
        Promise.reject(new Error('Autoridade não usada pela fixture de UI.')),
    };
    const sync = new VaultSync(access);
    sync.complete = true;
    let release: () => void = () => undefined;
    const loading = new Promise<void>((resolve) => {
      release = resolve;
    });
    let opened: () => void = () => undefined;
    const loaded = new Promise<void>((resolve) => {
      opened = resolve;
    });
    t.mock.method(sync, 'openLocal', () => loading);
    t.mock.method(sync, 'refresh', () => Promise.resolve());
    t.mock.method(Contacts.prototype, 'snapshot', () => {
      opened();
      return Promise.resolve();
    });
    t.mock.method(Contacts.prototype, 'invite', (value: Invitation) => {
      assert.deepEqual(value, invite);
      return Promise.resolve(null);
    });
    const button = Object.assign(new EventTarget(), { disabled: false });
    const status = { textContent: '' };
    const input = { value: '', focus: () => undefined };
    const inviteForm = Object.assign(new EventTarget(), {
      reset: () => {
        input.value = '';
      },
    });
    const dialog = Object.assign(new EventTarget(), {
      open: false,
      showModal() {
        this.open = true;
      },
      close() {
        if (!this.open) return;
        this.open = false;
        setImmediate(() => dialog.dispatchEvent(new Event('close')));
      },
      querySelector: () => input,
    });
    const container = {
      isConnected: true,
      innerHTML: '',
      querySelector: (selector: string) =>
        selector === '[data-contact-status]'
          ? status
          : selector === '[data-contact-editor]'
            ? dialog
            : selector === '[data-contact-received]'
              ? input
              : selector === '[data-contact-invite-form]'
                ? inviteForm
                : null,
      querySelectorAll: (selector: string) =>
        selector === 'button' ? [button] : [],
    } as unknown as HTMLElement;
    const contacts = startContacts(access, sync);
    contacts.mount(container);
    assert.equal(button.disabled, true);
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
    contacts.setSession(session);
    contacts.ready();
    release();
    await loaded;
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(button.disabled, false);
    assert.match(
      status.textContent,
      withInvite ? /Convite indisponível/u : /Contatos atualizados/u,
    );
    if (withInvite) {
      assert.equal(dialog.open, true);
      assert.equal(input.value, link);
    }
  });

await test('salvar e solicitar por endereço completo identificam EVM/Solana sem seletor de ecossistema', async (t) => {
  browserEnvironment(t);
  const access: VaultAccess = {
    withVault: () =>
      Promise.reject(new Error('Autoridade não usada nesta UI.')),
    withLocalVault: () =>
      Promise.reject(new Error('Autoridade não usada nesta UI.')),
  };
  const sync = new VaultSync(access);
  sync.complete = true;
  t.mock.method(sync, 'openLocal', () => Promise.resolve());
  t.mock.method(sync, 'refresh', () => Promise.resolve());
  t.mock.method(Contacts.prototype, 'snapshot', () => Promise.resolve());
  const discovered: WalletContact[] = [],
    stored: AddressBookEntry[] = [],
    requested: string[] = [];
  const target = crypto.randomUUID();
  t.mock.method(Contacts.prototype, 'discover', (wallet: WalletContact) => {
    discovered.push(wallet);
    return Promise.resolve({ ...wallet, accountId: target, name: 'Contato' });
  });
  t.mock.method(
    Contacts.prototype,
    'request',
    (accountId: string, invite: string | null) => {
      assert.equal(invite, null);
      requested.push(accountId);
      return Promise.resolve();
    },
  );
  t.mock.method(AddressBook.prototype, 'save', (entry: AddressBookEntry) => {
    stored.push(entry);
    return Promise.resolve();
  });
  const address = { value: '' },
    alias = { value: 'Contato particular' },
    status = { textContent: '' };
  const form = Object.assign(new EventTarget(), {
    reset: () => {
      address.value = '';
    },
  });
  const request = Object.assign(new EventTarget(), {
    disabled: false,
    dataset: { contactAction: 'discover' },
  });
  const nodes = new Map<string, unknown>([
    ['[data-book-address]', address],
    ['[data-book-alias]', alias],
    ['[data-book-form]', form],
    ['[data-contact-status]', status],
    ['[data-contact-editor-status]', status],
  ]);
  const container = {
    isConnected: true,
    innerHTML: '',
    querySelector: (selector: string) => nodes.get(selector) ?? null,
    querySelectorAll: (selector: string) =>
      selector === 'button' || selector === '[data-contact-action]'
        ? [request]
        : [],
  } as unknown as HTMLElement;
  const contacts = startContacts(access, sync);
  contacts.mount(container);
  await new Promise<void>((resolve) => setImmediate(resolve));
  for (const wallet of [
    { ecosystem: 'evm', address: '0x' + 'a'.repeat(40) },
    {
      ecosystem: 'solana',
      address: 'So11111111111111111111111111111111111111112',
    },
  ] as const) {
    address.value = ` ${wallet.address} `;
    request.dispatchEvent(new Event('click'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(discovered.at(-1), wallet);
    assert.equal(requested.at(-1), target);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(stored.at(-1)?.ecosystem, wallet.ecosystem);
    assert.equal(stored.at(-1)?.address, wallet.address);
    assert.equal(stored.at(-1)?.alias, alias.value);
  }
  address.value = 'endereço inválido';
  request.dispatchEvent(new Event('click'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.match(status.textContent, /Wallet inválida/u);
  assert.equal(discovered.length, 2);
  assert.equal(requested.length, 2);
  assert.equal(stored.length, 2);
});
