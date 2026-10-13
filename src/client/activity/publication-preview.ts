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
  clear(): void {
    this.pending.abort();
    this.pending = new AbortController();
  }
  quote(
    preview: Pick<ReplyPreview, 'text' | 'media' | 'status'> | null,
    kind: 'post' | 'reply',
  ): string | HTMLElement {
    const text = publicationQuote(preview, kind);
    if (!this.privacy || preview?.status !== 'visible' || !gifUrls(text).length)
      return text;
    const host = document.createElement('p');
    host.className = 'activity-quote';
    showGifText(host, text, {
      privacy: this.privacy,
      signal: this.pending.signal,
      renderText: (node, body) => {
        node.textContent = body;
      },
    });
    return host;
  }
}
