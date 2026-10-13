import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  saveLanguageChoice,
  languageFailure,
  applyLanguage,
} from '../src/client/language/index.ts';
import {
  currentLanguage,
  setActiveLanguage,
} from '../src/shared/i18n/index.ts';

await test('device preference prepares the next opening without changing the live language or repeating unchanged writes', async (context) => {
  const names = ['location', 'caches', 'localStorage'] as const;
  const prior = names.map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  context.after(() => {
    names.forEach((name, index) => {
      const descriptor = prior[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  });
  const values = new Map<string, string>();
  const records = new Map<string, Response>();
  let writes = 0;
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: 'https://0xdmme.app' },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writes++;
        values.set(key, value);
      },
    },
  });
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      open: () =>
        Promise.resolve({
          match: (key: string) => Promise.resolve(records.get(key)?.clone()),
          put: (key: string, value: Response) => {
            writes++;
            records.set(key, value);
            return Promise.resolve();
          },
        }),
    },
  });
  setActiveLanguage('en');
  await applyLanguage('zh-CN');
  assert.equal(values.get('0xdmme:language'), 'zh-CN');
  assert.equal(currentLanguage(), 'en');
  assert.equal(writes, 2);
  await applyLanguage('zh-CN');
  assert.equal(writes, 2);
});

await test('a new draft while language is saving defers local application and retains the reason', async () => {
  setActiveLanguage('en');
  let blocked: string | null = null;
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const change = saveLanguageChoice({
    language: 'zh-CN',
    save: () => pending,
    blocked: () => blocked,
  });
  blocked = 'Finish your draft first.';
  finish();
  await assert.rejects(
    change,
    (error: unknown) => languageFailure(error) === blocked,
  );
  assert.equal(currentLanguage(), 'en');
});

await test('aborting initial settings while a language write is pending prevents later device application', async () => {
  const signal = new AbortController();
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const change = saveLanguageChoice({
    language: 'zh-CN',
    save: () => pending,
    blocked: () => null,
    signal: signal.signal,
  });
  signal.abort(new Error('Account changed'));
  finish();
  await assert.rejects(change, /Account changed/u);
  assert.equal(currentLanguage(), 'en');
});
