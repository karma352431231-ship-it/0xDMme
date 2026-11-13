import type { IdentityPreparation } from '../src/client/peer-identity/index.ts';
import { Recording } from '../src/tools/chat-diagnostics/recording.ts';
import { observeReuseDecisions } from '../src/tools/chat-diagnostics/reuse.ts';
import { installChatSyncDiagnostics } from '../src/client/chat-sync-diagnostics/index.ts';
import { AuthorityWork } from '../src/client/devices/authority-work.ts';
import { waitForBoundary } from './fixtures/deferred.ts';
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
import { GroupCatalog } from '../src/client/groups/catalog.ts';
import type { CatalogGroup } from '../src/client/groups/catalog.ts';
import { GroupGovernance } from '../src/client/groups/governance.ts';
import {
  readPreparedGroupDirectory,
  readGroupDirectory,
} from '../src/client/groups/directory-refresh.ts';
import type { GroupContext } from '../src/client/groups/authority.ts';
import { groupEventHash } from '../src/shared/groups/index.ts';
import { PeerIdentity } from '../src/client/peer-identity/index.ts';
import type { MessageCrypto } from '../src/client/message-crypto/index.ts';
import { deferred } from './fixtures/deferred.ts';
import type { AddressBookEntry } from '../src/shared/contacts/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
  VaultWorkOptions,
} from '../src/client/vault-authority/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import { fixtureGroupPhoto } from './fixtures/group-photo.ts';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';
import { setActiveLanguage, t as translate } from '../src/shared/i18n/index.ts';

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

function directoryReadFixture(t: TestContext) {
  const raw = { ...group().state, signature: 'A'.repeat(86) + '==' };
  const authority: VaultAuthority = {
    session: {
      accountId: raw.actor,
      deviceId: raw.deviceId,
      csrf: 'synthetic',
    },
    directory: raw.directory,
    offline: false,
    epoch: 1,
    events: [],
    key: () =>
      Promise.reject(new Error('No encrypted records in this IO fixture')),
    sign: () =>
      Promise.reject(new Error('No signed network in this IO fixture')),
  };
  const access: VaultAccess = {
    withVault: (_offline, work) => work(authority),
    withLocalVault: () => Promise.reject(new Error('No offline reads')),
  };
  const identities = new PeerIdentity(new VaultSync(access));
  const governance = new GroupGovernance(
    identities,
    () => Promise.reject(new Error('Unexpected governance IO')),
    authority,
  );
  let page: unknown = { items: [raw], next: null };
  const calls: string[] = [],
    saved: string[] = [];
  t.mock.method(governance, 'verify', async () => ({
    state: raw,
    head: await groupEventHash(raw),
  }));
  t.mock.method(GroupCache.prototype, 'get', () =>
    Promise.resolve({
      version: 1,
      title: 'Synthetic verified group',
      sequence: 1,
      epoch: 1,
    }),
  );
  t.mock.method(GroupCatalog.prototype, 'save', (value: CatalogGroup) => {
    saved.push(value.state.groupId);
    return Promise.resolve();
  });
  const input = {
    identities,
    after: null,
    machine: <T>(
      _context: GroupContext,
      work: (machine: MessageCrypto) => Promise<T>,
    ) =>
      _context.authority === authority
        ? work({} as MessageCrypto)
        : Promise.reject(new Error('Wrong authority')),
    authority: <T>(work: (context: GroupContext) => Promise<T>) =>
      work(input.context),
    context: {
      authority,
      governance,
      api: (operation: string) => {
        calls.push(operation);
        if (operation === 'group-mode')
          return Promise.resolve({ mode: 'configured' });
        if (operation === 'group-list') return Promise.resolve(page);
        if (operation === 'group-profile')
          return Promise.resolve({ items: [], keys: [] });
        return Promise.reject(
          new Error('Unrelated maintenance must not gate directory rows'),
        );
      },
    },
  };
  return {
    input,
    calls,
    saved,
    raw,
    access,
    page: (value: unknown) => {
      page = value;
    },
  };
}

await test('bounded current group summaries verify governance/head and profile without outbox or invitations', async (t) => {
  const f = directoryReadFixture(t);
  const result = await readGroupDirectory(f.input);
  assert.equal(result.entries[0]?.title, 'Synthetic verified group');
  assert.equal(result.entries[0]?.localOnly, undefined);
  assert.deepEqual(f.saved, [f.raw.groupId]);
  assert.deepEqual(f.calls, ['group-mode', 'group-list', 'group-profile']);
});

await test('empty group pages are verified without opening an SDK store', async (t) => {
  const f = directoryReadFixture(t);
  f.page({ items: [], next: null });
  f.input.machine = () =>
    Promise.reject(new Error('An empty directory needs no SDK'));
  assert.deepEqual(await readGroupDirectory(f.input), {
    entries: [],
    next: null,
  });
});

await test('changed group heads and failed profiles cannot publish cached summaries as current', async (t) => {
  const f = directoryReadFixture(t);
  t.mock.method(f.input.context.governance, 'verify', () =>
    Promise.resolve({ state: f.raw, head: 'b'.repeat(64) }),
  );
  await assert.rejects(readGroupDirectory(f.input), /group list changed/u);
  assert.deepEqual(f.saved, []);
  t.mock.method(f.input.context.governance, 'verify', async () => ({
    state: f.raw,
    head: await groupEventHash(f.raw),
  }));
  const api = f.input.context.api;
  f.input.context.api = (operation) =>
    operation === 'group-profile'
      ? Promise.reject(new Error('Synthetic profile denied'))
      : api(operation);
  await assert.rejects(readGroupDirectory(f.input), /profile denied/u);
  assert.deepEqual(f.saved, []);
});

await test('oversized pages and invalid cursors reject before any summary is opened', async (t) => {
  const f = directoryReadFixture(t);
  for (const page of [
    { items: Array.from({ length: 17 }, () => f.raw), next: null },
    { items: [f.raw], next: 'invalid' },
  ]) {
    f.page(page);
    await assert.rejects(readGroupDirectory(f.input));
  }
  assert.deepEqual(f.saved, []);
});

await test('online group startup reads the bounded catalog without rebuilding it from saved history', async (t) => {
  const f = directoryReadFixture(t);
  t.mock.method(PeerIdentity.prototype, 'load', () => Promise.resolve());
  t.mock.method(GroupCatalog.prototype, 'creation', () =>
    Promise.resolve(null),
  );
  const next = crypto.randomUUID();
  t.mock.method(GroupCatalog.prototype, 'page', () =>
    Promise.resolve({
      items: [{ state: f.raw, title: 'Synthetic local copy' }],
      next,
    }),
  );
  t.mock.method(f.input.context.authority, 'sign', () =>
    Promise.resolve('synthetic'),
  );
  t.mock.method(globalThis, 'fetch', (path: string) => {
    const operation = path.split('/').at(-1);
    if (operation === 'group-mode')
      return Promise.resolve(Response.json({ mode: 'configured' }));
    if (operation === 'group-list')
      return Promise.resolve(Response.json({ items: [], next: null }));
    throw new Error('Unexpected network request');
  });
  const controller = new GroupController(
    f.access,
    new VaultSync(f.access),
    () => false,
  );
  controller.setSession(f.input.context.authority.session as AccountSession);
  await controller.refreshDirectory();
  assert.deepEqual(
    controller.entries.map((entry) => [entry.title, entry.localOnly]),
    [['Synthetic local copy', true]],
  );
  assert.equal(controller.next, next);
});

await test('logout while group identities load cannot publish rows into the next session', async (t) => {
  const f = directoryReadFixture(t),
    held = deferred<void>();
  t.mock.method(PeerIdentity.prototype, 'load', () => held.promise);
  const controller = new GroupController(
    f.access,
    new VaultSync(f.access),
    () => false,
  );
  controller.setSession(f.input.context.authority.session as AccountSession);
  const read = controller.refreshDirectory();
  controller.setSession(null);
  held.resolve();
  await assert.rejects(read);
  assert.deepEqual(controller.entries, []);
});
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
    const groupFilter = new CommunityNode('button');
    let unread = 0;
    let selected: GroupSummary | null = current,
      entries: readonly ConversationEntry[] = [];
    const options = {
      snapshot: () => ({
        peers: [peer],
        selected: peer,
        states: new Map([[peer.accountId, { unread: 2 }]]),
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
        preview: () => undefined,
        reveal: () => Promise.resolve(),
        get selected() {
          return selected;
        },
        listLabel: () => current.title + ' · group',
        unread: () => 3,
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
            : selector === '[data-conversation-filter="groups"]'
              ? groupFilter
              : null,
      host: () => null,
      contactActions: () => [],
      perform: () => {},
      openPeer: () => {},
      openContact: (contact: AddressBookEntry) => edited.push(contact),
      openGroup: () => {},
      changed: () => {},
      unreadChanged: (count: number) => {
        unread = count;
      },
      presence: () => {},
    } as unknown as ConstructorParameters<typeof MessageDirectoryUi>[0];
    const ui = new MessageDirectoryUi(options);
    ui.bind();
    headerEdit.click();
    assert.equal(edited.length, 0);
    ui.renderContacts();
    await settle();
    assert.equal(unread, 5);
    groupFilter.click();
    assert.equal(
      unread,
      5,
      'hiding contact rows must not hide their unread notification',
    );
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
      alias: () => '',
      addContact: () => undefined,
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
  await assert.rejects(pending, /[Ss]ession changed/u);
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

for (const language of ['en', 'zh-CN'] as const)
  await test(`group preparation shows loading only before its first verified window in ${language}`, async (t) => {
    dom(t);
    setActiveLanguage(language);
    const current = group(),
      notice = new CommunityNode(),
      history = new CommunityNode(),
      host = Object.assign(new CommunityNode(), { insertAdjacentHTML() {} }),
      aside = new CommunityNode();
    const nodes = new Map([
      ['[data-group-notice]', notice],
      ['[data-group-history]', history],
    ]);
    t.mock.method(
      host,
      'querySelector',
      (selector: string) => nodes.get(selector) ?? null,
    );
    let pending = true;
    t.mock.method(
      GroupController.prototype,
      'open',
      function (this: GroupController) {
        this.selected = current;
        // Selection can be set before the first page settles. An unrelated
        // status paint is not evidence that an empty window was verified.
        this.historyPending = false;
        ui.status();
        this.historyPending = pending;
        return Promise.resolve();
      },
    );
    const access = {} as VaultAccess;
    const options = {
      run: (work: () => Promise<void>) => work(),
      history: async (
        work: () => Promise<void>,
        settled?: () => Promise<void>,
      ) => {
        await work();
        if (!pending) await settled?.();
        return !pending;
      },
      changed: () => {},
      select: () => {},
      isBusy: () => false,
      alert: () => {},
      peers: () => [],
      alias: () => '',
      addContact: () => undefined,
      profile: () => Promise.resolve(null),
    } as unknown as Parameters<typeof startGroups>[2];
    const ui = startGroups(access, new VaultSync(access), options);
    ui.mount(host as unknown as HTMLElement, aside as unknown as HTMLElement);
    await ui.open(current);
    assert.equal(notice.textContent, translate('Syncing…'));
    assert.equal(history.hidden, true);
    pending = false;
    await ui.open(current);
    assert.equal(notice.textContent, '');
    assert.equal(history.hidden, false);
    pending = true;
    await ui.open(current);
    assert.equal(notice.textContent, '');
    assert.equal(
      history.hidden,
      true,
      'Unconfirmed group history stays hidden without repeated sync copy',
    );
    ui.leave();
  });

for (const reuse of [false, true])
  await test(`actual group-directory wiring links identities, admission and group-list dispatch: reuse=${reuse}`, async (t) => {
    const f = directoryReadFixture(t),
      held = deferred<void>(),
      started = deferred<void>();
    let now = 7060,
      signed = 0,
      blocked = false;
    t.mock.method(performance, 'now', () => now);
    const previousWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      'window',
    );
    const host = new EventTarget();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: host,
    });
    installChatSyncDiagnostics(host as Window);
    const recording = new Recording(),
      stop = observeReuseDecisions(recording.record);
    t.after(() => {
      stop();
      held.resolve();
      if (previousWindow)
        Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    });
    const queue = new AuthorityWork(async (key, body) => {
      assert.equal(key, 'synthetic-resource');
      await body();
    });
    let blocker: Promise<void> | undefined;
    const access: VaultAccess = {
      withLocalVault: () => Promise.reject(new Error('No offline work')),
      withVault: <T>(
        _offline: boolean,
        work: (authority: VaultAuthority) => Promise<T>,
        options: VaultWorkOptions = {},
      ) => {
        if (options.diagnosticOperation === 'group-directory' && !blocked) {
          blocked = true;
          blocker = queue.hold(
            'synthetic-resource',
            () => {
              started.resolve();
              return held.promise;
            },
            undefined,
            { diagnosticOperation: 'conversation-previews' },
          );
        }
        return queue.hold(
          'synthetic-resource',
          () => {
            if (options.diagnosticOperation === 'group-directory') now += 380;
            return work(f.input.context.authority);
          },
          options.priority,
          options,
        );
      },
    };
    t.mock.method(PeerIdentity.prototype, 'load', (options: VaultWorkOptions) =>
      access.withVault(
        false,
        () => {
          now += 700;
          return Promise.resolve();
        },
        options,
      ),
    );
    t.mock.method(GroupCatalog.prototype, 'creation', () =>
      Promise.resolve(null),
    );
    t.mock.method(GroupCatalog.prototype, 'page', () =>
      Promise.resolve({ items: [], next: null }),
    );
    t.mock.method(f.input.context.authority, 'sign', () => {
      now += ++signed === 1 ? 50 : 100;
      return Promise.resolve('synthetic-private-signature');
    });
    t.mock.method(globalThis, 'fetch', (path: string, options: RequestInit) => {
      assert.ok(typeof options.body === 'string');
      assert.doesNotMatch(
        options.body,
        /diagnosticLoad|loadClockMs|authorityQueue|workClockMs/u,
      );
      if (path.endsWith('/group-mode')) {
        now += 150;
        return Promise.resolve(Response.json({ mode: 'configured' }));
      }
      assert.ok(path.endsWith('/group-list'));
      return Promise.resolve(Response.json({ items: [], next: null }));
    });
    const controller = new GroupController(
      access,
      new VaultSync(access),
      () => false,
    );
    controller.setSession(f.input.context.authority.session as AccountSession);
    const preparation = reuse
      ? {
          hydrate: () => {
            now += 140;
            return Promise.resolve(true);
          },
          confirm: () => Promise.resolve(true),
          dispose: () => {},
        }
      : undefined;
    const loading = controller.refreshDirectory(false, preparation);
    await waitForBoundary(started.promise);
    now += 1170;
    held.resolve();
    await loading;
    await blocker;
    const summary = recording
      .report()
      .loading.operations.find(
        (operation) => operation.kind === 'group-directory',
      );
    assert.ok(summary?.preList?.available);
    assert.equal(summary.preList.firstGroupListSentMs, reuse ? 1990 : 2550);
    assert.equal(summary.preList.accounting.queueMs, 1170);
    assert.equal(summary.preList.accounting.executionMs, reuse ? 820 : 1380);
    assert.equal(summary.preList.accounting.unattributedMs, 0);
    assert.equal(summary.preList.durationsMs.vaultAuthorization, 380);
    assert.equal(summary.preList.durationsMs.groupMode, 200);
    assert.equal(summary.preList.durationsMs.groupListPreparation, 100);
    assert.ok(
      summary.preList.work.some((work) =>
        work.blockers.some(
          (blocker) =>
            blocker.category === 'conversation-previews' &&
            blocker.elapsedMs === 1170,
        ),
      ),
    );
    assert.equal(summary.preList.durationsMs.identities, reuse ? 140 : 700);
    assert.equal(
      summary.preList.work.filter(
        (work) => work.category === 'group-identities',
      ).length,
      reuse ? 0 : 1,
    );
    const exported = JSON.stringify(recording.report());
    assert.ok(!exported.includes(f.raw.groupId));
    assert.ok(!exported.includes(f.raw.actor));
    assert.ok(!exported.includes('synthetic-private-signature'));
  });

for (const evidence of ['valid', 'stale', 'revoked'] as const)
  await test(`group directory ${evidence} startup evidence preserves verification and full fallback`, async (t) => {
    const f = directoryReadFixture(t);
    let loaded = 0,
      hydrated = 0,
      confirmed = 0,
      disposed = 0;
    t.mock.method(f.input.identities, 'load', () => {
      loaded++;
      return Promise.resolve();
    });
    const preparation: IdentityPreparation = {
      hydrate: (target, authority) => {
        assert.equal(target, f.input.identities);
        assert.equal(authority, f.input.context.authority);
        assert.equal(
          f.calls.length,
          0,
          'No group request precedes identity validation',
        );
        hydrated++;
        if (evidence === 'revoked') return Promise.reject(new Error('Revoked'));
        return Promise.resolve(evidence === 'valid');
      },
      confirm: () => {
        confirmed++;
        return Promise.resolve(true);
      },
      dispose: () => {
        disposed++;
      },
    };
    const loading = readPreparedGroupDirectory({ ...f.input, preparation }, {});
    if (evidence === 'revoked') {
      await assert.rejects(loading, /Revoked/u);
      assert.equal(loaded, 0);
      assert.deepEqual(f.calls, []);
    } else {
      const result = await loading;
      assert.equal(result.entries[0]?.state.groupId, f.raw.groupId);
      assert.equal(loaded, evidence === 'valid' ? 0 : 1);
      assert.equal(confirmed, evidence === 'valid' ? 1 : 0);
      assert.deepEqual(f.calls, ['group-mode', 'group-list', 'group-profile']);
    }
    assert.equal(hydrated, 1);
    assert.equal(disposed, 1);
  });

await test('a removal before startup publication rejects the entire verified group page', async (t) => {
  const f = directoryReadFixture(t);
  let published = false,
    disposed = false;
  const preparation: IdentityPreparation = {
    hydrate: () => Promise.resolve(true),
    confirm: () => Promise.resolve(false),
    dispose: () => {
      disposed = true;
    },
  };
  await assert.rejects(
    readPreparedGroupDirectory({ ...f.input, preparation }, {}).then(() => {
      published = true;
    }),
    /not synchronized/u,
  );
  assert.equal(published, false);
  assert.equal(disposed, true);
});

await test('reuse retains queued direct preview admission and interactive chat precedence between group turns', async (t) => {
  const f = directoryReadFixture(t);
  const gate = deferred<void>(),
    entered = deferred<void>();
  const queue = new AuthorityWork(async (_key, work) => work());
  const order: string[] = [];
  let turn = 0;
  const input = {
    ...f.input,
    preparation: {
      hydrate: () => Promise.resolve(true),
      confirm: () => Promise.resolve(true),
      dispose: () => {},
    },
    authority: <T>(work: (context: GroupContext) => Promise<T>) =>
      queue.hold('synthetic', async () => {
        order.push('group-' + ++turn);
        if (turn === 1) {
          entered.resolve();
          await gate.promise;
        }
        return work(f.input.context);
      }),
  };
  const loading = readPreparedGroupDirectory(input, {});
  await entered.promise;
  const preview = queue.hold('synthetic', () => {
    order.push('preview');
    return Promise.resolve();
  });
  const chat = queue.hold(
    'synthetic',
    () => {
      order.push('chat');
      return Promise.resolve();
    },
    'interactive',
  );
  gate.resolve();
  await Promise.all([loading, preview, chat]);
  assert.deepEqual(order, ['group-1', 'chat', 'preview', 'group-2']);
});

await test('a changed directory generation during full fallback cannot query the next account', async (t) => {
  const f = directoryReadFixture(t);
  let current = true;
  t.mock.method(f.input.identities, 'load', () => {
    current = false;
    return Promise.resolve();
  });
  const preparation: IdentityPreparation = {
    hydrate: () => Promise.resolve(false),
    confirm: () => Promise.resolve(true),
    dispose: () => {},
  };
  await assert.rejects(
    readPreparedGroupDirectory(
      {
        ...f.input,
        preparation,
        guard: () => {
          if (!current) throw new Error('Session changed');
        },
      },
      {},
    ),
    /Session changed/u,
  );
  assert.deepEqual(f.calls, []);
});
