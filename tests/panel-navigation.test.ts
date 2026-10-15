import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startPanels } from '../src/client/app/panels.ts';

await test('private conversations keep mobile/tablet chat URLs; public empty DMs survive routing', () => {
  for (const width of [390, 900, 1440]) checkNavigation(width);
});

function checkNavigation(width: number): void {
  const location = { hash: '#chats' };
  const shell = {
    dataset: {} as Record<string, string>,
    querySelectorAll: () => [],
  };
  const container = { replaceChildren: () => {} } as unknown as HTMLElement;
  const opened: (string | null)[] = [];
  let closed = 0;
  let chatShown = 0;
  const globals = {
    document: { addEventListener: () => {} },
    location,
    history: {
      replaceState: (_state: unknown, _title: string, href: string) => {
        location.hash = href;
      },
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    matchMedia: (query: string) => ({
      matches: query.includes('1280') ? width >= 1280 : width >= 701,
      addEventListener: () => {},
    }),
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  try {
    const panels = startPanels({
      shell: shell as unknown as HTMLElement,
      feedBody: container,
      publicChat: container,
      publicDirectory: container,
      communities: {
        mountFeed: () => {},
        leaveFeed: () => {},
        openDm: (_host, id) => {
          opened.push(id);
        },
        closeDm: () => {
          closed++;
        },
        dmDirectory: () => Promise.resolve(),
        showProfile: () => () => {},
      },
      publicChatOpened: () => {
        chatShown++;
      },
    });
    panels.routed('conversas');
    if (width < 1280) assert.equal(location.hash, '#chats');
    panels.privateChatOpened();
    if (width < 1280) assert.equal(location.hash, '#chats');
    else assert.match(location.hash, /^#split\?/u);
    if (width < 701) return;
    location.hash = '#split?layout=split&dm=';
    panels.routed('conversas');
    panels.routed('conversas');
    assert.deepEqual(opened, [null]);
    assert.equal(chatShown, 1);
    assert.equal(closed, 0);
    assert.equal(shell.dataset['chatScope'], 'public');
    panels.privateChatOpened();
    panels.routed('conversas');
    assert.equal(closed, 1);
    assert.equal(shell.dataset['chatScope'], 'private');
    assert.equal(
      new URLSearchParams(location.hash.split('?')[1]).has('dm'),
      false,
    );
  } finally {
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
  }
}
