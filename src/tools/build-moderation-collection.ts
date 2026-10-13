import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const output = new URL('../../dist/moderation-collection/', import.meta.url);
await mkdir(output, { recursive: true });
await build({
  entryPoints: ['src/client/moderation-collection/index.ts'],
  outfile: fileURLToPath(new URL('client.js', output)),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2023',
  minify: true,
  charset: 'utf8',
});
for (const name of ['index.html', 'style.css'])
  await copyFile(
    new URL(`../../infra/moderation-collection/${name}`, import.meta.url),
    new URL(name, output),
  );
await promisify(execFile)(
  'tar',
  [
    '-czf',
    fileURLToPath(new URL('source.tar.gz', output)),
    '--',
    'LICENSE-GPL-3.0.txt',
    'LICENSES.md',
    'package.json',
    'package-lock.json',
    'src/client/moderation-collection',
    'src/shared/account',
    'src/shared/i18n',
    'src/client/api-response',
    'src/client/language/index.ts',
    'infra/moderation-collection',
    'src/tools/build-moderation-collection.ts',
  ],
  { timeout: 10_000, maxBuffer: 4096 },
);
process.stdout.write(
  'Galeria privada de coleta e fontes correspondentes preparadas.\n',
);
