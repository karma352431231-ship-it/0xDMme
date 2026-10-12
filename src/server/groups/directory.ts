import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { revision } from '../../shared/contacts/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';

export function groupDirectoryRequest(data: Record<string, unknown>) {
  keys(data, ['groupId', 'head', 'accounts']);
  if (
    !Array.isArray(data['accounts']) ||
    !data['accounts'].length ||
    data['accounts'].length > 16
  )
    throw new AccountError(400, 'Lote de participantes inválido.');
  const accounts = data['accounts'].map((input: unknown) => {
    const row = object(input);
    keys(row, ['accountId', 'after']);
    return { accountId: uuid(row['accountId']), after: revision(row['after']) };
  });
  if (new Set(accounts.map((r) => r.accountId)).size !== accounts.length)
    throw new AccountError(400, 'Participantes repetidos.');
  return {
    groupId: uuid(data['groupId']),
    head: fingerprint(data['head']),
    accounts,
  };
}
