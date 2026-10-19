import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { MessageDirectoryUi } from '../src/client/messages/directory-ui.ts';
import {
  clearDirectory,
  conversationButton,
} from '../src/client/messages/directory.ts';
import type { ConversationEntry } from '../src/client/messages/directory.ts';
import {
  startGroups,
  showGroupDirectoryPhoto,
} from '../src/client/groups/index.ts';
import { GroupController } from '../src/client/groups/controller.ts';
import type { GroupSummary } from '../src/client/groups/controller.ts';
import { GroupCache } from '../src/client/groups/cache.ts';
import type { AddressBookEntry } from '../src/shared/contacts/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import { fixtureGroupPhoto } from './fixtures/group-photo.ts';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';
import { setActiveLanguage } from '../src/shared/i18n/index.ts';

function group(): GroupSummary {
  const owner = crypto.randomUUID();
  return {
    state: {
      version: 1,
      groupId: crypto.randomUUID(),
      revision: 1,
      epoch: 1,
      previous: null,
      kind: 'create',
      actor: owner,
      deviceId: crypto.randomUUID(),
      directory: 'a'.repeat(64),
      authorityRevision: 1,
      target: null,
      members: [{ accountId: owner, role: 'owner', joined: 1 }],
      owner,
      consent: null,
      signature: 'synthetic',
    },
    title: 'Testing Group',
    head: 'a'.repeat(64),
    profileSequence: 7,
  };
}
function dom(t: TestContext) {
  const globals = { document: communityDocument(), window: new EventTarget() };
  const saved = Object.keys(globals).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => {
    setActiveLanguage('en');
    for (const [key, value] of saved) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const revoked: string[] = [];
  const list = Object.assign(new CommunityNode(), {
    previousElementSibling: { hasAttribute: () => true },
  });
  t.mock.method(URL, 'createObjectURL', () => 'blob:private-group');
  t.mock.method(URL, 'revokeObjectURL', (value: string) => revoked.push(value));
  return { list: list as unknown as HTMLElement, revoked };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function editContactFromMenu(
  entries: readonly ConversationEntry[],
  language: 'en' | 'zh-CN',
): void {
  const contact = entries.find((entry) => entry.kind === 'contact')!;
  assert.equal(contact.menuNote, undefined);
  const action = contact.actions?.find((item) => item.id === 'edit-contact');
  assert.ok(action);
  assert.equal(action.label, language === 'en' ? 'Edit contact' : '编辑联系人');
  action.perform();
  const groupActions =
    entries.find((entry) => entry.kind === 'group')?.actions ?? [];
  assert.ok(!groupActions.some((item) => item.id === 'edit-contact'));
}

await test('directory shows the private group avatar and marks only the opened group, and return to a contact', async (t) => {
  const { list, revoked } = dom(t);
  for (const language of ['en', 'zh-CN'] as const) {
    setActiveLanguage(language);
    const current = group(),
      peer = {
        accountId: crypto.randomUUID(),
        ecosystem: 'evm',
        address: '0x' + '1'.repeat(40),
        name: 'Contact',
      };
    const edited: AddressBookEntry[] = [];
    const headerEdit = new CommunityNode('button');
    let selected: GroupSummary | null = current,
      entries: readonly ConversationEntry[] = [];
    const options = {
      snapshot: () => ({
        peers: [peer],
        selected: peer,
        states: new Map(),
        statusAuthors: new Set(),
        session: null,
      }),
      agenda: { find: () => undefined, id: () => peer.accountId, entries: [] },
      daily: {
        conversation: () => ({}),
        favorite: () => false,
        organizationConflict: () => false,
      },
      groups: {
        entries: [current],
        get selected() {
          return selected;
        },
        listLabel: () => current.title + ' · group',
        unread: () => 0,
        photo: (value: GroupSummary) => {
          assert.equal(value, current);
          return Promise.resolve(fixtureGroupPhoto());
        },
      },
      menu: { update() {}, bind() {} },
      searchPanel: {
        update: (value: readonly ConversationEntry[]) => {
          entries = value;
        },
      },
      node: (selector: string) =>
        selector === '[data-message-contacts]'
          ? list
          : selector === '[data-chat-edit-contact]'
            ? headerEdit
            : null,
      host: () => null,
      contactActions: () => [],
      perform: () => {},
      openPeer: () => {},
      openContact: (contact: AddressBookEntry) => edited.push(contact),
      openGroup: () => {},
      changed: () => {},
      presence: () => {},
    } as unknown as ConstructorParameters<typeof MessageDirectoryUi>[0];
    const ui = new MessageDirectoryUi(options);
    ui.bind();
    headerEdit.click();
    assert.equal(edited.length, 0);
    ui.renderContacts();
    await settle();
    assert.deepEqual(
      entries.filter((entry) => entry.selected).map((entry) => entry.id),
      [current.state.groupId],
    );
    editContactFromMenu(entries, language);
    assert.equal(edited.at(-1)?.address, peer.address);
    assert.equal(list.querySelectorAll('img').length, 1);
    assert.equal(list.querySelector('img')?.src, 'blob:private-group');
    const photo = list.querySelector('img');
    selected = null;
    headerEdit.click();
    assert.equal(edited.length, 2);
    assert.equal(edited.at(-1)?.address, peer.address);
    ui.renderContacts();
    await settle();
    assert.equal(list.querySelector('img'), photo);
    assert.deepEqual(
      entries.filter((entry) => entry.selected).map((entry) => entry.id),
      [peer.accountId],
    );
    ui.pause();
    assert.equal(list.querySelectorAll('img').length, 0);
    clearDirectory(list);
  }
  assert.equal(revoked.length, 2);
});

await test('opening a group publishes the resulting selection to the directory on success and failure', async (t) => {
  dom(t);
  for (const fails of [false, true]) {
    const current = group(),
      updates: (string | null)[] = [];
    t.mock.method(
      GroupController.prototype,
      'open',
      function (this: GroupController) {
        this.selected = fails ? null : current;
        return fails
          ? Promise.reject(new Error('synthetic failure'))
          : Promise.resolve();
      },
    );
    const access = {} as VaultAccess;
    const options = {
      run: (work: () => Promise<void>) => work(),
      changed: () => updates.push(ui.selected?.state.groupId ?? null),
      select: () => {},
      isBusy: () => false,
      alert: () => {},
      peers: () => [],
      profile: () => Promise.resolve(null),
    } as unknown as Parameters<typeof startGroups>[2];
    const ui = startGroups(access, new VaultSync(access), options);
    if (fails) await assert.rejects(ui.open(current), /synthetic failure/u);
    else await ui.open(current);
    assert.deepEqual(updates, [fails ? null : current.state.groupId]);
    ui.leave();
  }
});

await test('directory photo reads only the local private cache for a known group and suppresses bytes after an account switch', async (t) => {
  dom(t);
  const current = group(),
    session = {
      accountId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      csrf: 'a'.repeat(64),
    } as AccountSession;
  const authority: VaultAuthority = {
    session,
    offline: true,
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    key: () =>
      Promise.reject(new Error('No keys needed in this lifecycle test')),
    sign: () =>
      Promise.reject(new Error('No signing needed for a local avatar')),
  };
  let read: () => void = () => {};
  const access: VaultAccess = {
    withVault: (offline, work) => {
      assert.equal(offline, true);
      return work(authority);
    },
    withLocalVault: () => Promise.reject(new Error('not used')),
  };
  const controller = new GroupController(
    access,
    new VaultSync(access),
    () => false,
  );
  controller.setSession(session);
  controller.entries = [current];
  t.mock.method(GroupCache.prototype, 'get', () =>
    Promise.resolve({
      version: 1,
      title: current.title,
      photo: fixtureGroupPhoto(),
    }),
  );
  assert.deepEqual(await controller.photo(current), fixtureGroupPhoto());
  assert.equal(await controller.photo(group()), null);
  t.mock.method(
    GroupCache.prototype,
    'get',
    () =>
      new Promise((resolve) => {
        read = () =>
          resolve({
            version: 1,
            title: current.title,
            photo: fixtureGroupPhoto(),
          });
      }),
  );
  const pending = controller.photo(current);
  controller.setSession(null);
  read();
  await assert.rejects(pending, /Session or group changed/u);
});

await test('replacing rows or closing search aborts late photos and revokes their blob URLs', async (t) => {
  const { list, revoked } = dom(t),
    current = group();
  let finish: (value: ReturnType<typeof fixtureGroupPhoto>) => void = () => {};
  const entry: ConversationEntry = {
    id: current.state.groupId,
    title: current.title,
    detail: 'group',
    kind: 'group',
    searchText: current.title,
    selected: true,
    open: () => {},
    avatar: (host, signal) =>
      showGroupDirectoryPhoto(
        host,
        current,
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
        signal,
      ),
  };
  list.append(conversationButton(entry));
  clearDirectory(list);
  finish(fixtureGroupPhoto());
  await settle();
  assert.equal(list.querySelectorAll('img').length, 0);
  assert.equal(revoked.length, 0);
  list.append(
    conversationButton({
      ...entry,
      avatar: (host, signal) =>
        showGroupDirectoryPhoto(
          host,
          current,
          () => Promise.resolve(fixtureGroupPhoto()),
          signal,
        ),
    }),
  );
  await settle();
  assert.equal(list.querySelectorAll('img').length, 1);
  clearDirectory(list);
  assert.equal(revoked.length, 1);
});

await test('missing or unavailable private photos retain group initials in both languages', async (t) => {
  const { list } = dom(t),
    current = group();
  for (const language of ['en', 'zh-CN'] as const) {
    setActiveLanguage(language);
    for (const fails of [false, true]) {
      list.append(
        conversationButton({
          id: current.state.groupId,
          title: current.title,
          kind: 'group',
          detail: '',
          searchText: current.title,
          selected: false,
          open: () => {},
          avatar: (host, signal) =>
            showGroupDirectoryPhoto(
              host,
              current,
              () =>
                fails
                  ? Promise.reject(new Error('cache unavailable'))
                  : Promise.resolve(null),
              signal,
            ),
        }),
      );
      await settle();
      assert.equal(list.querySelectorAll('img').length, 0);
      assert.equal(list.textContent?.startsWith('TG'), true);
      clearDirectory(list);
    }
  }
});
