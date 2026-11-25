import {
  stickerReferences,
  withoutStickerLinks,
} from '../../shared/stickers/index.ts';
import { appendStickers, stickerDisplay } from '../stickers/index.ts';
import type { ReplyPreview } from '../../shared/community-posts/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { gifUrls, showGifText, withoutGifLinks } from '../gif-search/index.ts';
import { publicationQuote } from './publications.ts';

/** Owns media in the inbox preview; clearing/navigation cancels every provider resource. */
export class PublicationPreview {
  private pending = new AbortController();
  private readonly privacy: ExternalMediaConsent | undefined;
  constructor(privacy?: ExternalMediaConsent) {
    this.privacy = privacy;
  }
  get signal(): AbortSignal {
    return this.pending.signal;
  }
  clear(): void {
    this.pending.abort();
    this.pending = new AbortController();
  }
  quote(
    preview: Pick<ReplyPreview, 'text' | 'media' | 'status'> | null,
    kind: 'post' | 'reply',
  ): string | HTMLElement {
    const text = publicationQuote(preview, kind);
    return preview?.status === 'visible' ? this.text(text) : text;
  }
  /**
   * Words, then the GIFs and stickers as pictures: the community never shows
   * their links (owner, 25/11/2026).
   */
  text(text: string): HTMLElement {
    const stickers = stickerReferences(text),
      gifs = gifUrls(text);
    if (!stickers.length && !gifs.length) return quoteParagraph(text);
    const host = document.createElement('div');
    host.className = 'activity-quote activity-quote-media';
    const words = withoutStickerLinks(text, stickers);
    const renderText = (node: HTMLElement, body: string) => {
      if (body) node.append(quoteParagraph(body));
    };
    if (this.privacy)
      showGifText(host, words, {
        privacy: this.privacy,
        signal: this.pending.signal,
        renderText,
      });
    else renderText(host, withoutGifLinks(words, gifs));
    if (stickers.length)
      appendStickers(
        host,
        stickers,
        stickerDisplay(this.privacy, this.pending.signal),
      );
    return host;
  }
}

function quoteParagraph(text: string): HTMLElement {
  const paragraph = document.createElement('p');
  paragraph.className = 'activity-quote';
  paragraph.textContent = text;
  return paragraph;
}
