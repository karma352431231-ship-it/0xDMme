import { withoutGifLinks } from '../gif-search/index.ts';
import { renderPublicText } from '../public-mentions/index.ts';
import { communityElement } from './elements.ts';
export function postUrls(text: string) {
  return text.matchAll(/https?:\/\/[^\s<>"']+/gu);
}
export function postText(
  text: string,
  displayedGifs: readonly string[] = [],
): HTMLElement {
  const node = communityElement('p', '', 'community-text');
  renderPublicText(node, withoutGifLinks(text, displayedGifs));
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
