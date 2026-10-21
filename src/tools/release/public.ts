import { setTimeout } from 'node:timers/promises';
import { describeFile } from './files.ts';
import type { ReleaseFile, ReleaseManifest } from './manifest.ts';

export type AssetReader = (
  entry: ReleaseFile,
  signal: AbortSignal,
) => Promise<Uint8Array>;

async function readPublic(
  entry: ReleaseFile,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const path = entry.path === '/index.html' ? '/?atualizar=1' : entry.path;
  const response = await fetch('https://0xdmme.app' + path, {
    redirect: 'error',
    credentials: 'omit',
    cache: 'no-store',
    signal,
    headers: { 'Accept-Encoding': 'identity' },
  });
  if (response.status !== 200 || !response.body)
    throw new Error('Public asset unavailable.');
  const encoding = response.headers.get('content-encoding');
  if (encoding && encoding !== 'identity')
    throw new Error('Unexpected asset encoding.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > entry.bytes)
        throw new Error('Public asset exceeds its expected size.');
      chunks.push(chunk);
    }
  } catch (error) {
    await response.body.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks);
}

/** An observation of unauthenticated public files, never account or chat APIs. */
export async function verifyPublic(
  manifest: ReleaseManifest,
  reader?: AssetReader,
): Promise<void> {
  const deadline = AbortSignal.timeout(180_000);
  for (const entry of manifest.assets) {
    const signal = AbortSignal.any([deadline, AbortSignal.timeout(10_000)]);
    const bytes = await (reader ?? readPublic)(entry, signal);
    const actual = describeFile(entry.path, bytes);
    if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256)
      throw new Error(
        'Observed public asset differs from the authenticated release.',
      );
    if (!reader) await setTimeout(300, undefined, { signal: deadline });
  }
}
