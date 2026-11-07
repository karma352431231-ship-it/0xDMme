import { observeProductBlobs } from './native-product-blobs.ts';
import { openNativeConversation } from './native-product-messages.ts';
import { node, until, field, submitWhenReady } from './native-product-dom.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';

function attachmentInput(value: string): {
  peer: string;
  text: string;
  sourceText: string;
} {
  const raw = JSON.parse(value) as unknown;
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('peer' in raw) ||
    !('text' in raw) ||
    typeof raw.peer !== 'string' ||
    typeof raw.text !== 'string'
  )
    throw new Error('Expected a synthetic attachment peer and marker.');
  if ('sourceText' in raw && typeof raw.sourceText !== 'string')
    throw new Error('Expected the synthetic source-file marker.');
  return {
    peer: raw.peer,
    text: raw.text,
    sourceText: 'sourceText' in raw ? String(raw.sourceText) : raw.text,
  };
}
function source(text: string): string {
  return ('0xDMme synthetic attachment: ' + text + '\n').repeat(1024);
}
function attachment(text: string, own: boolean): HTMLElement | undefined {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '[data-message-history] [data-message]',
    ),
  ].find(
    (article) =>
      article.classList.contains('own') === own &&
      article
        .querySelector(':scope > p')
        ?.textContent?.includes('native-synthetic.txt · ') === true &&
      article.querySelector(':scope > p')?.textContent?.endsWith(text) === true,
  );
}

/** Supplies a generated file to the real input. This does not certify the OS picker. */
async function sendAttachment({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = attachmentInput(value);
  await openNativeConversation(input.peer, signal);
  await until(
    () =>
      !node<HTMLInputElement>(
        '[data-direct-conversation] [data-attachment-file]',
      ).disabled,
    signal,
    'The conversation file input',
  );
  const transfer = new DataTransfer();
  transfer.items.add(
    new File([source(input.text)], 'native-synthetic.txt', {
      type: 'text/plain',
    }),
  );
  const picker = node<HTMLInputElement>(
    '[data-direct-conversation] [data-attachment-file]',
  );
  picker.files = transfer.files;
  picker.dispatchEvent(new Event('change', { bubbles: true }));
  await until(
    () =>
      document
        .querySelector('[data-direct-conversation] [data-attachment-preview]')
        ?.textContent?.includes('native-synthetic.txt') === true &&
      !node<HTMLButtonElement>('[data-direct-conversation] [data-compose-send]')
        .disabled,
    signal,
    'The prepared attachment preview and enabled send button',
  );
  field('[data-message-text]', input.text);
  await submitWhenReady('[data-message-form]', signal);
  return acceptedAttachment(input.text, signal);
}

async function acceptedAttachment(
  text: string,
  signal: AbortSignal,
): Promise<string> {
  await until(
    () =>
      !!attachment(text, true)?.querySelector('.message-checks') &&
      !node<HTMLButtonElement>('[data-message-refresh]').disabled,
    signal,
    'The accepted outgoing attachment marker',
  );
  const id = attachment(text, true)?.dataset['message'];
  if (!id)
    throw new Error('The encrypted outgoing attachment has no identity.');
  return id;
}

/** Verifies decrypted bytes from the product's Blob link, without claiming an OS save. */
async function readAttachment(
  { value, signal }: NativeActionInput,
  direction: 'sent' | 'received',
): Promise<string> {
  const input = attachmentInput(value);
  const own = direction === 'sent';
  await openNativeConversation(input.peer, signal);
  await until(
    () =>
      !!attachment(input.text, own) &&
      !node<HTMLButtonElement>('[data-message-refresh]').disabled,
    signal,
  );
  const article = attachment(input.text, own);
  if (!article) throw new Error('The received attachment is unavailable.');
  await verifyOriginal(article, { value: input.sourceText, signal });
  const id = article.dataset['message'];
  if (!id) throw new Error('The received attachment has no identity.');
  return id;
}

async function verifyOriginal(
  article: HTMLElement,
  input: NativeActionInput,
): Promise<void> {
  const download = [...(article?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent === 'Baixar arquivo original',
  );
  if (!download || download.disabled)
    throw new Error('The received original-file control is unavailable.');
  const observed = observeProductBlobs();
  try {
    download.click();
    await until(
      () => !!article.querySelector('a[download="native-synthetic.txt"]'),
      input.signal,
      'The actual decrypted original-file link',
    );
    const link = article.querySelector<HTMLAnchorElement>(
      'a[download="native-synthetic.txt"]',
    );
    const blob = link?.href.startsWith('blob:')
      ? observed.read(link.href)
      : undefined;
    if (!blob) throw new Error('The app did not provide its actual Blob.');
    await compareOriginal(blob, input.value);
  } finally {
    observed.dispose();
  }
}

async function compareOriginal(blob: Blob, text: string): Promise<void> {
  const actual = new Uint8Array(await blob.arrayBuffer());
  const expected = new TextEncoder().encode(source(text));
  try {
    if (
      actual.length !== expected.length ||
      actual.some((byte, index) => byte !== expected[index])
    )
      throw new Error('Decrypted attachment bytes differ from the source.');
  } finally {
    actual.fill(0);
    expected.fill(0);
  }
}

async function startNativeSave(input: NativeActionInput): Promise<string> {
  await readAttachment(input, 'sent');
  const marker = attachmentInput(input.value).text;
  const link = attachment(marker, true)?.querySelector<HTMLAnchorElement>(
    'a[download="native-synthetic.txt"]',
  );
  if (!link || !link.href.startsWith('blob:'))
    throw new Error(
      'The verified original attachment save link is unavailable.',
    );
  link.click();
  return 'The actual product original-file save link was activated.';
}

/** Observes the actual OS-chosen File before the product consumes its change
 * event. It never supplies a file or replaces the picker/production listener.
 */
async function pickAndSendAttachment({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = attachmentInput(value);
  await openNativeConversation(input.peer, signal);
  const picker = node<HTMLInputElement>(
    '[data-direct-conversation] [data-attachment-file]',
  );
  let selected: File | undefined;
  const changed = () => {
    selected = picker.files?.[0];
  };
  picker.addEventListener('change', changed, { capture: true });
  try {
    await until(
      () => selected !== undefined,
      signal,
      'The actual OS-chosen synthetic file',
    );
    const file = selected;
    if (
      !file ||
      file.name !== 'native-synthetic.txt' ||
      file.size > 1024 * 1024
    )
      throw new Error(
        'The OS selection was not the bounded synthetic fixture.',
      );
    await compareOriginal(file, input.sourceText);
    await until(
      () =>
        node(
          '[data-direct-conversation] [data-attachment-preview]',
        ).textContent?.includes(file.name) === true &&
        !node<HTMLButtonElement>(
          '[data-direct-conversation] [data-compose-send]',
        ).disabled,
      signal,
      'The prepared OS-selected file and enabled composer',
    );
    field('[data-message-text]', input.text);
    await submitWhenReady('[data-message-form]', signal);
    return acceptedAttachment(input.text, signal);
  } finally {
    picker.removeEventListener('change', changed, { capture: true });
    selected = undefined;
  }
}

export const attachmentActions: ReadonlyMap<string, NativeAction> = new Map([
  ['attachment-send', sendAttachment],
  ['attachment-receive', (input) => readAttachment(input, 'received')],
  ['attachment-recover-own', (input) => readAttachment(input, 'sent')],
  ['attachment-native-save', startNativeSave],
  ['attachment-pick-send', pickAndSendAttachment],
]);
