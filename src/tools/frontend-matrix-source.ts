import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const version = '18.9.0';
const sourceHash =
  '1da81a1b9089e833800becb0fbd3ac46dd323d445cd8856c53695db13d4bfc60';
export const matrixSourcePage = 'matrix-crypto-18.9.0-sources.html';
/** Full preferred Rust sources, lock, original crate archives and notices; no registry access at build time. */
export async function frontendMatrixSources(
  root: string,
): Promise<Map<string, Uint8Array>> {
  const path = resolve(
      root,
      'vendor/matrix-crypto-18.9.0/preferred-source.tar.xz',
    ),
    metadata = await lstat(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size > 40 * 1024 * 1024
  )
    throw new Error('Fontes Matrix excedidas ou irregulares.');
  const content = await readFile(path);
  if (createHash('sha256').update(content).digest('hex') !== sourceHash)
    throw new Error('Fontes Matrix alteradas sem revisão.');
  const pkg: unknown = JSON.parse(
    await readFile(
      resolve(
        root,
        'node_modules/@matrix-org/matrix-sdk-crypto-wasm/package.json',
      ),
      'utf8',
    ),
  );
  if (
    typeof pkg !== 'object' ||
    pkg === null ||
    !('version' in pkg) ||
    pkg.version !== version
  )
    throw new Error('Versão Matrix exige nova revisão de fontes.');
  const assets = new Map<string, Uint8Array>(),
    names: string[] = [];
  for (let start = 0; start < content.length; start += 2 * 1024 * 1024) {
    const part = Math.floor(start / (2 * 1024 * 1024)) + 1,
      name = `matrix-crypto-${version}-source-${sourceHash.slice(0, 16)}-${part.toString().padStart(2, '0')}.bin`;
    names.push(name);
    assets.set(name, content.subarray(start, start + 2 * 1024 * 1024));
  }
  const links = names
    .map((name) => `<li><a href="/${name}" download>${name}</a></li>`)
    .join('');
  assets.set(
    matrixSourcePage,
    Buffer.from(
      `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Fontes Matrix · 0xDMme</title><h1>Fontes e licenças Matrix ${version}</h1><p>Baixe as partes na ordem abaixo e concatene-as em preferred-source.tar.xz. SHA-256: ${sourceHash}. Copie o arquivo para vendor/matrix-crypto-${version}/ antes de reconstruir o frontend. O arquivo inclui a tag oficial, Cargo.lock, as 323 fontes de registry fixadas e seus avisos. As instruções completas estão no README do pacote principal de fontes.</p><ol>${links}</ol></html>`,
    ),
  );
  return assets;
}
