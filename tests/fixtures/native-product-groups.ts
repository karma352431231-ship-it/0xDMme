import {
  node,
  until,
  click,
  field,
  submit,
  submitWhenReady,
  page,
  textButton,
  waitButton,
} from './native-product-dom.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';
import { prepareNativeMessages } from './native-product-messages.ts';

interface GroupInput {
  title: string;
  peer: string;
  text: string;
}
function groupInput(value: string): GroupInput {
  const raw = JSON.parse(value) as unknown;
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('title' in raw) ||
    !('peer' in raw) ||
    !('text' in raw) ||
    typeof raw.title !== 'string' ||
    typeof raw.peer !== 'string' ||
    typeof raw.text !== 'string'
  )
    throw new Error('Expected a synthetic group, peer and text.');
  return { title: raw.title, peer: raw.peer, text: raw.text };
}

async function groupDirectory(signal: AbortSignal): Promise<void> {
  await prepareNativeMessages(signal);
  await page('conversas', '[data-conversation-filter=groups]', signal);
  click('[data-conversation-filter=groups]');
  await until(
    () => !node<HTMLButtonElement>('[data-group-new]').disabled,
    signal,
  );
}

function groupRow(title: string): HTMLButtonElement | undefined {
  return [
    ...document.querySelectorAll<HTMLButtonElement>(
      '[data-message-contacts] [data-conversation]',
    ),
  ].find((row) => row.querySelector('strong')?.textContent === title);
}

async function openGroup(title: string, signal: AbortSignal): Promise<void> {
  await groupDirectory(signal);
  await until(() => !!groupRow(title), signal);
  groupRow(title)?.click();
  await until(
    () =>
      node('[data-group-title]').textContent === title &&
      !node<HTMLTextAreaElement>('[data-group-text]').disabled,
    signal,
  );
}

function groupText(text: string, own: boolean): HTMLElement | undefined {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '[data-group-history] [data-group-message]',
    ),
  ].find(
    (row) =>
      row.classList.contains('own') === own &&
      row.querySelector(':scope > p')?.textContent === text,
  );
}

async function createGroup({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  await groupDirectory(signal);
  click('[data-group-new]');
  field('[data-group-name]', value);
  submit('[data-group-create]');
  await until(
    () =>
      document.querySelector('[data-group-title]')?.textContent === value &&
      document.querySelector('[data-group-notice]')?.textContent ===
        'Grupo criado.',
    signal,
  );
  return 'The new group opened on the first creation attempt.';
}

async function inviteGroup({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = groupInput(value);
  await openGroup(input.title, signal);
  for (const details of document.querySelectorAll<HTMLDetailsElement>(
    '[data-group-conversation] .chat-options, [data-group-conversation] .group-options > details',
  ))
    details.open = true;
  await until(
    () =>
      [...node<HTMLSelectElement>('[data-group-invite-target]').options].some(
        (option) => option.textContent === input.peer,
      ),
    signal,
  );
  const select = node<HTMLSelectElement>('[data-group-invite-target]');
  select.value =
    [...select.options].find((option) => option.textContent === input.peer)
      ?.value ?? '';
  await waitButton('[data-group-invite]', 'Enviar convite', signal);
  submit('[data-group-invite]');
  await until(
    () =>
      node('[data-group-notice]').textContent?.includes('Convite enviado.') ===
      true,
    signal,
  );
  return 'An approved contact received the group invitation.';
}

async function acceptGroup({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = groupInput(value);
  await groupDirectory(signal);
  node<HTMLDetailsElement>('[data-group-incoming]')
    .closest('details')
    ?.setAttribute('open', '');
  await waitButton('[data-group-incoming]', 'Entrar no grupo', signal);
  const invitations = node('[data-group-incoming]').children;
  if (
    invitations.length !== 1 ||
    !invitations[0]?.textContent?.includes(input.peer)
  )
    throw new Error(
      'Expected exactly the independent synthetic group invitation.',
    );
  textButton('[data-group-incoming]', 'Entrar no grupo');
  await until(
    () =>
      node('[data-group-title]').textContent === input.title &&
      node('[data-group-count]').textContent === '2 participantes',
    signal,
  );
  return 'The recipient explicitly joined the two-member encrypted group.';
}

async function sendGroup({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = groupInput(value);
  await openGroup(input.title, signal);
  field('[data-group-text]', input.text);
  await submitWhenReady('[data-group-compose]', signal);
  await until(
    () =>
      !!groupText(input.text, true)?.querySelector('.message-checks') &&
      !node<HTMLButtonElement>('[data-group-new]').disabled,
    signal,
    'The accepted outgoing group message',
  );
  const id = groupText(input.text, true)?.dataset['groupMessage'];
  if (!id)
    throw new Error('The accepted outgoing group message has no identity.');
  return id;
}

async function checkGroup({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  await openGroup(value, signal);
  await until(
    () => node('[data-group-count]').textContent === '2 participantes',
    signal,
    'The restored two-member group',
  );
  return 'The original two-member group and its private title opened in this installation.';
}

async function receiveGroup({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const input = groupInput(value);
  await openGroup(input.title, signal);
  await until(() => !!groupText(input.text, false), signal);
  const id = groupText(input.text, false)?.dataset['groupMessage'];
  if (!id) throw new Error('The decrypted group message has no identity.');
  return id;
}

export const groupActions: ReadonlyMap<string, NativeAction> = new Map([
  ['group-create', createGroup],
  ['group-invite', inviteGroup],
  ['group-accept', acceptGroup],
  ['group-check', checkGroup],
  ['group-send', sendGroup],
  ['group-receive', receiveGroup],
]);
