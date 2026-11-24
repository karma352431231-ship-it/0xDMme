import { withoutGifLinks } from '../gif-search/index.ts';
import { appendStickers, stickerDisplay } from '../stickers/index.ts';
import {
  stickerReferences,
  withoutStickerLinks,
} from '../../shared/stickers/index.ts';
import { renderPublicText } from '../public-mentions/index.ts';
import { communityElement } from './elements.ts';
export function postUrls(text: string) {
  return text.matchAll(/https?:\/\/[^\s<>"']+/gu);
}
/** Text first, then its stickers (24/11/2026); GIFs are drawn by the caller. */
export function postText(
  text: string,
  displayedGifs: readonly string[] = [],
): HTMLElement {
  const node = communityElement('p', '', 'community-text');
  const stickers = stickerReferences(text);
  renderPublicText(
    node,
    withoutStickerLinks(withoutGifLinks(text, displayedGifs), stickers),
  );
  appendStickers(node, stickers, stickerDisplay());
  return node;
}
/**
 * A post title: mentions and web addresses become links, like the body
 * (owner request, 20/11/2026). The rest stays plain text.
 */
export function postTitle(tag: 'h2' | 'h3', text: string): HTMLElement {
  const node = document.createElement(tag);
  renderPublicText(node, text);
  return node;
}
/** A post's card, led by its linked title. */
export function postTitleCard(title: string): HTMLElement {
  const node = communityElement('article', '', 'card community-card');
  node.append(postTitle('h2', title));
  return node;
}
