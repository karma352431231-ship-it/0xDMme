import {
  node,
  until,
  click,
  field,
  submit,
  expand,
  page,
} from './native-product-dom.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';

async function openPrivateProfile(signal: AbortSignal): Promise<void> {
  await until(
    () => !node<HTMLButtonElement>('[data-account-finish]').disabled,
    signal,
  );
  if (!node<HTMLElement>('[data-account-finish]').hidden) {
    click('[data-account-finish]');
    click('[data-wallet-brand=MetaMask]');
    click('[data-wallet=MetaMask]');
  }
  await until(() => {
    if (
      node('[data-account-status]').textContent ===
      'Diretório de dispositivos inválido.'
    )
      throw new Error('The product rejected its device directory.');
    return !node<HTMLElement>('[data-private-profile]').hidden;
  }, signal);
}

async function profileSave({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  await page('perfil', '[data-name-form]', signal);
  await until(() => !node<HTMLElement>('[data-profile]').hidden, signal);
  expand('account');
  await openPrivateProfile(signal);
  field('[name=display-name]', value);
  submit('[data-name-form]');
  await until(
    () => node<HTMLElement>('[data-profile-name]').textContent === value,
    signal,
  );
  await until(
    () => !node<HTMLButtonElement>('[data-preferences] button').disabled,
    signal,
  );
  const reminder = node<HTMLInputElement>('[name=backupReminder]');
  reminder.checked = false;
  reminder.dispatchEvent(new Event('change', { bubbles: true }));
  const receipts = node<HTMLInputElement>('[name=readReceipts]');
  receipts.checked = false;
  receipts.dispatchEvent(new Event('change', { bubbles: true }));
  submit('[data-preferences]');
  await until(
    () => node('[data-account-status]').textContent === 'Perfil salvo.',
    signal,
  );
  return 'Private name and privacy preferences saved through product forms.';
}

async function profileCheck({
  value,
  signal,
}: NativeActionInput): Promise<string> {
  await page('perfil', '[data-name-form]', signal);
  await until(() => node('[data-profile-name]').textContent === value, signal);
  expand('account');
  await until(
    () => !node<HTMLElement>('[data-private-profile]').hidden,
    signal,
  );
  if (
    node<HTMLInputElement>('[name=backupReminder]').checked ||
    node<HTMLInputElement>('[name=readReceipts]').checked
  )
    throw new Error('Private preferences did not persist.');
  return 'Private name and privacy preferences persisted.';
}

async function themeSave({ signal }: NativeActionInput): Promise<string> {
  await page('perfil', '[name=appearance-theme]', signal);
  expand('appearance');
  click('[name=appearance-theme][value=white]');
  await until(
    () => document.documentElement.dataset['theme'] === 'white',
    signal,
  );
  return 'White theme selected.';
}

async function themeCheck({ signal }: NativeActionInput): Promise<string> {
  if (document.documentElement.dataset['theme'] !== 'white')
    throw new Error('Theme did not persist.');
  await page('perfil', '[name=appearance-theme]', signal);
  expand('appearance');
  click('[name=appearance-theme][value=navy]');
  await until(
    () => document.documentElement.dataset['theme'] === 'navy',
    signal,
  );
  return 'Theme persisted; original blue theme restored.';
}

async function receiptPreference(
  signal: AbortSignal,
): Promise<HTMLInputElement> {
  await page('perfil', '[data-preferences]', signal);
  expand('account');
  await openPrivateProfile(signal);
  await until(
    () => !node<HTMLButtonElement>('[data-preferences] button').disabled,
    signal,
  );
  return node<HTMLInputElement>('[name=readReceipts]');
}

async function setReadReceipts(
  enabled: boolean,
  signal: AbortSignal,
): Promise<string> {
  const preference = await receiptPreference(signal);
  preference.checked = enabled;
  preference.dispatchEvent(new Event('change', { bubbles: true }));
  submit('[data-preferences]');
  await until(
    () => node('[data-account-status]').textContent === 'Perfil salvo.',
    signal,
  );
  return 'The explicit read-receipt preference was saved.';
}

async function readReceiptsEnabled({
  signal,
}: NativeActionInput): Promise<string> {
  if (!(await receiptPreference(signal)).checked)
    throw new Error('The explicit read-receipt opt-in did not persist.');
  return 'The explicit read-receipt opt-in persisted.';
}

export const profileActions: ReadonlyMap<string, NativeAction> = new Map([
  ['profile-save', profileSave],
  ['profile-check', profileCheck],
  ['theme-save', themeSave],
  ['theme-check', themeCheck],
  ['read-receipts-enable', ({ signal }) => setReadReceipts(true, signal)],
  ['read-receipts-restore', ({ signal }) => setReadReceipts(false, signal)],
  ['read-receipts-enabled', readReceiptsEnabled],
]);
