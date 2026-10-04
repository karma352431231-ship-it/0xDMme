import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { groupKeys, groupPacket } from '../../shared/group-messages/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type { ContactAuthority, GroupMessageStore } from '../database/index.ts';

type DeliveryAction = (
  authority: ContactAuthority,
  data: Record<string, unknown>,
) => Promise<unknown>;
export const groupDeliveryOperations = [
  'group-message-publish',
  'group-message-page',
  'group-message-received',
  'group-message-usage',
  'group-profile',
  'group-message-recent',
  'group-message-accepted',
] as const;
function scope(
  data: Record<string, unknown>,
  fields: string[],
): { groupId: string; head: string } {
  keys(data, ['groupId', 'head', ...fields]);
  return { groupId: uuid(data['groupId']), head: fingerprint(data['head']) };
}
function receipts(value: unknown): { id: string; hash: string }[] {
  if (!Array.isArray(value) || value.length > 16)
    throw new AccountError(400, 'Lote de recebimento inválido.');
  const result = value.map((input: unknown) => {
    const data = object(input);
    keys(data, ['id', 'hash']);
    return { id: uuid(data['id']), hash: fingerprint(data['hash']) };
  });
  if (new Set(result.map((r) => r.id)).size !== result.length)
    throw new AccountError(400, 'Recebimentos duplicados.');
  return result;
}
export function groupDeliveryActions(
  store: GroupMessageStore,
): Record<string, DeliveryAction> {
  return {
    'group-message-publish': (a, d) => {
      keys(d, ['packet', 'keys']);
      return store.admit(a, {
        packet: groupPacket(d['packet']),
        keys: d['keys'] === null ? null : groupKeys(d['keys']),
      });
    },
    'group-message-page': (a, d) =>
      store.page(a, {
        ...scope(d, ['after']),
        after: integer(d['after'], Number.MAX_SAFE_INTEGER),
      }),
    'group-message-received': (a, d) =>
      store.received(a, {
        ...scope(d, ['items']),
        items: receipts(d['items']),
      }),
    'group-message-accepted': (a, d) =>
      store.acceptedPacket(a, {
        ...scope(d, ['id', 'hash']),
        id: uuid(d['id']),
        hash: fingerprint(d['hash']),
      }),
    'group-message-recent': (a, d) =>
      store.recent(a, {
        ...scope(d, ['before']),
        before:
          d['before'] === null
            ? null
            : integer(d['before'], Number.MAX_SAFE_INTEGER),
      }),
    'group-profile': (a, d) => store.profile(a, scope(d, [])),
    'group-message-usage': (a, d) => store.usage(a, scope(d, [])),
  };
}
