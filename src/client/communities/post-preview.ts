import { postText, postUrls } from './post-text.ts';
import { communityElement as el } from './elements.ts';

/** Length and line count both matter: short text can still occupy many rows. */
export function postPreviewText(text: string): string {
  const lines = text.split('\n');
  const limited = lines.slice(0, 8).join('\n');
  const preview = [...limited].slice(0, 600).join('');
  for (const match of postUrls(text))
    if (
      match.index < preview.length &&
      match.index + match[0].length > preview.length
    )
      return text.slice(0, match.index);
  return preview;
}
export function postPreview(text: string): HTMLElement {
  const preview = postPreviewText(text);
  if (preview === text) return postText(text);
  const host = el('div', '', 'post-preview');
  let content = postText(preview === text ? text : preview + '…');
  host.append(content);
  const toggle = el('button', 'Ver tudo', 'post-preview-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  let expanded = false;
  toggle.addEventListener('click', () => {
    expanded = !expanded;
    const next = postText(expanded ? text : preview + '…');
    content.replaceWith(next);
    content = next;
    toggle.textContent = expanded ? 'Ver menos' : 'Ver tudo';
    toggle.setAttribute('aria-expanded', String(expanded));
  });
  host.append(toggle);
  return host;
}
