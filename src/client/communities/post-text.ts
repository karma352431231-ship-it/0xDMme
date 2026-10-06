import { postLink } from '../../shared/community-posts/index.ts';
import { communityElement } from './elements.ts';
export function postText(text: string): HTMLElement {
  const node = communityElement('p', '', 'community-text');
  let end = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gu)) {
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
  return node;
}
