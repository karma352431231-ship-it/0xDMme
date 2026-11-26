import type { PaneMount } from '../emoji/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import type { GifSearch } from '../gif-search/index.ts';
import { klipyStickerSection } from './klipy-section.ts';
import { mountStickerPane } from './pane.ts';
import type { StickerSection } from './pane.ts';
import type { StickerDisplay } from './display.ts';
import type { StickerReference } from '../../shared/stickers/index.ts';
import type { PublicStickerFile } from '../../shared/public-stickers/index.ts';

/**
 * Stickers (owner decision of 24/11/2026): one link in the text of a message,
 * post or reply, drawn as a sticker everywhere (private chats, groups, `@`
 * DMs and communities). See shared/stickers for the reference format.
 */
export {
  appendStickers,
  renderStickerMessage,
  stickerArt,
  stickerFigure,
  stickerName,
  stickerViewSource,
} from './display.ts';
export type { StickerDisplay } from './display.ts';
export { mountStickerDraft } from './draft.ts';
export { stickerSelection } from './attachment.ts';
export { stickerAttachment } from '../../shared/stickers/index.ts';
export type { StickerSection, SectionView } from './pane.ts';

/**
 * Where a chosen sticker goes. `chosen` takes a sticker link (Ping, KLIPY,
 * public). `file` sends a personal sticker as an encrypted file in private
 * conversations; without it (communities) a personal sticker is published
 * first and goes as its public link.
 */
export interface StickerTarget {
  chosen: (link: string) => void;
  file?: ((file: PublicStickerFile) => void) | undefined;
}

/**
 * What the signed-in account adds (stage 3 and 4): its own stickers and packs
 * as shelf sections, a sheet for a tapped sticker and saving a picture as a
 * sticker. The account layer sets it once per session and clears it with
 * null at sign-out.
 */
export interface AccountStickers {
  sections: (target: StickerTarget) => StickerSection[];
  open: (sticker: StickerReference) => void;
  /** Saves a picture as a personal sticker; `frame` asks for a square first. */
  save: (picture: Blob, frame: boolean) => Promise<void>;
}
let account: AccountStickers | null = null;
export function setAccountStickers(next: AccountStickers | null): void {
  account = next;
}
/** Whether "Make sticker" can be offered on this page now. */
export function canMakeStickers(): boolean {
  return account !== null;
}
/** Saves a picture as a personal sticker of the signed-in account. */
export function makeSticker(picture: Blob, frame = true): Promise<void> {
  if (!account) return Promise.reject(new Error('Sign in to save stickers.'));
  return account.save(picture, frame);
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

/** The Stickers tab for a composer: choosing sends or inserts the sticker. */
export function stickerPane(input: {
  chosen: (link: string) => void;
  file?: ((file: PublicStickerFile) => void) | undefined;
  gifs: GifSearch | null;
  privacy?: ExternalMediaConsent | undefined;
}): PaneMount {
  return (host, close) => {
    const chosen = (link: string): void => {
      close();
      input.chosen(link);
    };
    const target: StickerTarget = {
      chosen,
      file: input.file
        ? (file) => {
            close();
            input.file?.(file);
          }
        : undefined,
    };
    mountStickerPane(host, {
      chosen,
      privacy: input.privacy,
      sections: [
        ...(account?.sections(target) ?? []),
        ...(input.gifs ? [klipyStickerSection(input.gifs, chosen)] : []),
      ],
    });
  };
}
