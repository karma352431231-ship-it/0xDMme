import { brotliDecompressSync } from 'node:zlib';
import { compressiblePublicAsset } from '../../shared/public-asset-encoding/index.ts';

interface AssetBody {
  content: Uint8Array;
  etag?: string;
}
export interface PublicAsset extends AssetBody {
  type: string;
  br?: AssetBody;
}

export function brotliPath(value: unknown, path: string): string | undefined {
  if (typeof value !== 'object' || value === null || !('br' in value)) return;
  if (value.br !== `${path}.br` || !compressiblePublicAsset(path))
    throw new Error('Invalid public asset encoding path.');
  return `${path}.br`;
}

/** Validate exact decoded bytes with the original asset as the expansion bound. */
export function linkBrotliAssets(
  links: readonly { path: string; br: string }[],
  assets: Map<string, PublicAsset>,
): void {
  for (const link of links) {
    const original = assets.get(link.path),
      encoded = assets.get(link.br);
    if (!original || encoded?.type !== 'application/octet-stream')
      throw new Error('Public asset encoding is missing.');
    const decoded = brotliDecompressSync(encoded.content, {
      maxOutputLength: original.content.byteLength,
    });
    if (!decoded.equals(original.content))
      throw new Error('Public asset encoding differs from its source.');
    original.br = encoded;
  }
}

function encodingQuality(part: string): number {
  const parameters = part.split(';').slice(1);
  if (!parameters.length) return 1;
  if (parameters.length !== 1) return 0;
  const match = /^\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/u.exec(
    parameters[0]!,
  );
  return match ? Number(match[1]) : 0;
}

function acceptsBrotli(header: string | undefined): boolean {
  const entries = (header ?? '').toLowerCase().split(',');
  const exact = entries.find((part) => part.split(';')[0]?.trim() === 'br');
  const wildcard = entries.find((part) => part.split(';')[0]?.trim() === '*');
  const selected = exact ?? wildcard;
  return selected !== undefined && encodingQuality(selected) > 0;
}

export function publicAssetRepresentation(
  asset: PublicAsset,
  accepted: string | undefined,
): AssetBody & { encoding?: 'br' } {
  return asset.br && acceptsBrotli(accepted)
    ? { ...asset.br, encoding: 'br' }
    : asset;
}
