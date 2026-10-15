import type { ReplyPreview } from '../../shared/community-posts/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { gifUrls, showGifText } from '../gif-search/index.ts';
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
  text(text: string): HTMLElement {
    if (!this.privacy || !gifUrls(text).length) {
      const paragraph = document.createElement('p');
      paragraph.className = 'activity-quote';
      paragraph.textContent = text;
      return paragraph;
    }
    const host = document.createElement('div');
    host.className = 'activity-quote activity-quote-media';
    showGifText(host, text, {
      privacy: this.privacy,
      signal: this.pending.signal,
      renderText: (node, body) => {
        if (!body) return;
        const paragraph = document.createElement('p');
        paragraph.className = 'activity-quote';
        paragraph.textContent = body;
        node.append(paragraph);
      },
    });
    return host;
  }
}
