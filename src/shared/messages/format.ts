import { AccountError, base64, boundedText, uuid } from '../account/index.ts';
import { blockLimit } from '../vault/index.ts';

/** Matrix's standard room-key backup; not an exported Olm device identity. */
export function matrixBase64(value: unknown, bytes: number): string {
  const text = boundedText(value, Math.ceil((bytes * 4) / 3));
  if (!/^[A-Za-z0-9+/]+$/u.test(text))
    throw new AccountError(400, 'Invalid Matrix key.');
  const padded = text.padEnd(Math.ceil(text.length / 4) * 4, '=');
  const decoded = base64(padded, bytes);
  // base64 already checks the canonical padded encoding. The input forbids '='.
  if (decoded.length !== bytes)
    throw new AccountError(400, 'Matrix key is not canonical.');
  return text;
}
export function matrixCiphertext(
  input: unknown,
  maximum = blockLimit * 2,
): string {
  const text = boundedText(input, Math.ceil((maximum * 4) / 3));
  if (!/^[A-Za-z0-9+/]+$/u.test(text))
    throw new AccountError(400, 'Invalid Matrix ciphertext.');
  const decoded = base64(
    text.padEnd(Math.ceil(text.length / 4) * 4, '='),
    maximum,
  );
  if (!decoded.length)
    throw new AccountError(400, 'Matrix ciphertext is not canonical.');
  return text;
}
export function matrixUser(accountId: string): string {
  return `@${uuid(accountId)}:0xdmme.app`;
}
export function messageRoom(a: string, b: string): string {
  const ids = [uuid(a), uuid(b)].sort();
  if (a === b)
    throw new AccountError(400, 'A conversation requires two accounts.');
  return `!${ids.join('_')}:0xdmme.app`;
}
