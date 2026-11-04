import { validReaction } from '../../shared/daily/index.ts';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const emojiRecentKey = '0xdmme:emoji-recents';
const maximum = 32;
function localPreference(): PreferenceStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Device-only preference: bounded emoji, no account, conversation or timestamps. */
export class EmojiRecents {
  private recent: string[] = [];
  private storage: PreferenceStorage | null;
  constructor(storage: PreferenceStorage | null = localPreference()) {
    this.storage = storage;
  }
  get persistent(): boolean {
    return this.storage !== null;
  }
  values(): readonly string[] {
    if (!this.storage) return [...this.recent];
    try {
      const raw = this.storage.getItem(emojiRecentKey);
      if (raw === null) this.recent = [];
      else this.recent = this.decode(raw);
    } catch {
      this.storage = null;
    }
    return [...this.recent];
  }
  choose(emoji: string): void {
    if (!emoji || !validReaction(emoji)) return;
    this.recent = [
      emoji,
      ...this.values().filter((item) => item !== emoji),
    ].slice(0, maximum);
    try {
      this.storage?.setItem(emojiRecentKey, JSON.stringify(this.recent));
    } catch {
      this.storage = null;
    }
  }
  private decode(raw: string): string[] {
    if (raw.length > 8192) throw new Error('Invalid recent emoji preference.');
    const value: unknown = JSON.parse(raw);
    if (
      !Array.isArray(value) ||
      value.length > maximum ||
      value.some(
        (item: unknown) =>
          typeof item !== 'string' || !item || !validReaction(item),
      )
    )
      throw new Error('Invalid recent emoji preference.');
    return [...new Set(value as string[])];
  }
}
export const recentEmojis = new EmojiRecents();
