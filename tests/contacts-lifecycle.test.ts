import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startContacts, Contacts } from '../src/client/contacts/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type { VaultAccess } from '../src/client/vault-authority/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import { invitationLink } from '../src/shared/contacts/index.ts';
import type { Invitation } from '../src/shared/contacts/index.ts';

for (const withInvite of [false, true])
  await test(`sessão aberta durante carga local retoma contatos sem remontar e preserva convite=${withInvite}`, async (t) => {
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
    const invite = { owner: crypto.randomUUID(), token: 'a'.repeat(64) };
    const link = invitationLink('https://0xdmme.app', invite);
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: {
        hash: withInvite ? new URL(link).hash : '',
        origin: 'https://0xdmme.app',
        pathname: '/',
      },
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
