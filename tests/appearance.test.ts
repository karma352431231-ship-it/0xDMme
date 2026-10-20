import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import {
  applyTheme,
  storedTheme,
  themePreferenceKey,
} from '../src/client/appearance/index.ts';

function storage(value: string | null | Error) {
  return {
    getItem: (key: string) => {
      assert.equal(key, themePreferenceKey);
      if (value instanceof Error) throw value;
      return value;
    },
    setItem: () => {},
  };
}

await test('missing, invalid or unreadable device theme falls back to Black', () => {
  const cases: [string | null | Error, string, boolean][] = [
    [null, 'black', false],
    ['black', 'black', false],
    ['navy', 'navy', false],
    ['white', 'white', false],
    ['sepia', 'black', true],
    [new Error('bloqueado'), 'black', true],
  ];
  for (const [value, theme, warns] of cases) {
    const result = storedTheme(storage(value));
    assert.equal(result.theme, theme);
    assert.equal(result.problem !== '', warns);
  }
});

await test('applying the theme marks the root and browser bar color', () => {
  const meta = {
    content: '',
    setAttribute: (_: string, v: string) => void (meta.content = v),
  };
  const root = {
    documentElement: { dataset: {} as Record<string, string> },
    querySelector: () => meta,
  } as unknown as Document;
  applyTheme('white', root);
  assert.equal(root.documentElement.dataset['theme'], 'white');
  assert.equal(meta.content, '#f4f6fb');
});

function literalColors(source: string): string[] {
  // Selectors such as #feed-panel are identifiers, even when they start with hex digits.
  const css = source
    .replace(/\/\* === Theme tokens[\s\S]*?End of theme tokens === \*\//u, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '');
  return [
    ...css.matchAll(/(?<=[{;])\s*[\w-]+\s*:\s*([^;{}]*)(?=;|\})/gu),
  ].flatMap((declaration) =>
    [
      ...declaration[1]!.matchAll(
        /#[0-9a-f]{3,8}\b|\b(?:white|black)\b|rgba?\(/giu,
      ),
    ].map((match) => match[0]),
  );
}

await test('color check distinguishes selectors from values and inspects nested rules', () => {
  assert.deepEqual(
    literalColors(
      '#feed-panel, #fff { color: var(--text); background: transparent; }',
    ),
    [],
  );
  assert.deepEqual(
    literalColors(
      '@media (width < 600px) { #feed-panel { color: #fff; background: linear-gradient(#123456, rgba(0, 0, 0, .5)); border: 1px solid black; } }',
    ),
    ['#fff', '#123456', 'rgba(', 'black'],
  );
});

await test('components use only theme tokens without literal colors', async () => {
  const base = new URL('../src/client/', import.meta.url);
  const offenders: string[] = [];
  for (const entry of await readdir(base, { recursive: true })) {
    if (!entry.endsWith('.css')) continue;
    // The isolated crypto lab keeps its own light/dark palette outside the app shell.
    if (entry.includes('crypto-probe')) continue;
    // Theme tokens live in one marked block of app/theme.css; everything else must use them.
    for (const color of literalColors(
      await readFile(new URL(entry, base), 'utf8'),
    ))
      offenders.push(`${entry}: ${color}`);
  }
  assert.deepEqual(offenders, []);
});
