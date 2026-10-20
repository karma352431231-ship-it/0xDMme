import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { startMobileConversation } from '../src/client/app/mobile-conversation.ts';
import { navigateApp } from '../src/client/app-navigation/index.ts';

function fixture(t: TestContext, mobile = true, reload = false) {
  const location = { hash: '', pathname: '/chats', search: '' };
  const entries: { address: string; state: unknown }[] = [
    { address: '/communities', state: null },
    { address: '/chats', state: null },
  ];
  let position = 1;
  if (reload)
    entries[position]!.state = {
      conversationOpen: true,
      contactScope: 'private',
    };
  const shell = {
    dataset: { chatOpen: 'false', contactScope: 'private' },
    querySelectorAll: () => [],
  };
  const update = () => {
    const url = new URL(entries[position]!.address, 'https://local.invalid');
    Object.assign(location, {
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    });
  };
  const history = {
    get state() {
      return entries[position]!.state;
    },
    pushState(
      state: unknown,
      _title: string,
      address = entries[position]!.address,
    ) {
      entries.splice(++position, entries.length, { address, state });
      update();
    },
    replaceState(...args: [unknown, string]) {
      entries[position]!.state = args[0];
    },
    back() {
      position--;
      update();
    },
    forward() {
      position++;
      update();
    },
  };
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    location,
    history,
    window: new EventTarget(),
    matchMedia: () => ({ matches: mobile }),
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  t.after(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  let changes = 0;
  const navigation = startMobileConversation({
    shell: shell as unknown as HTMLElement,
    scope: (scope) => {
      shell.dataset.contactScope = scope;
    },
    changed: () => {
      changes++;
    },
  });
  return {
    navigation,
    shell,
    history,
    location,
    entries,
    changes: () => changes,
  };
}

await test('mobile Back returns from a private chat to its directory and Forward restores the chat without exposing its identity', async (t) => {
  const f = fixture(t);
  f.navigation.open();
  f.navigation.restore();
  assert.equal(f.shell.dataset.chatOpen, 'true');
  assert.equal(f.entries.length, 3);
  f.navigation.open();
  assert.equal(f.entries.length, 3);
  assert.deepEqual(f.history.state, {
    conversationOpen: true,
    contactScope: 'private',
  });
  assert.equal(f.location.pathname, '/chats');
  f.history.back();
  f.navigation.restore();
  assert.equal(f.location.pathname, '/chats');
  assert.equal(f.shell.dataset.chatOpen, 'false');
  f.history.forward();
  f.navigation.restore();
  assert.equal(f.shell.dataset.chatOpen, 'true');
  assert.equal(f.navigation.close(), true);
  f.navigation.restore();
  assert.equal(f.shell.dataset.chatOpen, 'false');
  await Promise.resolve();
});

await test('opening from another screen returns to that screen; public directory scope survives public DM navigation', async (t) => {
  const f = fixture(t);
  navigateApp('#contacts');
  f.navigation.open();
  f.navigation.restore();
  f.history.back();
  f.navigation.restore();
  assert.equal(f.location.pathname, '/contacts');
  navigateApp('#chats');
  f.history.replaceState({ contactScope: 'public' }, '');
  navigateApp('#communities?view=dms&dm=synthetic');
  f.history.back();
  f.navigation.restore();
  assert.equal(f.location.pathname, '/chats');
  assert.equal(f.shell.dataset.contactScope, 'public');
  assert.equal(f.shell.dataset.chatOpen, 'false');
  await Promise.resolve();
});

await test('desktop opening and closing do not insert mobile history entries', (t) => {
  const f = fixture(t, false);
  f.navigation.open();
  assert.equal(f.entries.length, 2);
  assert.equal(f.navigation.close(), false);
  assert.equal(f.changes(), 0);
});

await test('a reload without the private selection returns to the directory instead of restoring an empty full-screen chat', (t) => {
  const f = fixture(t, true, true);
  f.navigation.restore();
  assert.equal(f.shell.dataset.chatOpen, 'false');
  assert.equal(f.navigation.close(), false);
});
