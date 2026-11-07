import {
  node,
  until,
  page,
  textButton,
  waitButton,
  labelledField,
} from './native-product-dom.ts';
import type { NativeAction, NativeActionInput } from './native-product-dom.ts';

export async function openPublicDm(
  handle: string,
  signal: AbortSignal,
): Promise<void> {
  if (!/^native(?:peer|sender)[0-9]+$/u.test(handle))
    throw new Error('Expected an existing synthetic public handle.');
  await page(`publico?handle=${handle}`, '.public-profile-actions', signal);
  await until(
    () =>
      [...document.querySelectorAll<HTMLAnchorElement>('a')].some(
        (link) =>
          link.textContent === 'Solicitar DM' &&
          link.hash.startsWith('#comunidades?view=dms&dm='),
      ),
    signal,
    'The actual public-profile DM link',
  );
  const link = [...document.querySelectorAll<HTMLAnchorElement>('a')].find(
    (item) =>
      item.textContent === 'Solicitar DM' &&
      item.hash.startsWith('#comunidades?view=dms&dm='),
  );
  if (!link) throw new Error('The synthetic public DM link is unavailable.');
  link.click();
  await until(
    () =>
      location.hash.startsWith('#comunidades?view=dms&dm=') &&
      document.querySelector('.community-card h2')?.textContent ===
        `DM com @${handle}`,
    signal,
    'The public DM conversation',
  );
}

async function request({ value, signal }: NativeActionInput): Promise<string> {
  await openPublicDm(value, signal);
  await waitButton('[data-communities]', 'Solicitar DM', signal);
  textButton('[data-communities]', 'Solicitar DM');
  await until(
    () =>
      node('[data-communities]').textContent?.includes('Aguardando aceite.') ===
      true,
    signal,
  );
  if (document.querySelector('[data-communities] textarea'))
    throw new Error('An unapproved DM exposed the message composer.');
  return 'The public DM requires the independent recipient approval before sending.';
}

async function accept({ value, signal }: NativeActionInput): Promise<string> {
  await openPublicDm(value, signal);
  await waitButton('[data-communities]', 'Aceitar DM', signal);
  textButton('[data-communities]', 'Aceitar DM');
  await until(
    () => !!document.querySelector('[data-communities] textarea'),
    signal,
  );
  return 'The independent public identity explicitly approved its DM.';
}

function payload(value: string): { handle: string; text: string } {
  const input = JSON.parse(value) as unknown;
  if (
    typeof input !== 'object' ||
    input === null ||
    !('handle' in input) ||
    !('text' in input) ||
    typeof input.handle !== 'string' ||
    typeof input.text !== 'string'
  )
    throw new Error('Expected a synthetic public peer and message.');
  return { handle: input.handle, text: input.text };
}

async function send({ value, signal }: NativeActionInput): Promise<string> {
  const input = payload(value);
  await openPublicDm(input.handle, signal);
  await waitButton('[data-communities]', 'Enviar mensagem', signal);
  labelledField('[data-communities]', 'Mensagem de texto', input.text);
  textButton('[data-communities]', 'Enviar mensagem');
  await until(
    () =>
      [...document.querySelectorAll('.social-dm-history article')].some(
        (row) =>
          row.querySelector('strong')?.textContent === 'Você' &&
          row.textContent?.includes(input.text),
      ),
    signal,
    'The accepted encrypted public DM',
  );
  return 'The public DM sender rendered its accepted encrypted message.';
}

async function receive({ value, signal }: NativeActionInput): Promise<string> {
  const input = payload(value);
  await openPublicDm(input.handle, signal);
  await until(
    () =>
      [...document.querySelectorAll('.social-dm-history article')].some(
        (row) =>
          row.querySelector('strong')?.textContent === 'Mensagem recebida' &&
          row.textContent?.includes(input.text),
      ),
    signal,
    'The independently decrypted public DM',
  );
  return 'The independent installed public identity decrypted the expected DM.';
}

export const socialActions: ReadonlyMap<string, NativeAction> = new Map([
  ['social-request', request],
  ['social-accept', accept],
  ['social-send', send],
  ['social-receive', receive],
]);
