import { AccountError, base64, keys, object, uuid } from '../account/index.ts';
import { prepareGif } from '../gif-inspection/index.ts';
import { imageShape, metadataFree } from '../image-inspection/index.ts';
/**
 * Sticker references (owner decision of 24/11/2026). A sticker travels as one
 * link inside the text of a message, post or reply, so the private formats,
 * signatures and server contracts stay unchanged. The sticker sits in the
 * fragment, which browsers never send to a server; an older app shows the
 * link, and opening it only opens the app.
 *
 * Sources:
 * - `ping/<pose>`: the Ping pack drawn by the app itself.
 * - `klipy/<path>`: a KLIPY catalog sticker, loaded from KLIPY like its GIFs.
 * - `public/<uuid>`: a public sticker hosted by 0xDMme (personal stickers
 *   used in public places and public packs), served after moderation.
 */
export type StickerSource = 'ping' | 'klipy' | 'public';
export interface StickerReference {
  source: StickerSource;
  id: string;
  link: string;
}
export const stickerLinkPrefix = 'https://0xdmme.app/#sticker=';
/** At most this many stickers are drawn from one post or reply text. */
export const stickersPerText = 3;

const ids: Record<StickerSource, RegExp> = {
  ping: /^[a-z]{2,16}$/u,
  klipy:
    /^[A-Za-z0-9_-]{1,64}(?:\/[A-Za-z0-9_-]{1,64}){0,6}\.(?:webp|gif|png)$/u,
  public: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
};
const reference =
  /^https:\/\/0xdmme\.app\/#sticker=(ping|klipy|public)\/([^\s]{1,300})$/u;
const anywhere = /https:\/\/0xdmme\.app\/#sticker=[^\s<>"']{1,310}/gu;

export function stickerLink(source: StickerSource, id: string): string {
  if (!ids[source].test(id)) throw new Error('Invalid sticker.');
  return `${stickerLinkPrefix}${source}/${id}`;
}

/** The reference when the whole value is one sticker link, else null. */
export function stickerReference(value: string): StickerReference | null {
  const text = value.trim();
  const match = reference.exec(text);
  if (!match) return null;
  const source = match[1] as StickerSource,
    id = match[2] ?? '';
  return ids[source].test(id) ? { source, id, link: text } : null;
}

/** Distinct sticker links of a text, in order, at most `stickersPerText`. */
export function stickerReferences(text: string): StickerReference[] {
  const found = new Map<string, StickerReference>();
  for (const match of text.matchAll(anywhere)) {
    const sticker = stickerReference(match[0].replace(/[.,!?;:]+$/u, ''));
    if (sticker) found.set(sticker.link, sticker);
    if (found.size === stickersPerText) break;
  }
  return [...found.values()];
}

/** The text without the sticker links that are drawn as stickers. */
export function withoutStickerLinks(
  text: string,
  shown: readonly StickerReference[],
): string {
  if (!shown.length) return text;
  const links = new Set(shown.map((sticker) => sticker.link));
  return text
    .replace(anywhere, (match) => {
      const link = match.replace(/[.,!?;:]+$/u, '');
      return links.has(link) ? match.slice(link.length) : match;
    })
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

/** Largest approved public sticker file served by 0xDMme. */
export const publicStickerBytes = 1_000_000;

/** Where a public sticker's released file is read, anonymously. */
export function publicStickerPath(id: string): string {
  if (!ids.public.test(id)) throw new Error('Invalid sticker.');
  return `/api/public-media/sticker/${id}`;
}

/** Public sticker and pack bounds (24/11/2026). */
export const publicStickerLimits = {
  side: 1024,
  perProfile: 300,
  packsPerProfile: 20,
  perPack: 30,
  addedPacks: 50,
  packName: 40,
} as const;
export interface PublicStickerFile {
  type: 'image/png' | 'image/gif';
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
}

function gifSize(bytes: Uint8Array): { width: number; height: number } {
  return {
    width: (bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8),
    height: (bytes[8] ?? 0) | ((bytes[9] ?? 0) << 8),
  };
}
function stickerShape(
  bytes: Uint8Array<ArrayBuffer>,
  type: 'image/png' | 'image/gif',
): PublicStickerFile {
  if (type === 'image/gif') {
    const prepared = prepareGif(bytes);
    return { type, bytes: prepared, ...gifSize(prepared) };
  }
  const shape = imageShape(bytes);
  if (shape.type !== type || !metadataFree(bytes, type))
    throw new Error('Sticker is not prepared.');
  return { type, bytes, width: shape.width, height: shape.height };
}

/** A prepared PNG or GIF sticker; never permission to show it publicly. */
export function publicStickerFile(value: unknown): PublicStickerFile {
  const data = object(value);
  keys(data, ['type', 'bytes']);
  const type = data['type'];
  if (type !== 'image/png' && type !== 'image/gif')
    throw new AccountError(400, 'Prepare a PNG or GIF sticker.');
  const bytes = base64(data['bytes'], publicStickerBytes);
  let file: PublicStickerFile;
  try {
    file = stickerShape(bytes, type);
  } catch {
    throw new AccountError(400, 'Sticker invalid. Prepare it again.');
  }
  const side = Math.max(file.width, file.height);
  if (!file.width || !file.height || side > publicStickerLimits.side)
    throw new AccountError(400, 'Sticker invalid. Prepare it again.');
  return file;
}

/** A pack name: one line, trimmed, 1–40 characters. */
export function stickerPackName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (
    !name ||
    [...name].length > publicStickerLimits.packName ||
    /[\p{Cc}\p{Cf}\n]/u.test(name)
  )
    throw new AccountError(400, 'Name the pack in 1 to 40 characters.');
  return name;
}

/** Public sticker IDs, unique and bounded (a pack's order matters). */
export function publicStickerIds(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new AccountError(400, 'Invalid sticker list.');
  const result = value.map((item: unknown) => uuid(item));
  if (new Set(result).size !== result.length)
    throw new AccountError(400, 'Invalid sticker list.');
  return result;
}

/** The KLIPY file a `klipy` sticker points to. */
export function klipyStickerUrl(id: string): string {
  if (!ids.klipy.test(id)) throw new Error('Invalid sticker.');
  return `https://static.klipy.com/ii/${id}`;
}
