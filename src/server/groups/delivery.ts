import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { groupKeys, groupPacket } from '../../shared/group-messages/index.ts';
import type { MessageProof } from '../../shared/messages/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type { ContactAuthority, GroupMessageStore } from '../database/index.ts';

type DeliveryAction = (
  authority: ContactAuthority,
  data: Record<string, unknown>,
  proof?: MessageProof,
) => Promise<unknown>;
export const groupDeliveryOperations = [
  'group-message-snapshot',
  'group-message-confirm',
  'group-message-index',
  'group-message-changes',
  'group-message-objects',
  'group-message-relations',
  'group-message-delete',
  'group-message-available',
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
function messageScope(d: Record<string, unknown>, fields: string[]) {
  return {
    ...scope(d, ['revision', ...fields]),
    revision: integer(d['revision'], Number.MAX_SAFE_INTEGER),
  };
}
function messageIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 16)
    throw new AccountError(400, 'Lote de mensagens inválido.');
  const ids = value.map(uuid);
  if (new Set(ids).size !== ids.length)
    throw new AccountError(400, 'Mensagens duplicadas.');
  return ids;
}
export function groupDeliveryActions(
  store: GroupMessageStore,
): Record<string, DeliveryAction> {
  return {
    'group-message-available': (a, d) =>
      store.updates.available(a, {
        ...scope(d, ['id', 'hash']),
        id: uuid(d['id']),
        hash: fingerprint(d['hash']),
      }),
    'group-message-snapshot': (a, d) => store.updates.snapshot(a, scope(d, [])),
    'group-message-confirm': (a, d) =>
      store.updates.confirm(a, messageScope(d, [])),
    'group-message-index': (a, d) =>
      store.updates.index(a, {
        ...messageScope(d, ['after']),
        after: integer(d['after'], Number.MAX_SAFE_INTEGER),
      }),
    'group-message-changes': (a, d) =>
      store.updates.changes(a, {
        ...messageScope(d, ['from', 'after']),
        from: integer(d['from'], Number.MAX_SAFE_INTEGER),
        after: integer(d['after'], Number.MAX_SAFE_INTEGER),
      }),
    'group-message-objects': (a, d) =>
      store.objects(a, {
        ...messageScope(d, ['ids']),
        ids: messageIds(d['ids']),
      }),
    'group-message-relations': (a, d) =>
      store.relations(a, {
        ...messageScope(d, ['ids']),
        ids: messageIds(d['ids']),
      }),
    'group-message-delete': async (a, d, proof) => {
      const input = {
        ...scope(d, ['id', 'hash', 'revision']),
        id: uuid(d['id']),
        hash: fingerprint(d['hash']),
      };
      integer(d['revision'], 128);
      if (!proof) throw new AccountError(403, 'Prova de exclusão ausente.');
      await store.updates.remove(a, input, proof);
      return { status: 'saved' };
    },
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
