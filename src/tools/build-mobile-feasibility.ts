import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../../', import.meta.url);
const directory = new URL('dist/mobile-feasibility/', root);
const source = new URL('src/client/mobile-feasibility/', root);
const result = await build({
  entryPoints: [fileURLToPath(new URL('page.ts', source))],
  absWorkingDir: fileURLToPath(root),
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'esm',
  target: ['safari16.4', 'chrome111'],
  define: { INSTALLED_APP: 'true' },
  legalComments: 'inline',
  write: false,
  metafile: true,
});
const script = result.outputFiles[0];
if (!script) throw new Error('Mobile feasibility bundle is missing.');
const files = new Map<string, Uint8Array>([
  ['probe.js', script.contents],
  ['index.html', await readFile(new URL('index.html', source))],
  ['probe.css', await readFile(new URL('probe.css', source))],
  ['icon.svg', await readFile(new URL('src/client/app/icon.svg', root))],
  [
    'matrix-crypto-18.9.0.wasm',
    await readFile(
      new URL(
        'node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm',
        root,
      ),
    ),
  ],
]);
if (
  [...files.values()].reduce((total, bytes) => total + bytes.length, 0) >
  16 * 1024 * 1024
)
  throw new Error('Mobile feasibility assets exceed 16 MiB.');
await mkdir(directory, { recursive: true });
// Refuse unexpected files rather than deleting another build's output.
for (const entry of await readdir(directory, { withFileTypes: true })) {
  if (
    (!files.has(entry.name) && entry.name !== 'build.json') ||
    !entry.isFile()
  )
    throw new Error('Unexpected mobile feasibility build entry.');
}
for (const [name, bytes] of files)
  await writeFile(new URL(name, directory), bytes);
await writeFile(
  new URL('build.json', directory),
  JSON.stringify(
    {
      kind: 'native-feasibility-v1',
      serviceOrigin: 'https://0xdmme.app',
      assets: Object.fromEntries(
        [...files].map(([name, bytes]) => [
          name,
          {
            bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        ]),
      ),
      inputs: Object.keys(result.metafile.inputs).sort(),
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write(
  `Mobile feasibility: ${files.size} local assets. No server or wallet requests.\n`,
);
