import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startContacts, Contacts } from '../src/client/contacts/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type { VaultAccess } from '../src/client/vault-authority/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';

await test('sessão aberta durante carga local retoma contatos e libera os controles sem remontar a tela', async (t) => {
  const saved = new Map(
    ['window', 'location'].map((key) => [
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
    value: { hash: '', origin: 'https://0xdmme.app' },
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
  const access: VaultAccess = {
    withVault: () =>
      Promise.reject(new Error('Autoridade não usada pela fixture de UI.')),
    withLocalVault: () =>
      Promise.reject(new Error('Autoridade não usada pela fixture de UI.')),
  };
  const sync = new VaultSync(access);
  sync.complete = true;
  const loading = Promise.withResolvers<void>();
  const loaded = Promise.withResolvers<void>();
  t.mock.method(sync, 'openLocal', () => loading.promise);
  t.mock.method(sync, 'refresh', () => Promise.resolve());
  t.mock.method(Contacts.prototype, 'snapshot', () => {
    loaded.resolve();
    return Promise.resolve();
  });
  const button = Object.assign(new EventTarget(), { disabled: false });
  const status = { textContent: '' };
  const container = {
    isConnected: true,
    innerHTML: '',
    querySelector: (selector: string) =>
      selector === '[data-contact-status]' ? status : null,
    querySelectorAll: (selector: string) =>
      selector === 'button' ? [button] : [],
  } as unknown as HTMLElement;
  const contacts = startContacts(access, sync);
  contacts.mount(container, 'settings');
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
  };
  contacts.setSession(session);
  contacts.ready();
  loading.resolve();
  await loaded.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(button.disabled, false);
  assert.match(status.textContent, /Agenda e permissões atuais conferidas/u);
});
