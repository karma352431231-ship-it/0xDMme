import { t, translatedError } from '../../shared/i18n/index.ts';
import { renderMentions } from '../public-mentions/index.ts';
/** DOM builders scoped to community forms. User/server text never enters HTML. */
export function communityElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (tag === 'h2' || tag === 'h3') renderMentions(node, text);
  else node.textContent = text;
  node.className = className;
  return node;
}
export function communityCard(title: string): HTMLElement {
  const node = communityElement('article', '', 'card community-card');
  node.append(communityElement('h2', title));
  return node;
}
export function communityField(
  container: HTMLElement,
  label: string,
  options: { value?: string; maximum?: number; multiline?: boolean } = {},
): HTMLInputElement | HTMLTextAreaElement {
  const wrap = communityElement('label', label),
    input = options.multiline
      ? communityElement('textarea')
      : communityElement('input');
  input.value = options.value ?? '';
  input.maxLength = options.maximum ?? 1000;
  if (input instanceof HTMLInputElement) input.type = 'text';
  wrap.append(input);
  container.append(wrap);
  return input;
}
export function communityButton(
  container: HTMLElement,
  title: string,
  work: () => Promise<void>,
): HTMLButtonElement {
  const button = communityElement('button', title);
  button.type = 'button';
  button.addEventListener('click', () => {
    void Promise.resolve()
      .then(work)
      .catch((error: unknown) => {
        const output = communityElement(
          'p',
          error instanceof Error
            ? translatedError(error.message)
            : t('Operation unavailable.'),
        );
        output.setAttribute('role', 'status');
        container.append(output);
      });
  });
  container.append(button);
  return button;
}
/**
 * Follows a community link from inside a mounted screen exactly as a click on
 * it would: the workspace panel keeps links clicked inside it, and the full
 * Communities page navigates as usual.
 */
export function followCommunityLink(host: HTMLElement, hash: string): void {
  const link = communityElement('a');
  link.href = hash;
  link.hidden = true;
  host.append(link);
  link.click();
  link.remove();
}
export function communityLink(
  container: HTMLElement,
  title: string,
  hash: string,
): HTMLAnchorElement {
  const a = communityElement('a', title);
  a.href = hash;
  container.append(a);
  return a;
}
