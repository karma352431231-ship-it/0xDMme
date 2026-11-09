/** Public-DOM driver packaged only with the private synthetic native fixture.
 * It cannot call product controllers, APIs, storage internals or native methods.
 */
export function node<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing product control: ${selector}`);
  return value;
}

export async function until(
  check: () => boolean,
  signal: AbortSignal,
  description = 'The expected public product state',
): Promise<void> {
  for (;;) {
    if (signal.aborted)
      throw new Error(`${description} was cancelled or timed out.`);
    if (check()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  }
}

export function click(selector: string): void {
  const control = node<HTMLButtonElement>(selector);
  if (control.disabled || control.hidden)
    throw new Error(`Unavailable product control: ${selector}`);
  control.click();
}

export function field(selector: string, value: string): void {
  const control = node<HTMLInputElement>(selector);
  control.value = value;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

export function submit(selector: string): void {
  node<HTMLFormElement>(selector).requestSubmit();
}

/** Draft fields stay editable during synchronization; the visible submit
 * button is the public contract for whether the form may actually send. */
export async function submitWhenReady(
  selector: string,
  signal: AbortSignal,
): Promise<void> {
  await until(
    () => {
      const button = node(selector).querySelector<HTMLButtonElement>(
        'button[type=submit]',
      );
      return (
        !!button &&
        !button.disabled &&
        !button.hidden &&
        button.getClientRects().length > 0
      );
    },
    signal,
    'The visible enabled submit button',
  );
  node(selector)
    .querySelector<HTMLButtonElement>('button[type=submit]')
    ?.click();
}

export function textButton(scope: string, text: string): void {
  const button = [...node(scope).querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!button || button.disabled || button.hidden)
    throw new Error(`Unavailable product action: ${text}`);
  button.click();
}

export async function waitButton(
  scope: string,
  text: string,
  signal: AbortSignal,
): Promise<void> {
  await until(
    () =>
      [
        ...(document.querySelector(scope)?.querySelectorAll('button') ?? []),
      ].some(
        (button) => button.textContent?.trim() === text && !button.disabled,
      ),
    signal,
    `The enabled ${text} button`,
  );
}

export function labelledField(
  scope: string,
  label: string,
  value: string,
): void {
  const wrapper = [...node(scope).querySelectorAll('label')].find(
    (candidate) => candidate.firstChild?.textContent?.trim() === label,
  );
  const input = wrapper?.querySelector('input,textarea');
  if (!(
    input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement
  ))
    throw new Error(`Missing product field: ${label}`);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function expand(section: string): void {
  const details = node<HTMLDetailsElement>(
    `[data-settings-section=${section}]`,
  );
  if (!details.open) click(`[data-settings-section=${section}] > summary`);
}

export async function page(
  hash: string,
  selector: string,
  signal: AbortSignal,
): Promise<void> {
  location.hash = hash;
  await until(
    () =>
      document.querySelector<HTMLElement>('#app-shell')?.dataset['page'] ===
        hash.split('?')[0] && !!document.querySelector(selector),
    signal,
    'The mounted product route and requested control',
  );
}

export interface NativeActionInput {
  value: string;
  signal: AbortSignal;
}
export type NativeAction = (input: NativeActionInput) => Promise<string>;
