import { webLink } from '../../shared/web-link/index.ts';

/** A run of message or post text, with its safe link target when it is a link. */
export interface LinkedPart {
  text: string;
  href: string | null;
}

// http(s) addresses and bare www. names; the closing punctuation of a
// sentence stays outside the link.
const candidates = /(?:https?:\/\/|www\.)[^\s<>"']+/giu;
const trailing = /[.,!?;:)\]}'"]+$/u;

/**
 * Splits text into plain runs and links (owner, 20/11/2026: links are
 * clickable in chats, handle messages, posts and replies). Only http(s)
 * without credentials passes `webLink`; anything else stays plain text.
 */
export function linkedParts(text: string): LinkedPart[] {
  const parts: LinkedPart[] = [];
  let end = 0;
  for (const match of text.matchAll(candidates)) {
    const raw = match[0].replace(trailing, '');
    const href = webLink(/^www\./iu.test(raw) ? `https://${raw}` : raw);
    if (!href) continue;
    if (match.index > end)
      parts.push({ text: text.slice(end, match.index), href: null });
    parts.push({ text: raw, href });
    end = match.index + raw.length;
  }
  if (end < text.length) parts.push({ text: text.slice(end), href: null });
  return parts;
}

/** An external link that opens apart from the app and sends no referrer. */
export function externalLink(part: {
  text: string;
  href: string;
}): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'text-link';
  link.href = part.href;
  link.textContent = part.text;
  link.target = '_blank';
  link.rel = 'noopener noreferrer nofollow';
  return link;
}
