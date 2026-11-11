import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import config from '../capacitor.config.ts';

const root = new URL('../', import.meta.url);
interface MobileBuild {
  kind: string;
  serviceOrigin: string;
  assets: Record<string, { bytes: number; sha256: string }>;
}

await test('complete native product package is local, bounded and matches its build manifest', async () => {
  const directory = new URL('dist/mobile/', root);
  const manifest = JSON.parse(
    await readFile(new URL('build.json', directory), 'utf8'),
  ) as MobileBuild;
  assert.equal(manifest.kind, 'native-product-v1');
  assert.equal(manifest.serviceOrigin, 'https://0xdmme.app');
  assert.deepEqual(
    (await readdir(directory)).sort(),
    [...Object.keys(manifest.assets), 'build.json'].sort(),
  );
  let total = 0;
  for (const [name, entry] of Object.entries(manifest.assets)) {
    assert.match(name, /^[a-z0-9][a-z0-9.-]*$/u);
    assert.doesNotMatch(
      name,
      /native-synthetic|synthetic-wallet|fixture-wallet/u,
    );
    const bytes = await readFile(new URL(name, directory));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      entry.sha256,
    );
    total += bytes.length;
    if (name.endsWith('.js') || name.endsWith('.html'))
      assert.doesNotMatch(
        bytes.toString('utf8'),
        /syntheticNativeProduct|SYNTHETIC NATIVE TEST|native-synthetic-test/u,
      );
  }
  assert.ok(total <= 96 * 1024 * 1024);
  const html = await readFile(new URL('index.html', directory), 'utf8');
  assert.match(html, /connect-src 'self' https:\/\/api\.klipy\.com/u);
  assert.match(html, /form-action 'none'/u);
  assert.doesNotMatch(html, /(?:src|href)=["'](?:https?:|\/\/)/u);
  assert.doesNotMatch(html, /Installed-app feasibility|probe\.js/u);
  assert.match(html, /app-shell/u);
  assert.doesNotMatch(html, /modulepreload[^>]*emoji-catalog/u);
});

await test('native shell cannot enable live reload, wildcard navigation or shared HTTP patching', () => {
  assert.equal(config.appName, '0xDMme');
  assert.equal(config.appId, 'app.zeroxdmme.development');
  assert.equal(config.webDir, 'dist/mobile');
  for (const key of ['url', 'allowNavigation', 'cleartext'])
    assert.equal(Object.hasOwn(config.server, key), false);
  assert.equal(config.android?.allowMixedContent, false);
  assert.equal(config.android?.webContentsDebuggingEnabled, false);
  assert.equal(config.ios?.webContentsDebuggingEnabled, false);
  assert.equal(config.plugins?.['CapacitorHttp']?.['enabled'], false);
  assert.equal(config.plugins?.['CapacitorCookies']?.['enabled'], false);
});

await test('web and mobile share the current localized UI assets', async () => {
  const web = new URL('dist/web/', root);
  const mobile = new URL('dist/mobile/', root);
  const names = await readdir(mobile);
  for (const name of names.filter((name) =>
    /^(?:app-.*\.css|i18n-catalog-|emoji-catalog-|language-start-|voice-worklet-|attachment-worker-|logo\.svg|wallet-)/u.test(
      name,
    ),
  )) {
    assert.deepEqual(
      await readFile(new URL(name, mobile)),
      await readFile(new URL(name, web)),
      name,
    );
  }
  assert.ok(names.some((name) => name.startsWith('i18n-catalog-')));
  assert.ok(names.includes('logo.svg'));
  const emojiCatalog = names.find((name) => name.startsWith('emoji-catalog-'));
  assert.ok(emojiCatalog);
  for (const directory of [mobile, web]) {
    const app = (await readdir(directory)).find((name) =>
      /^app-.*\.js$/u.test(name),
    );
    assert.ok(app);
    const script = await readFile(new URL(app, directory), 'utf8');
    assert.ok(
      script.includes(`import("/${emojiCatalog}")`),
      'The real emoji catalog must load on demand rather than gate entry.',
    );
  }

  const html = await readFile(new URL('index.html', mobile), 'utf8');
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/u);
});
