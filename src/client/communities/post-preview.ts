import { withoutGifLinks } from '../gif-search/index.ts';
import {
  mentionPlainText,
  mentionSpans,
} from '../../shared/public-mentions/index.ts';
import { postText, postUrls } from './post-text.ts';
import { communityElement as el } from './elements.ts';

/** Length and line count both matter: short text can still occupy many rows. */
export function postPreviewText(text: string): string {
  const lines = text.split('\n');
  const limited = lines.slice(0, 8).join('\n');
  const preview = mentionPreview(limited, 600);
  for (const match of postUrls(text))
    if (
      match.index < preview.length &&
      match.index + match[0].length > preview.length
    )
      return text.slice(0, match.index);
  return preview;
}
export function postPreview(
  source: string,
  displayedGifs: readonly string[] = [],
): HTMLElement {
  const text = withoutGifLinks(source, displayedGifs);
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

function mentionPreview(text: string, maximum: number): string {
  const cutoff = [...mentionPlainText(text)].slice(0, maximum).join('').length;
  let overhead = 0;
  for (const span of mentionSpans(text)) {
    const start = span.start - overhead,
      end = start + span.label.length + 1;
    if (cutoff > start && cutoff < end) return text.slice(0, span.start);
    if (cutoff >= end)
      overhead += span.end - span.start - span.label.length - 1;
  }
  return text.slice(0, cutoff + overhead);
}
