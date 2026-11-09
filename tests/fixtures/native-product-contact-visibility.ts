import {
  expand,
  field,
  node,
  page,
  submitWhenReady,
  until,
} from './native-product-dom.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';

type ContactMode = 'invite' | 'wallet' | 'contacts';

function contactMode(value: string): ContactMode {
  if (value !== 'invite' && value !== 'wallet' && value !== 'contacts')
    throw new Error('Invalid observed contact visibility mode.');
  return value;
}

async function privacyForm(signal: AbortSignal): Promise<ContactMode> {
  await page('perfil', '[data-contact-settings]', signal);
  expand('privacy');
  await until(
    () => !node<HTMLButtonElement>('[data-contact-settings] button').disabled,
    signal,
    'The loaded contact visibility form',
  );
  return contactMode(node<HTMLSelectElement>('[data-contact-mode]').value);
}

async function saveMode(mode: ContactMode, signal: AbortSignal): Promise<void> {
  field('[data-contact-mode]', mode);
  await submitWhenReady('[data-contact-settings]', signal);
  await until(
    () =>
      node('[data-contact-status]').textContent?.startsWith(
        'Visibilidade aplicada',
      ) === true,
    signal,
    'The accepted contact visibility change',
  );
}

async function privacySave({ signal }: NativeActionInput): Promise<string> {
  await privacyForm(signal);
  await saveMode('contacts', signal);
  return 'Contact requests restricted to approved contacts through the actual privacy form.';
}

async function privacyCheck({ signal }: NativeActionInput): Promise<string> {
  if ((await privacyForm(signal)) !== 'contacts')
    throw new Error('Contact privacy did not persist.');
  await saveMode('invite', signal);
  return 'Contact privacy persisted; original invitation-only mode restored.';
}

async function prepareDiscovery({
  signal,
}: NativeActionInput): Promise<string> {
  const previous = await privacyForm(signal);
  await saveMode('wallet', signal);
  return previous;
}

async function restoreDiscovery({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  const previous = contactMode(value);
  await privacyForm(signal);
  await saveMode(previous, signal);
  return 'The exact previously observed contact visibility mode was restored.';
}

/** Owns actual contact-visibility forms and restoration, not conversation state. */
export const contactVisibilityActions: ReadonlyMap<string, NativeAction> =
  new Map([
    ['contact-privacy-save', privacySave],
    ['contact-privacy-check', privacyCheck],
    ['contact-discovery-prepare', prepareDiscovery],
    ['contact-discovery-restore', restoreDiscovery],
  ]);
