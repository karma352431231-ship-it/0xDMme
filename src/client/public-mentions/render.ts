import {
  mentionHref,
  mentionSpans,
} from '../../shared/public-mentions/index.ts';
/** Text nodes and app-only anchors; no HTML, external target or network lookup. */
export function renderMentions(
  host: HTMLElement,
  text: string,
  plain: (host: HTMLElement, text: string) => void = (node, value) =>
    node.append(document.createTextNode(value)),
): void {
  let end = 0;
  for (const span of mentionSpans(text)) {
    plain(host, text.slice(end, span.start));
    const link = document.createElement('a');
    link.className = 'public-mention';
    link.href = mentionHref(span);
    link.textContent = '@' + span.label;
    link.setAttribute(
      'aria-label',
      `@${span.label}, ${span.kind === 'user' ? 'perfil' : 'comunidade'}`,
    );
    link.title = span.kind === 'user' ? 'Abrir perfil' : 'Abrir comunidade';
    host.append(link);
    end = span.end;
  }
  plain(host, text.slice(end));
}
