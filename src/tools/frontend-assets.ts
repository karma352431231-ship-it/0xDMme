import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { frontendMatrixSources } from './frontend-matrix-source.ts';
import { frontendSource } from './frontend-source.ts';
import { localizationPlugin } from './frontend-localization.ts';
import { emojiAsset, frontendEmoji } from './frontend-emoji.ts';
import { frontendWalletMarks } from './frontend-wallet-marks.ts';
import {
  frontendVendorSource,
  vendorSourceAsset,
} from './frontend-vendor-source.ts';

export interface FrontendEntries {
  application: string;
  recovery: string;
  defines: Readonly<Record<string, string>>;
}

/** One current asset graph for the web and installed product. Platform entries
 * select transport initialization; feature code and localization stay shared. */
export async function frontendAssets(
  root: URL,
  entries: FrontendEntries,
): Promise<ReadonlyMap<string, Uint8Array>> {
  // Interface fonts, vendored with their licenses (vendor/fonts/README.md).
  const fonts = new Map([
    [
      'figtree-latin-5.3.0.woff2',
      '4ba7d3d096695818fe0686be4f1e82c6b05134e18a22260336130335027462dd',
    ],
    [
      'sora-latin-5.3.0.woff2',
      'fa26406eeda9a3c6ec3d9ea8813c3045d6dc755e30c716d5c094e8ef43be5a7f',
    ],
  ]);
  const files = new Map<string, Uint8Array>();
  const inputs = new Set<string>();

  function asset(name: string, bytes: Uint8Array): string {
    files.set(name, bytes);
    return `/${name}`;
  }

  function hashedAsset(
    name: string,
    extension: string,
    bytes: Uint8Array,
  ): string {
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    return asset(`${name}-${hash}.${extension}`, bytes);
  }

  async function bundle(
    path: string,
    define: Record<string, string> = {},
    catalogUrl?: string,
    emojiCatalogUrl?: string,
  ): Promise<Uint8Array> {
    const result = await build({
      entryPoints: [fileURLToPath(new URL(path, root))],
      bundle: true,
      minify: true,
      charset: 'utf8',
      plugins: catalogUrl
        ? [localizationPlugin(catalogUrl, emojiCatalogUrl)]
        : [],
      define: { ...entries.defines, ...define },
      write: false,
      metafile: true,
      platform: 'browser',
      format: 'esm',
      target: ['safari16.4', 'chrome111'],
      legalComments: 'inline',
      // Same-origin fonts are separate assets published by this build.
      external: ['/*.woff2'],
      logLevel: 'silent',
    });
    const output = result.outputFiles[0];
    if (!output) throw new Error('Build missing.');
    for (const path of Object.keys(result.metafile.inputs)) inputs.add(path);
    return output.contents;
  }

  const emojis = await frontendEmoji(fileURLToPath(root));
  for (const [name, bytes] of await frontendWalletMarks(fileURLToPath(root)))
    asset(name, bytes);
  const emojiCatalogUrl = hashedAsset(
    'emoji-catalog',
    'js',
    new TextEncoder().encode(
      `export const emojiCatalogs=${JSON.stringify(emojis.catalog)};`,
    ),
  );
  const catalogUrl = hashedAsset(
    'i18n-catalog',
    'js',
    await bundle('src/shared/i18n/catalog.ts'),
  );
  const languageScript = hashedAsset(
    'language-start',
    'js',
    await bundle('src/client/language/start.ts', {}, catalogUrl),
  );
  const sourceStyle = hashedAsset(
    'source-document',
    'css',
    await bundle('src/client/language/source-document.css'),
  );
  asset(emojiAsset, emojis.content);
  const attachmentWorker = hashedAsset(
    'attachment-worker',
    'js',
    await bundle('src/client/attachments/worker.ts'),
  );
  const script = hashedAsset(
    'app',
    'js',
    await bundle(
      entries.application,
      {
        VOICE_WORKLET_URL: JSON.stringify(
          hashedAsset(
            'voice-worklet',
            'js',
            await bundle('src/client/voice-recording/worklet.ts'),
          ),
        ),
        ATTACHMENT_WORKER_URL: JSON.stringify(attachmentWorker),
        EMOJI_ASSET_URL: JSON.stringify(`/${emojiAsset}`),
      },
      catalogUrl,
      emojiCatalogUrl,
    ),
  );
  const style = hashedAsset(
    'app',
    'css',
    await bundle('src/client/app/app.css'),
  );
  const nativeProbe = hashedAsset(
    'phantom-probe',
    'js',
    await bundle('src/client/phantom-native/probe.ts', {}, catalogUrl),
  );
  const recoveryScript = hashedAsset(
    'recovery-return',
    'js',
    await bundle(entries.recovery, {}, catalogUrl),
  );
  const sources = hashedAsset(
    'source',
    'tar.gz',
    await frontendSource(fileURLToPath(root), inputs),
  );
  asset(vendorSourceAsset, await frontendVendorSource(fileURLToPath(root)));
  for (const [name, bytes] of await frontendMatrixSources(fileURLToPath(root), {
    script: languageScript,
    style: sourceStyle,
  }))
    asset(name, bytes);
  asset(
    'matrix-crypto-18.9.0.wasm',
    await readFile(
      new URL(
        'node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm',
        root,
      ),
    ),
  );
  const html = (
    await readFile(new URL('src/client/app/index.html', root), 'utf8')
  )
    .replace('{{SCRIPT}}', script)
    .replace('{{SOURCES}}', sources)
    .replace('{{EMOJI_SOURCES}}', `/${emojiAsset}`)
    .replace('{{I18N_CATALOG}}', catalogUrl)
    .replace('<link rel="modulepreload" href="{{EMOJI_CATALOG}}" />', '')
    .replace('{{STYLE}}', style);
  asset('index.html', Buffer.from(html));
  asset(
    'recovery.html',
    Buffer.from(
      (await readFile(new URL('src/client/app/recovery.html', root), 'utf8'))
        .replace('{{SCRIPT}}', recoveryScript)
        .replace('{{STYLE}}', style)
        .replace('{{SOURCES}}', sources),
    ),
  );
  asset(
    'phantom-probe.html',
    Buffer.from(
      (
        await readFile(
          new URL('src/client/app/phantom-probe.html', root),
          'utf8',
        )
      )
        .replace('{{SCRIPT}}', nativeProbe)
        .replace('{{STYLE}}', style)
        .replace('{{SOURCES}}', sources),
    ),
  );
  asset(
    'wallet.html',
    Buffer.from(
      (await readFile(new URL('src/client/app/wallet.html', root), 'utf8'))
        .replace('{{SCRIPT}}', script)
        .replace('{{SOURCES}}', sources)
        .replace('{{STYLE}}', style),
    ),
  );
  for (const [name, expected] of fonts) {
    const bytes = await readFile(new URL(`vendor/fonts/${name}`, root));
    if (createHash('sha256').update(bytes).digest('hex') !== expected)
      throw new Error('Source mismatch.');
    asset(name, bytes);
  }
  for (const name of [
    'icon.svg',
    'logo.svg',
    'icon-192.png',
    'icon-512.png',
    'notification-badge.png',
  ]) {
    asset(name, await readFile(new URL(`src/client/app/${name}`, root)));
  }
  asset(
    'manifest.webmanifest',
    Buffer.from(
      JSON.stringify({
        id: '/',
        name: '0xDMme',
        short_name: '0xDMme',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [192, 512].map((size) => ({
          src: `/icon-${size}.png`,
          sizes: `${size}x${size}`,
          type: 'image/png',
          purpose: 'any maskable',
        })),
      }),
    ),
  );

  return files;
}
