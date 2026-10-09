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

await test('tema salvo no aparelho volta para Azul quando ausente, inválido ou ilegível', () => {
  const cases: [string | null | Error, string, boolean][] = [
    [null, 'navy', false],
    ['black', 'black', false],
    ['white', 'white', false],
    ['sepia', 'navy', true],
    [new Error('bloqueado'), 'navy', true],
  ];
  for (const [value, theme, warns] of cases) {
    const result = storedTheme(storage(value));
    assert.equal(result.theme, theme);
    assert.equal(result.problem !== '', warns);
  }
});

await test('aplicar o tema marca a raiz e a cor da barra do navegador', () => {
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

await test('componentes usam somente tokens de tema, sem cores literais', async () => {
  const base = new URL('../src/client/', import.meta.url);
  const offenders: string[] = [];
  for (const entry of await readdir(base, { recursive: true })) {
    if (!entry.endsWith('.css')) continue;
    // The isolated crypto lab keeps its own light/dark palette outside the app shell.
    if (entry.includes('crypto-probe')) continue;
    // Theme tokens live in one marked block of app.css; everything else must use them.
    const css = (await readFile(new URL(entry, base), 'utf8'))
      .replace(/\/\* === Theme tokens[\s\S]*?End of theme tokens === \*\//u, '')
      .replace(/\/\*[\s\S]*?\*\//gu, '');
    for (const match of css.matchAll(
      /#[0-9a-f]{3,8}\b|:\s*(?:white|black)\s*;|rgba?\(/giu,
    ))
      offenders.push(`${entry}: ${match[0]}`);
  }
  assert.deepEqual(offenders, []);
});
