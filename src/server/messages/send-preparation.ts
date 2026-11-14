import { keys, uuid } from '../../shared/account/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type { Database } from '../database/index.ts';
import type { MessageAction } from './operation.ts';

export function sendPreparationAction(
  recovery: Database['messageRecovery'],
): MessageAction {
  return (authority, data) => {
    keys(data, ['accountId', 'after']);
    return recovery.sendPreparation(authority, {
      accountId: uuid(data['accountId']),
      after: integer(data['after'], 128),
    });
  };
}
