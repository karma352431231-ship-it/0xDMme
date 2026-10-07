import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const directory = new URL('../../dist/moderation-evaluation/', import.meta.url);
await mkdir(directory, { recursive: true });
await build({
  entryPoints: ['src/client/moderation-evaluation/index.ts'],
  outfile: fileURLToPath(new URL('client.js', directory)),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2023',
  minify: true,
});
for (const name of ['index.html', 'style.css'])
  await copyFile(
    new URL(`../../infra/moderation-evaluation/${name}`, import.meta.url),
    new URL(name, directory),
  );
await promisify(execFile)(
  'tar',
  [
    '-czf',
    fileURLToPath(new URL('source.tar.gz', directory)),
    '--',
    'LICENSE-GPL-3.0.txt',
    'LICENSES.md',
    'package.json',
    'package-lock.json',
    'src/client/moderation-evaluation',
    'src/shared/moderation-evaluation',
    'src/tools/build-moderation-evaluation.ts',
    'infra/moderation-evaluation/index.html',
    'infra/moderation-evaluation/style.css',
  ],
  { timeout: 10_000, maxBuffer: 4096 },
);
process.stdout.write(
  'Avaliação experimental: interface e fontes correspondentes locais preparadas.\n',
);
