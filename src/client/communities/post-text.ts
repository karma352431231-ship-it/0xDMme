import { renderMentions } from '../public-mentions/index.ts';
import { postLink } from '../../shared/community-posts/index.ts';
import { communityElement } from './elements.ts';
export function postUrls(text: string) {
  return text.matchAll(/https?:\/\/[^\s<>"']+/gu);
}
export function postText(text: string): HTMLElement {
  const node = communityElement('p', '', 'community-text');
  renderMentions(node, text, plainLinks);
  return node;
}
function plainLinks(node: HTMLElement, text: string): void {
  let end = 0;
  for (const match of postUrls(text)) {
    node.append(document.createTextNode(text.slice(end, match.index)));
    const raw = match[0].replace(/[.,!?;:]+$/u, ''),
      href = postLink(raw);
    if (href) {
      const link = communityElement('a', raw);
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      node.append(link, document.createTextNode(match[0].slice(raw.length)));
    } else node.append(document.createTextNode(match[0]));
    end = match.index + match[0].length;
  }
  node.append(document.createTextNode(text.slice(end)));
}
