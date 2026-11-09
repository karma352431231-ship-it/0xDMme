import { createHash } from 'node:crypto';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { compressedFrontendAssets } from './frontend-compression.ts';
import { frontendAssets } from './frontend-assets.ts';

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
  ['.xz', 'application/x-xz'],
  ['.wasm', 'application/wasm'],
  ['.bin', 'application/octet-stream'],
  ['.woff2', 'font/woff2'],
  ['.br', 'application/octet-stream'],
]);
const files = new Map(
  await frontendAssets(root, {
    application: 'src/client/app/index.ts',
    recovery: 'src/client/recovery-return/page.ts',
    defines: {},
  }),
);
function asset(name: string, bytes: Uint8Array): string {
  files.set(name, bytes);
  return `/${name}`;
}
async function bundleWorker(
  define: Record<string, string>,
): Promise<Uint8Array> {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('src/client/pwa/worker.ts', root))],
    bundle: true,
    minify: true,
    charset: 'utf8',
    define,
    write: false,
    platform: 'browser',
    format: 'esm',
    target: ['safari16.4', 'chrome111'],
    legalComments: 'inline',
    logLevel: 'silent',
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error('Frontend worker build is missing.');
  return output.contents;
}
async function pruneGeneratedAssets(): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length > 128)
    throw new Error('Build directory exceeds the limit.');
  for (const entry of entries) {
    const original = entry.name.endsWith('.br')
      ? entry.name.slice(0, -3)
      : entry.name;
    if (
      !/^(?:(?:app|i18n-catalog|emoji-catalog|language-start|source-document|phantom-probe|recovery-return|attachment-worker|voice-worklet)-[a-f0-9]{16}\.(?:js|css)|emoji-[a-f0-9]{16}\.json\.gz|source-[a-f0-9]{16}\.tar\.gz|matrix-crypto-18\.9\.0-source-[a-f0-9]{16}-\d{2}\.bin|libsodium-\d+\.\d+\.\d+-sources-[a-f0-9]{16}\.tar\.xz)$/u.test(
        original,
      ) ||
      files.has(entry.name)
    )
      continue;
    if (!entry.isFile()) throw new Error('Invalid generated asset.');
    await unlink(new URL(entry.name, directory));
  }
}

const workerSource = Buffer.from(
  await bundleWorker({
    'import.meta.url': 'globalThis.location.href',
  }),
).toString();
const version = createHash('sha256').update(workerSource);
for (const [name, bytes] of files) version.update(name).update(bytes);
const paths = [...files.keys()]
  .filter(
    (name) =>
      !name.endsWith('.tar.gz') &&
      !name.endsWith('.tar.xz') &&
      !name.startsWith('matrix-crypto-18.9.0-source') &&
      name !== 'wallet.html' &&
      name !== 'recovery.html' &&
      !name.startsWith('phantom-probe'),
  )
  .map((name) => (name === 'index.html' ? '/' : `/${name}`));
const worker = workerSource
  .replace('{{ASSETS}}', JSON.stringify(paths).replaceAll('"', '\\"'))
  .replace(
    '{{ASSET_HASHES}}',
    JSON.stringify(
      Object.fromEntries(
        paths.map((path) => {
          const bytes = files.get(path === '/' ? 'index.html' : path.slice(1));
          if (!bytes) throw new Error('Worker asset missing.');
          return [path, createHash('sha256').update(bytes).digest('hex')];
        }),
      ),
    ).replaceAll('"', '\\"'),
  )
  .replace('{{VERSION}}', version.digest('hex').slice(0, 16));
asset('sw.js', Buffer.from(worker));
// Sidecars are public build artifacts; PWA hashes still cover decoded originals.
const compressed = compressedFrontendAssets(files);
for (const [name, bytes] of compressed) asset(`${name}.br`, bytes);
await mkdir(directory, { recursive: true });
for (const [name, bytes] of files)
  await writeFile(new URL(name, directory), bytes);
const manifest = [...files.keys()].map((name) => {
  const extension = name.slice(name.lastIndexOf('.'));
  const type = mime.get(extension);
  if (!type) throw new Error('MIME type missing.');
  return {
    path: `/${name}`,
    type,
    ...(compressed.has(name) ? { br: `/${name}.br` } : {}),
  };
});
await writeFile(new URL('assets.json', directory), JSON.stringify(manifest));
await pruneGeneratedAssets();
await build({
  entryPoints: ['src/server/media-worker/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outfile: 'dist/media-worker/worker.mjs',
  sourcemap: false,
});
process.stdout.write(`Local web build: ${files.size} public assets.\n`);
