import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bindSettingsSections,
  saveSettingsSection,
  savedSettingsSection,
  startSettingsCategories,
} from '../src/client/app/pages.ts';

await test('categorias abrem uma por vez e notificam o fechamento de aparelhos', () => {
  const account = Object.assign(new EventTarget(), {
    open: true,
    dataset: { settingsSection: 'account' },
  });
  const devices = Object.assign(new EventTarget(), {
    open: false,
    dataset: { settingsSection: 'devices' },
  });
  const app = Object.assign(new EventTarget(), {
    open: false,
    dataset: { settingsSection: 'app' },
  });
  const sections = [account, devices, app];
  const host = { querySelectorAll: () => sections } as unknown as HTMLElement;
  const closed: string[] = [];
  bindSettingsSections(host, (id) => closed.push(id));
  devices.open = true;
  devices.dispatchEvent(new Event('toggle'));
  assert.equal(account.open, false);
  assert.equal(devices.open, true);
  app.open = true;
  app.dispatchEvent(new Event('toggle'));
  assert.equal(devices.open, false);
  devices.dispatchEvent(new Event('toggle'));
  assert.deepEqual(closed, ['devices']);
  assert.equal(app.open, true);
});

await test('category toggles update their own URL without redirecting split pages or detached settings', () => {
  const section = Object.assign(new EventTarget(), {
    open: false,
    isConnected: true,
    dataset: { settingsSection: 'privacy' },
    querySelector: () => null,
  });
  const host = {
    querySelectorAll: () => [],
    querySelector: () => null,
  } as unknown as HTMLElement;
  const location = {
    hash: '',
    pathname: '/settings/account',
    search: '?layout=feed',
  };
  const storage = new Map<string, string>();
  const globals = {
    document: { createElement: () => ({ setAttribute: () => {} }) },
    location,
    window: new EventTarget(),
    history: {
      pushState: (_state: unknown, _title: string, href: string) => {
        const url = new URL(href, 'http://local.invalid');
        Object.assign(location, {
          hash: url.hash,
          pathname: url.pathname,
          search: url.search,
        });
      },
    },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    matchMedia: () => ({ matches: false }),
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  try {
    startSettingsCategories(host, [section as unknown as HTMLDetailsElement]);
    section.open = true;
    section.dispatchEvent(new Event('toggle'));
    assert.equal(location.pathname, '/settings/privacy');
    location.hash = '#split?layout=feed&profile=synthetic_user';
    section.dispatchEvent(new Event('toggle'));
    assert.equal(location.hash, '#split?layout=feed&profile=synthetic_user');
    location.hash = '#settings?section=devices';
    section.isConnected = false;
    section.dispatchEvent(new Event('toggle'));
    assert.equal(location.hash, '#settings?section=devices');
  } finally {
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
  }
});

await test('on phones the plain Profile tab shows the category list instead of the last category', () => {
  const section = Object.assign(new EventTarget(), {
    open: false,
    isConnected: true,
    dataset: { settingsSection: 'vault' },
    querySelector: () => null,
  });
  const host = {
    querySelectorAll: () => [],
    querySelector: () => null,
  } as unknown as HTMLElement;
  const globals = {
    document: { createElement: () => ({ setAttribute: () => {} }) },
    location: { hash: '#settings' },
    localStorage: { getItem: () => 'vault', setItem: () => {} },
    matchMedia: () => ({ matches: false }),
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  try {
    startSettingsCategories(host, [section as unknown as HTMLDetailsElement]);
    assert.equal(section.open, false);
    globals.location.hash = '#settings?section=vault';
    startSettingsCategories(host, [section as unknown as HTMLDetailsElement]);
    assert.equal(section.open, true);
  } finally {
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
  }
});

await test('última categoria aberta volta após recarregar; sem armazenamento nada quebra', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  assert.equal(savedSettingsSection(storage), null);
  saveSettingsSection(storage, 'devices');
  assert.equal(savedSettingsSection(storage), 'devices');
  const blocked = {
    getItem: () => {
      throw new Error('bloqueado');
    },
    setItem: () => {
      throw new Error('bloqueado');
    },
  };
  assert.doesNotThrow(() => saveSettingsSection(blocked, 'app'));
  assert.equal(savedSettingsSection(blocked), null);
});
