import type { AppLanguage } from '../../shared/i18n/index.ts';
import type { EmojiRow } from './catalog.ts';

// The web build replaces this with its pinned, bilingual public catalog module.
export const emojiCatalogs: Record<AppLanguage, readonly EmojiRow[]> = {
  en: [],
  'zh-CN': [],
};
