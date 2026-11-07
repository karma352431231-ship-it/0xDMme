import {
  node,
  until,
  click,
  field,
  submit,
  page,
  textButton,
} from './native-product-dom.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';

async function inviteCreate({ signal }: NativeActionInput): Promise<string> {
  await page('contatos', '[data-contact-own-open]', signal);
  await until(
    () => !node<HTMLButtonElement>('[data-contact-own-open]').disabled,
    signal,
  );
  click('[data-contact-own-open]');
  await until(
    () => !node<HTMLButtonElement>('[data-contact-action=rotate]').disabled,
    signal,
  );
  if (!node<HTMLInputElement>('[data-contact-invite]').value)
    click('[data-contact-action=rotate]');
  await until(
    () =>
      node<HTMLInputElement>('[data-contact-invite]').value.startsWith(
        'https://0xdmme.app/',
      ),
    signal,
  );
  return node<HTMLInputElement>('[data-contact-invite]').value;
}

async function inviteRequest({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  if (!value.startsWith('https://0xdmme.app/#contatos?'))
    throw new Error('Expected the canonical synthetic invitation.');
  await openNativeInvitationEditor(signal);
  field('[data-contact-received]', value);
  submit('[data-contact-invite-form]');
  await until(
    () =>
      node('[data-contact-status]').textContent?.includes('enviada') === true,
    signal,
  );
  return 'Contact request submitted through the invitation form.';
}

/** Opens the actual invitation dialog after the contact refresh releases its controls. */
export async function openNativeInvitationEditor(
  signal: AbortSignal,
): Promise<void> {
  await page('contatos', '[data-contact-add]', signal);
  await until(
    () => !node<HTMLButtonElement>('[data-contact-add]').disabled,
    signal,
  );
  click('[data-contact-add]');
  click('[data-contact-tab=editor][data-tab=invite]');
  await until(
    () =>
      !node<HTMLButtonElement>('[data-contact-action="scan"]').disabled &&
      node('[data-contact-action="scan"]').getClientRects().length > 0,
    signal,
  );
}

async function requestByWallet({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  if (!/^0x[a-f0-9]{40}$/u.test(value))
    throw new Error('Expected the exact synthetic EVM address.');
  await page('contatos', '[data-contact-add]', signal);
  await until(
    () => !node<HTMLButtonElement>('[data-contact-add]').disabled,
    signal,
  );
  click('[data-contact-add]');
  click('[data-contact-tab=editor][data-tab=wallet]');
  field('[data-book-address]', value);
  click('[data-contact-action=discover]');
  await until(
    () =>
      node('[data-contact-status]').textContent?.startsWith(
        'Solicitação enviada.',
      ) === true,
    signal,
    'The real exact-wallet contact request',
  );
  return 'Exact-wallet discovery submitted a contact request through the public form.';
}

function approvedPeer(name: string): HTMLElement | undefined {
  return [
    ...document.querySelectorAll<HTMLElement>(
      '[data-contact-list=approved] .contact-row',
    ),
  ].find((row) => row.querySelector('strong')?.textContent === name);
}

async function inviteAccept({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  await page('contatos', '[data-contact-list=incoming]', signal);
  await until(
    () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[data-contact-list=incoming] button',
        ),
      ].some((button) => button.textContent === 'Aceitar' && !button.disabled),
    signal,
  );
  click('[data-contact-tab=main][data-tab=requests]');
  const rows = [
    ...node('[data-contact-list=incoming]').querySelectorAll('.contact-row'),
  ];
  if (
    rows.length !== 1 ||
    rows[0]?.querySelector('strong')?.textContent !== value
  )
    throw new Error('Expected exactly the independent synthetic sender.');
  textButton('[data-contact-list=incoming]', 'Aceitar');
  await until(() => !!approvedPeer(value), signal);
  return 'The independent synthetic sender was explicitly approved.';
}

export async function openNativeContact(
  name: string,
  signal: AbortSignal,
): Promise<void> {
  await page('contatos', '[data-contact-list=approved]', signal);
  await until(() => {
    const button =
      approvedPeer(name)?.querySelector<HTMLButtonElement>('.primary');
    return !!button && !button.disabled;
  }, signal);
  click('[data-contact-tab=main][data-tab=approved]');
  const row = approvedPeer(name);
  const button = row?.querySelector<HTMLButtonElement>('.primary');
  if (!button || button.textContent !== 'Conversar' || button.disabled)
    throw new Error('The approved conversation is unavailable.');
  button.click();
  await until(
    () => document.querySelector('[data-message-peer]')?.textContent === name,
    signal,
  );
}

export const contactActions: ReadonlyMap<string, NativeAction> = new Map([
  ['invite-create', inviteCreate],
  ['invite-request', inviteRequest],
  ['contact-wallet-request', requestByWallet],
  ['invite-accept', inviteAccept],
]);
