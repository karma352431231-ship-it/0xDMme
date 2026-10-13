import { t } from '../../shared/i18n/index.ts';
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
      t('@{0}, {1}', [
        span.label,
        span.kind === 'user' ? 'perfil' : 'comunidade',
      ]),
    );
    link.title =
      span.kind === 'user' ? t('Abrir perfil') : t('Abrir comunidade');
    host.append(link);
    end = span.end;
  }
  plain(host, text.slice(end));
}
