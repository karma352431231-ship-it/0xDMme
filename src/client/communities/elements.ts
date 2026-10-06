/** DOM builders scoped to community forms. User/server text never enters HTML. */
export function communityElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
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
          error instanceof Error ? error.message : 'Operação indisponível.',
        );
        output.setAttribute('role', 'status');
        container.append(output);
      });
  });
  container.append(button);
  return button;
}
export function communityLink(
  container: HTMLElement,
  title: string,
  hash: string,
): void {
  const a = communityElement('a', title);
  a.href = hash;
  container.append(a);
}
