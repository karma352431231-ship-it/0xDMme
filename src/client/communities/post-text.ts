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
function plainLinks(node: HTMLElement, text: string): void {
  for (const part of linkedParts(text))
    node.append(
      part.href
        ? externalLink({ text: part.text, href: part.href })
        : document.createTextNode(part.text),
    );
}
