import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = 'vendor/libsodium-0.8.4';
const digest =
  '2528bcbb8a0ed0d1a5492916f455e9a73adeb165f5cf54113834de193c50e29e';
export const vendorSourceAsset = `libsodium-0.8.4-sources-${digest.slice(0, 16)}.tar.xz`;

/** Offline, pinned preferred sources for the compiled NaCl dependency. */
export async function frontendVendorSource(root: string): Promise<Uint8Array> {
  for (const name of ['libsodium', 'libsodium-wrappers']) {
    const data: unknown = JSON.parse(
      await readFile(
        resolve(root, 'node_modules', name, 'package.json'),
        'utf8',
      ),
    );
    if (
      typeof data !== 'object' ||
      data === null ||
      !('version' in data) ||
      data.version !== '0.8.4'
    )
      throw new Error('Fontes da biblioteca exigem nova revisão de versão.');
  }
  const path = resolve(root, directory, 'preferred-source.tar.xz');
  const metadata = await lstat(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size > 2 * 1024 * 1024
  )
    throw new Error('Arquivo de fontes da biblioteca inválido.');
  const content = await readFile(path);
  if (createHash('sha256').update(content).digest('hex') !== digest)
    throw new Error('Fontes da biblioteca alteradas sem revisão.');
  return content;
}
