import { AccountError, keys, uuid } from '../../shared/account/index.ts';

/** At most 16 distinct co-members per read, like the device directory batch. */
export function groupMemberWalletsRequest(data: Record<string, unknown>) {
  keys(data, ['groupId', 'accounts']);
  const accounts = data['accounts'];
  if (!Array.isArray(accounts) || !accounts.length || accounts.length > 16)
    throw new AccountError(400, 'Invalid participant batch.');
  const ids = accounts.map((account: unknown) => uuid(account));
  if (new Set(ids).size !== ids.length)
    throw new AccountError(400, 'Duplicate participants.');
  return { groupId: uuid(data['groupId']), accounts: ids };
}
