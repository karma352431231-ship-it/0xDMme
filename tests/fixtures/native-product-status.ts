import { node, until, field, submit, page } from './native-product-dom.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';

async function publishStatus({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  await page('status', '[data-status-compose]', signal);
  await until(
    () => !node<HTMLButtonElement>('[data-status-publish]').disabled,
    signal,
  );
  field('[data-status-text]', value);
  submit('[data-status-compose]');
  await until(
    () => node('[data-status-notice]').textContent === 'Status publicado.',
    signal,
  );
  return 'The synthetic encrypted text status was published.';
}

async function readStatus({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = JSON.parse(value) as { peer: string; text: string };
  if (typeof input.peer !== 'string' || typeof input.text !== 'string')
    throw new Error('Expected a synthetic status author and text.');
  await page('status', '[data-status-list]', signal);
  const author = () =>
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[data-status-list] .status-row > button:first-child',
      ),
    ].find((button) =>
      button.textContent?.startsWith(input.peer + ' · Texto ·'),
    );
  await until(() => !!author() && !author()?.disabled, signal);
  author()?.click();
  await until(
    () =>
      document.querySelector('[data-status-open] h3')?.textContent ===
        input.peer &&
      document.querySelector('[data-status-open] p')?.textContent ===
        input.text,
    signal,
  );
  return 'The approved contact opened and decrypted the expected text status.';
}

export const statusActions: ReadonlyMap<string, NativeAction> = new Map([
  ['status-publish', publishStatus],
  ['status-read', readStatus],
]);
