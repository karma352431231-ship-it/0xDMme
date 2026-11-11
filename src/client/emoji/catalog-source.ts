import { currentLanguage } from '../../shared/i18n/index.ts';
import { EmojiCatalog } from './catalog.ts';

const empty = new EmojiCatalog([]);
let current: EmojiCatalog | undefined;
let pending: Promise<EmojiCatalog> | undefined;

/** Public decoration is loaded only by an emoji render or an opened picker. */
export function emojiCatalog(): EmojiCatalog {
  return current ?? empty;
}
export function loadEmojiCatalog(): Promise<EmojiCatalog> {
  pending ??= import('./data.ts').then(({ emojiCatalogs }) => {
    current = new EmojiCatalog(emojiCatalogs[currentLanguage()]);
    return current;
  });
  return pending;
}
