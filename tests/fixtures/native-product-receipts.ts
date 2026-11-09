import { openNativeConversation } from './native-product-messages.ts';
import { until } from './native-product-dom.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';

/** Verifies the sender's explicit read result, distinct from delivery/preservation.
 * Only ordinary DOM state is observed; receipt records are never inserted.
 */
async function readReceipt({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = JSON.parse(value) as unknown;
  if (
    !input ||
    typeof input !== 'object' ||
    !('peer' in input) ||
    !('text' in input) ||
    typeof input.peer !== 'string' ||
    typeof input.text !== 'string'
  )
    throw new Error(
      'Expected a synthetic peer and message for read acceptance.',
    );
  await openNativeConversation(input.peer, signal);
  let accepted = '';
  await until(
    () => {
      const article = [
        ...document.querySelectorAll<HTMLElement>(
          '[data-message-history] [data-message].own',
        ),
      ].find(
        (candidate) =>
          candidate.querySelector(':scope > p')?.textContent === input.text,
      );
      accepted = article?.dataset['message'] ?? '';
      return (
        !!accepted &&
        !!article?.querySelector(
          '.message-meta [aria-label^="Lida pelo destinatário"]',
        )
      );
    },
    signal,
    'The actual recipient-read receipt in the sender UI',
  );
  return accepted;
}

export const receiptActions: ReadonlyMap<string, NativeAction> = new Map([
  ['message-read-receipt', readReceipt],
]);
