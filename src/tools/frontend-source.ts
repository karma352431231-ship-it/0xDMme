import { execFile } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const authored = [
  'src/client/account',
  'src/client/account-profile',
  'src/client/app',
  'src/client/pwa',
  'src/client/wallet',
  'src/shared/account',
  'src/shared/pwa-policy',
  'src/shared/wallet-identity',
  'src/tools/build-web.ts',
  'src/tools/frontend-source.ts',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  '.nvmrc',
  'LICENSES.md',
  'LICENSE-GPL-3.0.txt',
  'docs/FONTES_FRONTEND.md',
];

async function collect(root: string, path: string): Promise<string[]> {
  const absolute = resolve(root, path);
  if (!absolute.startsWith(`${root}${sep}`))
    throw new Error('Fonte fora da raiz permitida.');
  const info = await lstat(absolute);
  if (info.isSymbolicLink()) throw new Error('Links não são fontes públicas.');
  if (info.isFile()) return [relative(root, absolute)];
  if (!info.isDirectory()) throw new Error('Fonte irregular.');
  const entries = await readdir(absolute);
  if (entries.length > 256) throw new Error('Diretório de fontes excedido.');
  const files: string[] = [];
  for (const entry of entries.sort()) {
    files.push(...(await collect(root, `${path}/${entry}`)));
    if (files.length > 1024) throw new Error('Quantidade de fontes excedida.');
  }
  return files;
}

export async function frontendSource(
  root: string,
  inputs: ReadonlySet<string>,
): Promise<Uint8Array> {
  root = resolve(root);
  const dependencies = new Set<string>();
  for (const input of inputs) {
    const dependency = /^(node_modules\/(?:@[^/]+\/)?[^/]+)\//u.exec(input);
    if (dependency?.[1]) dependencies.add(dependency[1]);
  }
  const files: string[] = [];
  for (const path of [...authored, ...dependencies].sort())
    files.push(...(await collect(root, path)));
  if (files.length > 1024) throw new Error('Quantidade de fontes excedida.');
  // Explicit paths only: no repository-wide archive, shell, .local or backend.
  const { stdout } = await execute(
    'tar',
    ['-czf', '-', '--no-recursion', '-C', root, '--', ...files],
    { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024, timeout: 30_000 },
  );
  return stdout;
}
