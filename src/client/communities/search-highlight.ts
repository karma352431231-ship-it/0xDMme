import { postSearchMatches } from '../../shared/post-search/index.ts';

/** Replace text nodes only: links, mention identity and user text remain intact. */
export function highlightPostSearch(host: Node, query: string): void {
  if (!query) return;
  for (const child of [...host.childNodes]) {
    if (child.nodeType === 3) highlightText(child, query);
    else highlightPostSearch(child, query);
  }
}

function highlightText(node: Node, query: string): void {
  const text = node.textContent ?? '';
  const fragment = document.createDocumentFragment();
  let end = 0;
  for (const match of postSearchMatches(text, query)) {
    fragment.append(document.createTextNode(text.slice(end, match.start)));
    const mark = document.createElement('mark');
    mark.className = 'post-search-match';
    mark.textContent = text.slice(match.start, match.end);
    fragment.append(mark);
    end = match.end;
  }
  if (!end) return;
  fragment.append(document.createTextNode(text.slice(end)));
  node.parentNode?.replaceChild(fragment, node);
}
