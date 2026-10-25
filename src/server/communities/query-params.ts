import { AccountError } from '../../shared/account/index.ts';

/** Reject unknown or repeated fields before public community reads. */
export function requireCommunityParams(address: URL, allowed: string[]): void {
  if (
    [...address.searchParams.keys()].some(
      (key) =>
        !allowed.includes(key) || address.searchParams.getAll(key).length !== 1,
    )
  )
    throw new AccountError(400, 'Invalid filters.');
}
