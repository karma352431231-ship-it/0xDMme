import { AccountError } from '../../shared/account/index.ts';
import { ApiResponseError } from '../api-response/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';

/** A send must leave its current turn and reacquire verified own authority. */
export class OwnDirectoryRequired extends Error {
  readonly code = 'fresh-own-directory-required';
  constructor() {
    super('Fresh device verification is required before continuing this send.');
  }
}
/** These refusals occur before accepting work under the supplied own authority. */
export function ownDirectoryRejected(error: unknown): boolean {
  if (!(error instanceof AccountError)) return false;
  const reason =
    error instanceof ApiResponseError ? error.reason : error.message;
  if (error.status === 409)
    return reason === 'Device authorization changed. Check again.';
  return (
    error.status === 403 &&
    [
      'Device has no current authorization.',
      'Device not authorized for the vault.',
    ].includes(reason)
  );
}

/** Full preparation can distribute keys and therefore needs a fresh observation. */
export function requireFreshOwnDirectory(authority: VaultAuthority): void {
  if (authority.reusedOwnDirectory) throw new OwnDirectoryRequired();
}
