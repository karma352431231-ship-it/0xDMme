import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { frontendSource } from './frontend-source.ts';

const root = new URL('../../', import.meta.url);
const directory = new URL('dist/web/', root);
const mime = new Map([
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webmanifest', 'application/manifest+json'],
  ['.gz', 'application/gzip'],
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

async function bundle(path: string): Promise<Uint8Array> {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, root))],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'esm',
    target: ['safari16.4', 'chrome111'],
    legalComments: 'inline',
    logLevel: 'silent',
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error('Build ausente.');
  for (const path of Object.keys(result.metafile.inputs)) inputs.add(path);
  return output.contents;
}

async function pruneGeneratedAssets(): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length > 128) throw new Error('Diretório de build excedido.');
  for (const entry of entries) {
    if (
      !/^(?:app-[a-f0-9]{16}\.(?:js|css)|source-[a-f0-9]{16}\.tar\.gz)$/u.test(
        entry.name,
      ) ||
      files.has(entry.name)
    )
      continue;
    if (!entry.isFile()) throw new Error('Asset gerado irregular.');
    await unlink(new URL(entry.name, directory));
  }
}

const script = hashedAsset(
  'app',
  'js',
  await bundle('src/client/app/index.ts'),
);
const style = hashedAsset(
  'app',
  'css',
  await readFile(new URL('src/client/app/app.css', root)),
);
const sources = hashedAsset(
  'source',
  'tar.gz',
  await frontendSource(fileURLToPath(root), inputs),
);
const html = (
  await readFile(new URL('src/client/app/index.html', root), 'utf8')
)
  .replace('{{SCRIPT}}', script)
  .replace('{{SOURCES}}', sources)
  .replace('{{STYLE}}', style);
asset('index.html', Buffer.from(html));
asset(
  'wallet.html',
  Buffer.from(
    (await readFile(new URL('src/client/app/wallet.html', root), 'utf8'))
      .replace('{{SCRIPT}}', script)
      .replace('{{SOURCES}}', sources)
      .replace('{{STYLE}}', style),
  ),
);
for (const name of ['icon.svg', 'icon-192.png', 'icon-512.png']) {
  asset(name, await readFile(new URL(`src/client/app/${name}`, root)));
}
asset(
  'manifest.webmanifest',
  Buffer.from(
    JSON.stringify({
      id: '/',
      name: '0xDMme',
      short_name: '0xDMme',
      lang: 'pt-BR',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#f5f7f8',
      theme_color: '#121c25',
      icons: [192, 512].map((size) => ({
        src: `/icon-${size}.png`,
        sizes: `${size}x${size}`,
        type: 'image/png',
        purpose: 'any maskable',
      })),
    }),
  ),
);
const workerSource = Buffer.from(
  await bundle('src/client/pwa/worker.ts'),
).toString();
const version = createHash('sha256').update(workerSource);
for (const [name, bytes] of files) version.update(name).update(bytes);
const paths = [...files.keys()]
  .filter((name) => !name.endsWith('.tar.gz') && name !== 'wallet.html')
  .map((name) => (name === 'index.html' ? '/' : `/${name}`));
const worker = workerSource
  .replace('{{ASSETS}}', JSON.stringify(paths).replaceAll('"', '\\"'))
  .replace('{{VERSION}}', version.digest('hex').slice(0, 16));
asset('sw.js', Buffer.from(worker));
await mkdir(directory, { recursive: true });
for (const [name, bytes] of files)
  await writeFile(new URL(name, directory), bytes);
const manifest = [...files.keys()].map((name) => {
  const extension = name.slice(name.lastIndexOf('.'));
  const type = mime.get(extension);
  if (!type) throw new Error('MIME ausente.');
  return { path: `/${name}`, type };
});
await writeFile(new URL('assets.json', directory), JSON.stringify(manifest));
await pruneGeneratedAssets();
process.stdout.write(`Build web local: ${files.size} assets públicos.\n`);
