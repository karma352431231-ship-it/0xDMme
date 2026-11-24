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

/** The KLIPY file a `klipy` sticker points to. */
export function klipyStickerUrl(id: string): string {
  if (!ids.klipy.test(id)) throw new Error('Invalid sticker.');
  return `https://static.klipy.com/ii/${id}`;
}

/**
 * A personal sticker travels in private conversations as an ordinary
 * encrypted image attachment with a reserved name (24/11/2026), so the
 * attachment format and older apps stay unchanged: they show it as a photo.
 */
export const stickerFileNames = {
  'image/png': 'sticker.png',
  'image/gif': 'sticker.gif',
} as const;

/** Whether an attachment is a personal sticker drawn without a bubble. */
export function stickerAttachment(content: {
  name: string;
  type: string;
  image: boolean;
}): boolean {
  return (
    content.image &&
    (content.type === 'image/png' || content.type === 'image/gif') &&
    content.name === stickerFileNames[content.type]
  );
}
