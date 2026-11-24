import { stickerReference } from '../../shared/stickers/index.ts';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const stickerRecentKey = '0xdmme:sticker-recents';
const maximum = 24;
function localPreference(): PreferenceStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Device-only list of sticker links: no account, conversation or time. */
export class StickerRecents {
  private recent: string[] = [];
  private storage: PreferenceStorage | null;
  constructor(storage: PreferenceStorage | null = localPreference()) {
    this.storage = storage;
  }
  values(): readonly string[] {
    if (!this.storage) return [...this.recent];
    try {
      const raw = this.storage.getItem(stickerRecentKey);
      this.recent = raw === null ? [] : decode(raw);
    } catch {
      this.storage = null;
    }
    return [...this.recent];
  }
  choose(link: string): void {
    if (!stickerReference(link)) return;
    this.recent = [
      link,
      ...this.values().filter((item) => item !== link),
    ].slice(0, maximum);
    try {
      this.storage?.setItem(stickerRecentKey, JSON.stringify(this.recent));
    } catch {
      this.storage = null;
    }
  }
}
function decode(raw: string): string[] {
  if (raw.length > 16_384) throw new Error('Invalid recent stickers.');
  const value: unknown = JSON.parse(raw);
  if (
    !Array.isArray(value) ||
    value.length > maximum ||
    value.some(
      (item: unknown) => typeof item !== 'string' || !stickerReference(item),
    )
  )
    throw new Error('Invalid recent stickers.');
  return [...new Set(value as string[])];
}
export const recentStickers = new StickerRecents();
