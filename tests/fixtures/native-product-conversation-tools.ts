import { openNativeConversation } from './native-product-messages.ts';
import {
  node,
  until,
  click,
  field,
  submitWhenReady,
  page,
  textButton,
} from './native-product-dom.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';

function input(value: string): { peer: string; text: string } {
  const data = JSON.parse(value) as unknown;
  if (
    typeof data !== 'object' ||
    data === null ||
    !('peer' in data) ||
    !('text' in data) ||
    typeof data.peer !== 'string' ||
    typeof data.text !== 'string'
  )
    throw new Error('Expected a synthetic conversation and marker.');
  return { peer: data.peer, text: data.text };
}

async function search({ value, signal }: NativeActionInput): Promise<string> {
  const data = input(value);
  await openNativeConversation(data.peer, signal);
  click('[data-direct-conversation] [data-chat-back]');
  click('[data-open-search]');
  await until(
    () => !!document.querySelector('.conversation-search[open]'),
    signal,
  );
  try {
    field('#conversation-query', data.text);
    await submitWhenReady('.conversation-search form', signal);
    await until(
      () => {
        const found = [
          ...document.querySelectorAll('[data-search-messages] li'),
        ].some((item) => item.textContent?.includes(data.text));
        if (found) return true;
        const notice = node('[data-search-notice]').textContent ?? '';
        if (!node<HTMLDialogElement>('.conversation-search').open)
          throw new Error('The local search dialog closed before its result.');
        if (
          notice.startsWith('Busca concluída') ||
          (notice !== 'Buscando neste aparelho…' &&
            !notice.startsWith('Digite para') &&
            !notice.startsWith('Há mais histórico'))
        )
          throw new Error(
            'Local search did not return the expected message: ' +
              notice.slice(0, 120),
          );
        return false;
      },
      signal,
      'The decrypted local-message search result',
    );
    return 'The actual local search found the previously decrypted synthetic message.';
  } finally {
    click('[data-search-close]');
  }
}

async function openOptions(peer: string, signal: AbortSignal): Promise<void> {
  await openNativeConversation(peer, signal);
  click('[data-direct-conversation] [data-chat-back]');
  const row = [...document.querySelectorAll('.conversation-item')].find(
    (item) =>
      item.querySelector('.conversation-copy strong')?.textContent === peer,
  );
  const trigger = row?.querySelector<HTMLButtonElement>(
    '.conversation-menu-trigger',
  );
  if (!trigger || trigger.disabled)
    throw new Error('The synthetic conversation menu is unavailable.');
  trigger.click();
  await until(
    () => !!document.querySelector('.conversation-menu[open]'),
    signal,
  );
}

async function pin({ value, signal }: NativeActionInput): Promise<string> {
  await openOptions(value, signal);
  const initiallyPinned =
    node('[data-conversation-action=pin]').textContent === 'Desafixar';
  click('[data-conversation-action=pin]');
  await until(
    () => !node<HTMLButtonElement>('[data-message-refresh]').disabled,
    signal,
  );
  await openOptions(value, signal);
  if (
    node('[data-conversation-action=pin]').textContent !==
    (initiallyPinned ? 'Fixar' : 'Desafixar')
  )
    throw new Error('Conversation pin was not accepted.');
  textButton('.conversation-menu', 'Fechar');
  return JSON.stringify({ peer: value, initiallyPinned });
}

function pinState(value: string): { peer: string; initiallyPinned: boolean } {
  const data = JSON.parse(value) as unknown;
  if (
    typeof data !== 'object' ||
    data === null ||
    !('peer' in data) ||
    !('initiallyPinned' in data) ||
    typeof data.peer !== 'string' ||
    typeof data.initiallyPinned !== 'boolean'
  )
    throw new Error(
      'Expected the prior observed synthetic conversation setting.',
    );
  return { peer: data.peer, initiallyPinned: data.initiallyPinned };
}

async function pinCheck({ value, signal }: NativeActionInput): Promise<string> {
  const data = pinState(value);
  await openOptions(data.peer, signal);
  if (
    node('[data-conversation-action=pin]').textContent !==
    (data.initiallyPinned ? 'Fixar' : 'Desafixar')
  )
    throw new Error('Conversation pin did not persist.');
  click('[data-conversation-action=pin]');
  await until(
    () => !node<HTMLButtonElement>('[data-message-refresh]').disabled,
    signal,
  );
  await openOptions(data.peer, signal);
  if (
    node('[data-conversation-action=pin]').textContent !==
    (data.initiallyPinned ? 'Desafixar' : 'Fixar')
  )
    throw new Error('The original conversation setting was not restored.');
  textButton('.conversation-menu', 'Fechar');
  return 'The conversation pin persisted; its previously observed setting was restored.';
}

async function block({ value, signal }: NativeActionInput): Promise<string> {
  await openOptions(value, signal);
  click('[data-conversation-action=block]');
  await until(
    () => document.querySelector('[data-message-peer]')?.textContent !== value,
    signal,
  );
  await until(
    () => !node<HTMLButtonElement>('[data-message-refresh]').disabled,
    signal,
  );
  return blockCheck({ value, signal });
}

async function blockedList(signal: AbortSignal): Promise<void> {
  await page('contatos', '[data-contact-list=blocked]', signal);
  await until(
    () =>
      !node<HTMLButtonElement>('[data-contact-tab=main][data-tab=blocked]')
        .disabled &&
      node('[data-contact-status]').textContent === 'Contatos atualizados.',
    signal,
    'The synchronized contact controls and blocked list',
  );
  click('[data-contact-tab=main][data-tab=blocked]');
}

async function blockCheck({ signal }: NativeActionInput): Promise<string> {
  await blockedList(signal);
  await until(
    () =>
      document.querySelectorAll('[data-contact-list=blocked] .contact-row')
        .length === 1,
    signal,
  );
  if (document.querySelector('[data-contact-list=approved] .contact-row'))
    throw new Error('The blocked identity still has approved-contact access.');
  return 'The synthetic contact was blocked and appears in the actual blocked list.';
}

async function unblock({ signal }: NativeActionInput): Promise<string> {
  await blockedList(signal);
  await until(
    () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[data-contact-list=blocked] button',
        ),
      ].some(
        (button) => button.textContent === 'Desbloquear' && !button.disabled,
      ),
    signal,
  );
  textButton('[data-contact-list=blocked]', 'Desbloquear');
  await until(
    () =>
      node('[data-contact-status]').textContent?.startsWith(
        'Bloqueio removido.',
      ) === true,
    signal,
  );
  if (document.querySelector('[data-contact-list=approved] .contact-row'))
    throw new Error('Unblocking unexpectedly restored contact approval.');
  return 'Unblocking preserved the requirement for a new request and explicit approval.';
}

async function voice({ value, signal }: NativeActionInput): Promise<string> {
  await openNativeConversation(value, signal);
  const record = node<HTMLButtonElement>(
    '[data-direct-conversation] [data-voice-record]',
  );
  await until(
    () => !record.disabled,
    signal,
    'The available native recorder control',
  );
  record.dataset['nativeTestTap'] = 'voice-record';
  try {
    await until(
      () => {
        const status =
          node('[data-direct-conversation] [data-voice-status]').textContent ??
          '';
        if (status.startsWith('Gravação não iniciada:'))
          throw new Error(
            'Actual native microphone recording failed: ' + status,
          );
        return (
          (node('[data-direct-conversation] [data-voice-clock]').textContent ??
            '0:00') !== '0:00'
        );
      },
      signal,
      'Actual microphone samples in the native product recorder',
    );
    return 'The actual native microphone produced recording samples; audio delivery still requires separate evidence.';
  } finally {
    delete record.dataset['nativeTestTap'];
    const cancel = document.querySelector<HTMLButtonElement>(
      '[data-direct-conversation] [data-voice-cancel]',
    );
    if (cancel && !cancel.hidden && !cancel.disabled) cancel.click();
  }
}

export const conversationToolActions: ReadonlyMap<string, NativeAction> =
  new Map([
    ['message-search', search],
    ['conversation-pin', pin],
    ['conversation-pin-check', pinCheck],
    ['contact-block', block],
    ['contact-block-check', blockCheck],
    ['contact-unblock', unblock],
    ['voice-record', voice],
  ]);
