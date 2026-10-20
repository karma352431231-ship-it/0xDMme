import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { ContactSettings } from '../src/client/contacts/contact-settings.ts';
import { AddressBook } from '../src/client/contacts/agenda.ts';
import type { VaultSync } from '../src/client/vault-sync/index.ts';
import { ChatNode } from './fixtures/chat-dom.ts';

class Dialog extends ChatNode {
  open = false;
  focused = false;
  readonly fields = new Map<string, ChatNode>();
  constructor() {
    super('dialog');
    for (const name of [
      'form',
      '[data-contact-name]',
      '[data-contact-identity]',
      '[data-contact-settings-status]',
      '[data-contact-versions]',
      '[type="submit"]',
      '[data-contact-settings-close]',
    ])
      this.fields.set(name, new ChatNode());
    this.fields.set(
      '[data-contact-alias]',
      Object.assign(new ChatNode(), {
        focus: () => {
          this.focused = true;
        },
      }),
    );
  }
  override querySelector(selector: string): ChatNode | null {
    return this.fields.get(selector) ?? null;
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
}
function fixture(t: TestContext) {
  const dialog = new Dialog(),
    host = Object.assign(new ChatNode(), { isConnected: true });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      activeElement: null,
      createElement: (tag: string) =>
        tag === 'dialog' ? dialog : new ChatNode(tag),
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const book = new AddressBook({} as VaultSync);
  t.mock.method(book, 'versions', () => []);
  const settings = new ContactSettings({
    book,
    sync: { heads: () => [], pending: null },
    run: (work) => work(),
    saved: () => Promise.resolve(),
  });
  settings.mount(host as unknown as HTMLElement);
  const contact = {
    version: 1 as const,
    ecosystem: 'evm' as const,
    address: '0x' + '1'.repeat(40),
    alias: 'Chosen contact',
    accountId: null,
    identity: null,
    directory: null,
    identityRevision: 0,
    removed: false,
  };
  return { settings, dialog, book, contact };
}

await test('the chosen contact opens immediately in a modal and becomes editable after its current version loads', async (t) => {
  const f = fixture(t);
  const opening = f.settings.open(f.contact);
  assert.equal(f.dialog.open, true);
  assert.equal(f.dialog.querySelector('[type="submit"]')!.disabled, true);
  await opening;
  assert.equal(
    f.dialog.querySelector('[data-contact-alias]')!.value,
    'Chosen contact',
  );
  assert.equal(f.dialog.querySelector('[type="submit"]')!.disabled, false);
  assert.equal(f.dialog.focused, true);
});

await test('a failed version read cannot save a fallback, and clearing a pending editor cannot reopen it', async (t) => {
  const f = fixture(t);
  t.mock.method(f.book, 'versions', () => {
    throw new Error('Current version unavailable');
  });
  await f.settings.open(f.contact);
  assert.equal(f.dialog.open, true);
  assert.equal(f.dialog.querySelector('[type="submit"]')!.disabled, true);
  assert.equal(
    f.dialog.querySelector('[data-contact-settings-status]')!.textContent,
    'The operation could not be completed. Please try again.',
  );
  const opening = f.settings.open(f.contact);
  f.settings.clear();
  await opening;
  assert.equal(f.dialog.open, false);
});
