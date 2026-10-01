import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import type {
  browserReturnUrl,
  attemptBrowserReturn,
} from '../src/client/account/browser-return.ts';

const bundle = await build({
  entryPoints: ['src/client/account/browser-return.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'Return',
  write: false,
});
const source = bundle.outputFiles[0]?.text;
if (!source) throw new Error('Bundle ausente.');

function scope(userAgent: string, rejected = false) {
  const navigated: string[] = [];
  const api = runInNewContext(`${source}\nReturn;`, {
    URL,
    navigator: { userAgent },
    location: {
      origin: 'https://0xdmme.app',
      assign: (url: string) => {
        if (rejected) throw new Error('Blocked');
        navigated.push(url);
      },
    },
  }) as {
    browserReturnUrl: typeof browserReturnUrl;
    attemptBrowserReturn: typeof attemptBrowserReturn;
  };
  return { api, navigated };
}

await test('retorno Android limita destino ao site próprio, usa navegador padrão e preserva link quando bloqueado', () => {
  const { api, navigated } = scope('Android');
  const link = api.browserReturnUrl();
  assert.match(link, /^intent:\/\/0xdmme\.app\/#configuracoes#Intent;/u);
  assert.match(
    link,
    /action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;/u,
  );
  assert.ok(
    link.includes(
      `S.browser_fallback_url=${encodeURIComponent('https://0xdmme.app/#configuracoes')};end`,
    ),
  );
  assert.ok(!link.includes('package='));
  assert.doesNotMatch(link, /ticket|session|signature/u);
  assert.equal(api.attemptBrowserReturn(), true);
  assert.deepEqual(navigated, [link]);
  const blocked = scope('Android', true);
  assert.equal(blocked.api.attemptBrowserReturn(), false);
  assert.equal(blocked.api.browserReturnUrl(), link);
  assert.deepEqual(blocked.navigated, []);
});

await test('iOS e desktop oferecem HTTPS sem fingir abertura automática do navegador externo', () => {
  for (const userAgent of ['iPhone', 'Macintosh']) {
    const { api, navigated } = scope(userAgent);
    assert.equal(api.browserReturnUrl(), 'https://0xdmme.app/#configuracoes');
    assert.equal(api.attemptBrowserReturn(), false);
    assert.deepEqual(navigated, []);
  }
});
