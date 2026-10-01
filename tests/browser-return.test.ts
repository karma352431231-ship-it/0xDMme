import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import type {
  browserReturnUrl,
  attemptBrowserReturn,
  browserReturnIntent,
  originatingBrowser,
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

function scope(userAgent: string, rejected = false, standalone = false) {
  const navigated: string[] = [];
  const api = runInNewContext(`${source}\nReturn;`, {
    URL,
    navigator: { userAgent },
    window: { matchMedia: () => ({ matches: standalone }) },
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
    browserReturnIntent: typeof browserReturnIntent;
    originatingBrowser: typeof originatingBrowser;
  };
  return { api, navigated };
}

await test('retorno Android limita destino ao site próprio, usa navegador padrão e preserva link quando bloqueado', () => {
  const { api, navigated } = scope('Android');
  const link = api.browserReturnUrl();
  assert.match(link, /^intent:\/\/0xdmme\.app\/#Intent;/u);
  assert.equal(link.split('#').length, 2);
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

await test('Chrome Android usa scheme externo literal e alternativa de pacote fixo, sem dados do pedido', () => {
  const { api, navigated } = scope('Android Chrome/140.0 Mobile');
  assert.equal(api.originatingBrowser(), 'chrome');
  const direct = api.browserReturnUrl('chrome');
  assert.equal(
    direct,
    'googlechrome://navigate?url=https://0xdmme.app/#configuracoes',
  );
  assert.equal(
    direct.slice('googlechrome://navigate?url='.length),
    'https://0xdmme.app/#configuracoes',
  );
  assert.equal(api.attemptBrowserReturn('chrome'), true);
  assert.deepEqual(navigated, [direct]);
  const alternative = api.browserReturnIntent('chrome');
  assert.match(
    alternative,
    /^intent:\/\/0xdmme\.app\/#Intent;scheme=https;package=com.android.chrome;/u,
  );
  assert.equal(alternative.split('#').length, 2);
  assert.doesNotMatch(
    direct + alternative,
    /ticket|session|signature|wallet-entry/u,
  );
  const blocked = scope('Android', true);
  assert.equal(blocked.api.attemptBrowserReturn('chrome'), false);
  assert.equal(blocked.api.browserReturnUrl('chrome'), direct);
});

await test('categoria não adivinha Chrome em PWA, WebView ou outros browsers e não envia UA', () => {
  for (const ua of [
    'Android Chrome/140 SamsungBrowser/28',
    'Android Chrome/140 EdgA/140',
    'Android Chrome/140 OPR/100',
    'Android Firefox/140',
    'Android; wv) Chrome/140',
    'iPhone CriOS/140',
    'Macintosh Chrome/140',
  ])
    assert.equal(scope(ua).api.originatingBrowser(), 'default');
  assert.equal(
    scope('Android Chrome/140', false, true).api.originatingBrowser(),
    'default',
  );
});

await test('iOS e desktop oferecem HTTPS sem fingir abertura automática do navegador externo', () => {
  for (const userAgent of ['iPhone', 'Macintosh']) {
    const { api, navigated } = scope(userAgent);
    assert.equal(api.browserReturnUrl(), 'https://0xdmme.app/#configuracoes');
    assert.equal(api.attemptBrowserReturn(), false);
    assert.deepEqual(navigated, []);
  }
});
