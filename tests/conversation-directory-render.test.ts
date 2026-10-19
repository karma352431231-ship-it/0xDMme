import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import {
  clearDirectory,
  renderDirectory,
  renderStatusStrip,
} from '../src/client/messages/directory.ts';
import type { ConversationEntry } from '../src/client/messages/directory.ts';
import {
  currentLanguage,
  setActiveLanguage,
} from '../src/shared/i18n/index.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
import { ConversationMenu } from '../src/client/messages/directory-menu.ts';
import { releaseConversationAvatars } from '../src/client/messages/directory-avatars.ts';

class DirectoryNode extends ChatNode {
  override classList = {
    add: (...names: string[]) => {
      this.className = [
        ...new Set([...this.className.split(' '), ...names]),
      ].join(' ');
    },
    toggle: (name: string, enabled: boolean) => {
      const names = this.className.split(' ').filter((part) => part !== name);
      if (enabled) names.push(name);
      this.className = names.join(' ');
    },
  };
  src = '';
  alt = '';
  title = '';
  href = '';
  isConnected = true;
  style = { setProperty() {} };
  offsetWidth = 240;
  offsetHeight = 200;
  showModal() {}
  close() {}
  focus() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 240, bottom: 100 };
  }
}
function fixture(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const language = currentLanguage();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const body = new DirectoryNode('body');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { innerWidth: 1200, innerHeight: 800 },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      activeElement: null,
      body,
      createElement: (tag: string) => new DirectoryNode(tag),
      createElementNS: (_ns: string, tag: string) => new DirectoryNode(tag),
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
    setActiveLanguage(language);
    if (originalWindow)
      Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const host = new DirectoryNode();
  return { host, element: host as unknown as HTMLElement, body };
}
function entry(overrides: Partial<ConversationEntry> = {}): ConversationEntry {
  return {
    id: 'peer',
    title: 'First',
    detail: 'Wallet',
    kind: 'contact',
    searchText: '',
    selected: false,
    open() {},
    ...overrides,
  };
}

await test('identical maintenance retains rows, images and current click handlers in both languages', (t) => {
  const { host, element } = fixture(t);
  const opened: string[] = [];
  for (const language of ['en', 'zh-CN'] as const) {
    setActiveLanguage(language);
    renderDirectory(element, [entry({ open: () => opened.push('old') })]);
    const row = host.children[0]!;
    const avatar = row.querySelector('.conversation-avatar')!;
    const image = new DirectoryNode('img');
    avatar.replaceChildren(image);
    const replacements = host.replacements;
    renderDirectory(element, [entry({ open: () => opened.push(language) })]);
    assert.equal(host.children[0], row);
    assert.equal(host.querySelector('img'), image);
    assert.equal(host.replacements, replacements);
    row.click();
    assert.equal(opened.at(-1), language);
    clearDirectory(element);
  }
});

await test('preview, unread and selection changes update the existing row without replacing its avatar', (t) => {
  const { host, element } = fixture(t);
  const initial = entry({
    preview: {
      id: 'message',
      sequence: 1,
      text: 'Before',
      own: true,
      read: false,
      delivery: 'accepted',
      sentAt: 1760000000000,
    },
  });
  renderDirectory(element, [initial]);
  const row = host.children[0]!,
    avatar = row.querySelector('.conversation-avatar');
  renderDirectory(element, [
    {
      ...initial,
      selected: true,
      unread: 2,
      preview: {
        ...initial.preview!,
        text: 'After',
        read: true,
        delivery: 'received',
      },
    },
  ]);
  assert.equal(host.children[0], row);
  assert.equal(row.querySelector('.conversation-avatar'), avatar);
  assert.equal(row.getAttribute('aria-pressed'), 'true');
  assert.equal(row.querySelector('.conversation-unread')?.textContent, '2');
  assert.equal(row.querySelector('small')?.textContent.includes('After'), true);
  assert.equal(
    row.querySelector('svg')?.getAttribute('class'),
    'message-checks green',
  );
  renderDirectory(element, [entry({ detail: 'Unavailable' })]);
  assert.equal(host.children[0], row);
  assert.equal(row.querySelector('small')?.textContent, 'Unavailable');
  assert.equal(row.querySelector('time'), null);
  assert.equal(row.querySelector('.conversation-unread'), null);
});

await test('reordering keeps row identity while removal aborts avatar work and clear discards cached rows', (t) => {
  const { host, element } = fixture(t);
  const signals: AbortSignal[] = [];
  const first = entry({ avatar: (_host, signal) => signals.push(signal) });
  const second = entry({ id: 'other', title: 'Other' });
  renderDirectory(element, [first, second]);
  const [a, b] = host.children;
  renderDirectory(element, [second, first]);
  assert.deepEqual(host.children, [b, a]);
  assert.equal(signals[0]?.aborted, false);
  renderDirectory(element, [second]);
  assert.deepEqual(host.children, [b]);
  assert.equal(signals[0]?.aborted, true);
  clearDirectory(element);
  renderDirectory(element, [first]);
  assert.notEqual(host.children[0], a);
  clearDirectory(element);
  assert.equal(signals.at(-1)?.aborted, true);
});

await test('status maintenance retains tiles and reorders, relabels or removes only the affected authors', (t) => {
  const { host, element } = fixture(t);
  const a = entry({ status: true }),
    b = entry({ id: 'other', title: 'Other', status: true });
  renderStatusStrip(element, { ownActive: null, authors: [a, b] });
  const [own, first, second] = host.children;
  renderStatusStrip(element, {
    ownActive: null,
    authors: [{ ...a }, { ...b }],
  });
  assert.deepEqual(host.children, [own, first, second]);
  renderStatusStrip(element, {
    ownActive: 'self',
    authors: [b, { ...a, title: 'Renamed' }],
  });
  assert.deepEqual(host.children, [own, second, first]);
  assert.equal(
    first?.querySelector('.status-tile-name')?.textContent,
    'Renamed',
  );
  renderStatusStrip(element, { ownActive: null, authors: [] });
  assert.deepEqual(host.children, [own]);
});

await test('retained row menus keep their DOM but execute current actions and close on changed choices', (t) => {
  const { host, element, body } = fixture(t);
  const menu = new ConversationMenu();
  const calls: string[] = [];
  const actions = (version: string) => [
    {
      id: 'mute',
      label: 'Mute',
      perform() {},
      choices: [
        { id: 'hour', label: 'One hour', perform: () => calls.push(version) },
      ],
    },
  ];
  const initial = entry({ actions: actions('old') });
  renderDirectory(element, [initial], { menu });
  const row = host.children[0]!,
    trigger = row.querySelector('.conversation-menu-trigger')!;
  const button = row.querySelector('.conversation-row');
  trigger.click();
  const dialog = body.querySelector('dialog')!;
  const list = dialog.querySelector('.conversation-menu-actions')!;
  list.children[0]!.click();
  const choice = list.children[1]!;
  renderDirectory(element, [{ ...initial, actions: actions('current') }], {
    menu,
  });
  assert.equal(host.children[0], row);
  assert.equal(row.querySelector('.conversation-menu-trigger'), trigger);
  assert.equal(body.querySelector('dialog'), dialog);
  assert.equal(list.children[1], choice);
  choice.click();
  assert.deepEqual(calls, ['current']);
  trigger.click();
  assert.ok(body.querySelector('dialog'));
  renderDirectory(
    element,
    [{ ...initial, actions: [{ ...actions('changed')[0]!, choices: [] }] }],
    { menu },
  );
  assert.equal(body.querySelector('dialog'), null);
  renderDirectory(element, [entry()], { menu });
  assert.equal(host.children[0]?.tag, 'button');
  assert.equal(host.children[0], button);
  menu.reset();
});

await test('versioned avatars retain one lifetime, restart after pause and abort on an authority version change', (t) => {
  const { element, host } = fixture(t);
  const signals: AbortSignal[] = [];
  const avatar = (_host: HTMLElement, signal: AbortSignal) => {
    signals.push(signal);
  };
  const initial = entry({ avatar, avatarVersion: 'head:1' });
  renderDirectory(element, [initial]);
  const row = host.children[0];
  renderDirectory(element, [
    { ...initial, avatar: (host, signal) => avatar(host, signal) },
  ]);
  assert.equal(signals.length, 1);
  renderDirectory(element, [{ ...initial, avatarVersion: 'head:2' }]);
  assert.equal(host.children[0], row);
  assert.equal(signals[0]?.aborted, true);
  assert.equal(signals.length, 2);
  releaseConversationAvatars(element);
  renderDirectory(element, [{ ...initial, avatarVersion: 'head:2' }]);
  assert.equal(signals.length, 3);
  assert.equal(signals[1]?.aborted, true);
  clearDirectory(element);
  assert.equal(signals[2]?.aborted, true);
});
