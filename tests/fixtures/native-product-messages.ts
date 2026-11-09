import { openNativeContact } from './native-product-contacts.ts';
import {
  node,
  until,
  field,
  submitWhenReady,
  textButton,
  page,
} from './native-product-dom.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';

async function prepareMessages({ signal }: NativeActionInput): Promise<string> {
  await prepareNativeMessages(signal);
  return 'The conversation directory completed initialization through the public UI.';
}

export async function prepareNativeMessages(
  signal: AbortSignal,
): Promise<void> {
  await page('conversas', '[data-message-refresh]', signal);
  await until(
    () => {
      const status = node('[data-message-status]').textContent;
      return (
        !node<HTMLButtonElement>('[data-message-refresh]').disabled &&
        (status === 'Atualizada' ||
          status ===
            'Alguns envios ainda estão pendentes. A retomada é automática.')
      );
    },
    signal,
    'The initialized conversation directory',
  );
}

export async function openNativeConversation(
  peer: string,
  signal: AbortSignal,
): Promise<void> {
  await prepareNativeMessages(signal);
  await openNativeContact(peer, signal);
  await until(
    () =>
      !node<HTMLButtonElement>('[data-message-refresh]').disabled &&
      !node<HTMLElement>('[data-message-history]').hidden,
    signal,
    'The selected conversation history and completed synchronization',
  );
}

function messageInput(value: string): { peer: string; text: string } {
  const input = JSON.parse(value) as unknown;
  if (
    typeof input !== 'object' ||
    input === null ||
    !('peer' in input) ||
    !('text' in input) ||
    typeof input.peer !== 'string' ||
    typeof input.text !== 'string'
  )
    throw new Error('Expected a synthetic peer and message.');
  return { peer: input.peer, text: input.text };
}

function message(text: string, own: boolean): HTMLElement | undefined {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '[data-message-history] [data-message]',
    ),
  ].find(
    (article) =>
      article.classList.contains('own') === own &&
      article.querySelector(':scope > p')?.textContent === text,
  );
}

async function sendMessage({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = messageInput(value);
  await openNativeConversation(input.peer, signal);
  field('[data-message-text]', input.text);
  await submitWhenReady('[data-message-form]', signal);
  return acceptedMessage(input.text, signal);
}

async function acceptedMessage(
  text: string,
  signal: AbortSignal,
): Promise<string> {
  await until(
    () => !!message(text, true)?.querySelector('.message-meta .message-checks'),
    signal,
  );
  await until(
    () => !node<HTMLButtonElement>('[data-message-refresh]').disabled,
    signal,
  );
  const id = message(text, true)?.dataset['message'];
  if (!id) throw new Error('The outgoing message has no identity.');
  return id;
}

async function editMessage({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = messageInput(value);
  await openNativeConversation(input.peer, signal);
  await until(
    () =>
      !!message(input.text, true) &&
      !node<HTMLButtonElement>('[data-message-refresh]').disabled,
    signal,
  );
  const article = message(input.text, true);
  article
    ?.querySelector<HTMLButtonElement>('[aria-label="Opções da mensagem"]')
    ?.click();
  textButton('.message-menu[open]', 'Editar');
  await until(
    () =>
      node('[data-compose-context]').textContent?.startsWith('Editando:') ===
      true,
    signal,
  );
  const edited = input.text + ' (edited)';
  field('[data-message-text]', edited);
  await submitWhenReady('[data-message-form]', signal);
  await until(
    () =>
      message(edited, true)
        ?.querySelector('.message-meta')
        ?.textContent?.includes('Editada') === true,
    signal,
  );
  return acceptedMessage(edited, signal);
}

async function checkEdited({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = messageInput(value);
  await receiveMessage({ value, signal });
  if (
    !message(input.text, false)
      ?.querySelector('.message-meta')
      ?.textContent?.includes('Editada')
  )
    throw new Error('The received edit marker is missing.');
  return 'The recipient decrypted the edited content and saw its edit marker.';
}

async function replyMessage({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = messageInput(value);
  await openNativeConversation(input.peer, signal);
  await until(
    () =>
      !!message(input.text, false) &&
      !node<HTMLButtonElement>('[data-message-refresh]').disabled,
    signal,
  );
  message(input.text, false)
    ?.querySelector<HTMLButtonElement>('[aria-label="Opções da mensagem"]')
    ?.click();
  textButton('.message-menu[open]', 'Responder');
  await until(
    () =>
      node('[data-compose-context]').textContent?.startsWith('Respondendo:') ===
      true,
    signal,
  );
  const text = 'Native reply to: ' + input.text;
  field('[data-message-text]', text);
  await submitWhenReady('[data-message-form]', signal);
  return acceptedMessage(text, signal);
}

async function checkReply({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = messageInput(value);
  const text = 'Native reply to: ' + input.text;
  const id = await receiveMessage({
    value: JSON.stringify({ peer: input.peer, text }),
    signal,
  });
  if (
    ![...(message(text, false)?.querySelectorAll('small') ?? [])].some(
      (annotation) => annotation.textContent === 'Em resposta: ' + input.text,
    )
  )
    throw new Error('The decrypted reply did not quote the expected original.');
  return id;
}

async function receiveMessage({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = messageInput(value);
  await openNativeConversation(input.peer, signal);
  await until(() => !!message(input.text, false), signal);
  await until(
    () => !node<HTMLButtonElement>('[data-message-refresh]').disabled,
    signal,
  );
  const id = message(input.text, false)?.dataset['message'];
  if (!id) throw new Error('The decrypted received message has no identity.');
  return id;
}

async function deliveryReceipt({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = messageInput(value);
  await openNativeConversation(input.peer, signal);
  await until(() => {
    const article = message(input.text, true);
    return !!article?.querySelector(
      '.message-meta [aria-label^="Recebida por um aparelho do destinatário"], .message-meta [aria-label^="Lida pelo destinatário"]',
    );
  }, signal);
  return 'The recipient preserved the message and the sender received its receipt.';
}

export const messageActions: ReadonlyMap<string, NativeAction> = new Map([
  ['messages-prepare', prepareMessages],
  ['message-send', sendMessage],
  ['message-receive', receiveMessage],
  ['message-receipt', deliveryReceipt],
  ['message-edit', editMessage],
  ['message-edit-receive', checkEdited],
  ['message-reply', replyMessage],
  ['message-reply-receive', checkReply],
]);
