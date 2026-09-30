import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { artifactBase, zkArtifacts } from '../../shared/zk-probe/index.ts';
import type { ArtifactName } from '../../shared/zk-probe/index.ts';

const directory = new URL('../../../.local/zk/', import.meta.url);

function validate(name: ArtifactName, bytes: Uint8Array): void {
  const expected = zkArtifacts.find((entry) => entry.name === name);
  if (
    !expected ||
    bytes.length !== expected.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== expected.sha256
  )
    throw new Error(
      'Artefato ZK ausente ou sem a integridade esperada. Execute probe:zk:prepare.',
    );
}

export async function readArtifact(name: ArtifactName): Promise<Buffer> {
  const bytes = await readFile(new URL(name, directory));
  validate(name, bytes);
  return bytes;
}

export function artifactPaths() {
  return {
    wasm: fileURLToPath(new URL('semaphore-4.wasm', directory)),
    zkey: fileURLToPath(new URL('semaphore-4.zkey', directory)),
  };
}

/** Único passo com rede externa; uso privado posterior é inteiramente local. */
export async function prepareArtifacts(): Promise<void> {
  await mkdir(directory, { recursive: true });
  for (const artifact of zkArtifacts) {
    try {
      await readArtifact(artifact.name);
      continue;
    } catch (error: unknown) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
    const response = await fetch(`${artifactBase}${artifact.name}`, {
      signal: AbortSignal.timeout(45_000),
      redirect: 'error',
    });
    if (!response.ok || !response.body)
      throw new Error('Download do artefato ZK rejeitado.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > artifact.bytes)
        throw new Error('Artefato ZK excede o tamanho fixado.');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    validate(artifact.name, bytes);
    await writeFile(new URL(artifact.name, directory), bytes, { flag: 'wx' });
  }
}
