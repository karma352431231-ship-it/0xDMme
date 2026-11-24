import type { PaneMount } from '../emoji/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import type { GifSearch } from '../gif-search/index.ts';
import { klipyStickerSection } from './klipy-section.ts';
import { mountStickerPane } from './pane.ts';
import type { StickerSection } from './pane.ts';
import type { StickerDisplay } from './display.ts';
import type { StickerReference } from '../../shared/stickers/index.ts';

/**
 * Stickers (owner decision of 24/11/2026): one link in the text of a message,
 * post or reply, drawn as a sticker everywhere (private chats, groups, `@`
 * DMs and communities). See shared/stickers for the reference format.
 */
export {
  appendStickers,
  renderStickerMessage,
  stickerFigure,
  stickerName,
} from './display.ts';
export type { StickerDisplay } from './display.ts';
export { mountStickerDraft } from './draft.ts';
export type { StickerSection, SectionView } from './pane.ts';

/**
 * What the signed-in account adds (stage 3 and 4): its own stickers and packs
 * as shelf sections, and a sheet for a tapped sticker. The account layer sets
 * it once per session and clears it with null at sign-out.
 */
export interface AccountStickers {
  sections: (chosen: (link: string) => void) => StickerSection[];
  open: (sticker: StickerReference) => void;
}
let account: AccountStickers | null = null;
export function setAccountStickers(next: AccountStickers | null): void {
  account = next;
}

/** The app's external-media consent, set once at startup for KLIPY stickers. */
let pagePrivacy: ExternalMediaConsent | undefined;
export function setStickerPrivacy(consent: ExternalMediaConsent): void {
  pagePrivacy = consent;
}
const pageLifetime = new AbortController().signal;

/**
 * How messages, posts and replies draw stickers on this page. Without a
 * signal the drawing lives as long as its element (post text).
 */
export function stickerDisplay(
  privacy?: ExternalMediaConsent,
  signal: AbortSignal = pageLifetime,
): StickerDisplay {
  return {
    privacy: privacy ?? pagePrivacy,
    signal,
    ...(account ? { open: account.open } : {}),
  };
}

/** The Stickers tab for a composer: choosing sends or inserts the link. */
export function stickerPane(input: {
  chosen: (link: string) => void;
  gifs: GifSearch | null;
  privacy?: ExternalMediaConsent | undefined;
}): PaneMount {
  return (host, close) => {
    const chosen = (link: string): void => {
      close();
      input.chosen(link);
    };
    mountStickerPane(host, {
      chosen,
      privacy: input.privacy,
      sections: [
        ...(account?.sections(chosen) ?? []),
        ...(input.gifs ? [klipyStickerSection(input.gifs, chosen)] : []),
      ],
    });
  };
}
