import { gzipSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { lstat, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const authored = [
  'src/client/community-media',
  'src/shared/community-media',
  'src/shared/gif-inspection',
  'src/shared/social-media',
  'src/client/social-media',
  'src/client/social-backups',
  'src/shared/social-dm',
  'src/client/social-dm',
  'src/shared/community-discovery',
  'src/shared/community-posts',
  'src/client/communities',
  'src/shared/communities',
  'src/client/public-profile',
  'src/shared/public-profile',
  'src/shared/public-avatar',
  'src/shared/image-inspection',
  'src/client/calls',
  'src/shared/calls',
  'src/client/wallet-statements',
  'src/client/representatives',
  'src/shared/representatives',
  'src/client/emoji',
  'src/tools/frontend-emoji.ts',
  'vendor/emoji/README.md',
  'vendor/emoji/LICENSE-GRAPHICS.txt',
  'vendor/emoji/LICENSE-UNICODE.txt',
  'vendor/emoji/LICENSE-CLDR.txt',
  'src/client/daily',
  'src/client/daily-text',
  'src/client/message-actions',
  'src/client/message-search',
  'src/client/message-status',
  'src/client/notification-sound',
  'src/client/push-settings',
  'src/client/message-live',
  'src/client/voice-audio',
  'src/client/voice-recording',
  'src/client/voice-playback',
  'src/shared/voice',
  'src/shared/daily',
  'src/client/backups',
  'src/client/backup-archive',
  'src/client/local-history',
  'src/client/backup-records',
  'src/client/personal-removals',
  'src/client/groups',
  'src/client/message-session',
  'src/client/status',
  'src/client/status-crypto',
  'src/client/peer-identity',
  'src/client/message-api',
  'src/shared/backups',
  'src/client/attachment-crypto',
  'src/client/attachment-images',
  'src/client/attachments',
  'src/client/attachment-ui',
  'src/shared/attachments',
  'src/client/message-controls',
  'src/client/messages',
  'src/client/message-crypto',
  'src/client/message-profile',
  'src/client/message-recovery',
  'src/client/message-visibility',
  'src/client/message-storage',
  'src/shared/messages',
  'src/shared/groups',
  'src/shared/group-messages',
  'src/shared/group-quota',
  'src/shared/group-retention',
  'src/shared/status',
  'src/tools/frontend-matrix-source.ts',
  'vendor/matrix-crypto-18.9.0/README.md',
  'src/client/account',
  'src/client/account-profile',
  'src/client/contacts',
  'src/client/device-keys',
  'src/client/device-storage',
  'src/client/device-operations',
  'src/client/devices',
  'src/client/device-qr',
  'src/client/vault-authority',
  'src/client/vault-crypto',
  'src/client/vault-storage',
  'src/client/vault-sync',
  'src/client/vault-ui',
  'src/client/app',
  'src/client/pwa',
  'src/client/phantom-native',
  'src/client/wallet',
  'src/client/wallet-recovery',
  'src/client/recovery-return',
  'src/shared/account',
  'src/shared/contacts',
  'src/shared/devices',
  'src/shared/device-enrollment',
  'src/shared/vault',
  'src/shared/pwa-policy',
  'src/shared/wallet-identity',
  'src/shared/wallet-approval',
  'src/shared/wallet-recovery',
  'src/tools/build-web.ts',
  'src/tools/frontend-source.ts',
  'src/tools/frontend-vendor-source.ts',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  '.nvmrc',
  'LICENSES.md',
  'LICENSE-GPL-3.0.txt',
  'docs/FONTES_FRONTEND.md',
  'docs/PROVA_NATIVA_PHANTOM_SOLANA.md',
  'vendor/libsodium-0.8.4/README.md',
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

async function dependencySources(
  root: string,
  path: string,
  inputs: ReadonlySet<string>,
): Promise<string[]> {
  let preferred: string[];
  if (path === 'node_modules/@matrix-org/matrix-sdk-crypto-wasm')
    preferred = [
      'LICENSE',
      'README.md',
      'package.json',
      'index.d.ts',
      'pkg/matrix_sdk_crypto_wasm.d.ts',
    ];
  else if (path === 'node_modules/ethers')
    preferred = [
      'src.ts',
      'LICENSE.md',
      'README.md',
      'package.json',
      'rollup.config.mjs',
    ];
  else if (/\/@noble\/(?:curves|hashes)$/u.test(path))
    preferred = ['src', 'LICENSE', 'README.md', 'package.json'];
  else if (path === 'node_modules/qr')
    preferred = ['src', 'LICENSE', 'LICENSE-MIT', 'README.md', 'package.json'];
  else if (
    path === 'node_modules/libsodium' ||
    path === 'node_modules/libsodium-wrappers'
  )
    preferred = ['dist/modules-esm', 'LICENSE', 'README.md', 'package.json'];
  else return collect(root, path);
  // Preserve preferred sources, metadata/licenses and exact incorporated JS;
  // omit duplicate distribution builds without increasing the resource caps.
  const files: string[] = [];
  for (const source of preferred)
    files.push(...(await collect(root, `${path}/${source}`)));
  files.push(
    ...[...inputs].filter(
      (input) =>
        input.startsWith(`${path}/`) &&
        !input.slice(path.length + 1).startsWith('node_modules/'),
    ),
  );
  return files;
}
export async function frontendSource(
  root: string,
  inputs: ReadonlySet<string>,
): Promise<Uint8Array> {
  root = resolve(root);
  const dependencies = new Set<string>();
  for (const input of inputs) {
    const dependency = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//u.exec(input);
    if (dependency?.[1]) dependencies.add(dependency[1]);
  }
  const files: string[] = [];
  for (const path of [...authored, ...dependencies].sort())
    files.push(...(await dependencySources(root, path, inputs)));
  const included = new Set(files);
  verifyInputs(root, inputs, included);
  if (included.size > 1024) throw new Error('Quantidade de fontes excedida.');
  // Explicit paths only: no repository-wide archive, shell, .local or backend.
  const { stdout } = await execute(
    'tar',
    ['-cf', '-', '--no-recursion', '-C', root, '--', ...included],
    { encoding: 'buffer', maxBuffer: 24 * 1024 * 1024, timeout: 30_000 },
  );
  const archive = gzipSync(stdout, { level: 9 });
  if (archive.length > 2 * 1024 * 1024)
    throw new Error(
      `Fontes comprimidas (${archive.length} bytes) excedem o teto de 2 MiB.`,
    );
  return archive;
}
function verifyInputs(
  root: string,
  inputs: ReadonlySet<string>,
  included: ReadonlySet<string>,
): void {
  for (const input of inputs) {
    const path = relative(root, resolve(root, input));
    if (
      (path.startsWith('src/client/') ||
        path.startsWith('src/shared/') ||
        path.startsWith('node_modules/')) &&
      !included.has(path)
    )
      throw new Error('Fonte incorporada está ausente do pacote: ' + path);
  }
}
