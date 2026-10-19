import { brotliCompressSync, constants } from 'node:zlib';
import { compressiblePublicAsset } from '../shared/public-asset-encoding/index.ts';

/** Build once on the development machine; never compress authenticated data. */
export function compressedFrontendAssets(
  files: ReadonlyMap<string, Uint8Array>,
): Map<string, Uint8Array> {
  const compressed = new Map<string, Uint8Array>();
  for (const [name, bytes] of files) {
    if (bytes.byteLength < 1024 || !compressiblePublicAsset(`/${name}`))
      continue;
    const content = brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 9 },
    });
    if (content.byteLength + 64 < bytes.byteLength)
      compressed.set(name, content);
  }
  return compressed;
}
