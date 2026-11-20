import { withoutGifLinks } from '../gif-search/index.ts';
import { renderMentions } from '../public-mentions/index.ts';
import { communityElement } from './elements.ts';
import { externalLink, linkedParts } from '../link-text/index.ts';
export function postUrls(text: string) {
  return text.matchAll(/https?:\/\/[^\s<>"']+/gu);
}
export function postText(
  text: string,
  displayedGifs: readonly string[] = [],
): HTMLElement {
  const node = communityElement('p', '', 'community-text');
  renderMentions(node, withoutGifLinks(text, displayedGifs), plainLinks);
  return node;
}
/**
 * A post title: mentions and web addresses become links, like the body
 * (owner request, 20/11/2026). The rest stays plain text.
 */
export function postTitle(tag: 'h2' | 'h3', text: string): HTMLElement {
  const node = document.createElement(tag);
  renderMentions(node, text, plainLinks);
  return node;
}
/** A post's card, led by its linked title. */
export function postTitleCard(title: string): HTMLElement {
  const node = communityElement('article', '', 'card community-card');
  node.append(postTitle('h2', title));
  return node;
}
function plainLinks(node: HTMLElement, text: string): void {
  for (const part of linkedParts(text))
    node.append(
      part.href
        ? externalLink({ text: part.text, href: part.href })
        : document.createTextNode(part.text),
    );
}
