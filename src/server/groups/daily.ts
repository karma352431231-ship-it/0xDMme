import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type { ContactAuthority, GroupDailyStore } from '../database/index.ts';
export const groupDailyOperations = [
  'group-daily-state',
  'group-daily-states',
  'group-daily-mute',
  'group-daily-read',
  'group-daily-receipts',
] as const;
function ids(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > 16)
    throw new AccountError(400, 'Lote de mensagens inválido.');
  const result = input.map(uuid);
  if (new Set(result).size !== result.length)
    throw new AccountError(400, 'Mensagens repetidas.');
  return result;
}
export function groupDailyActions(
  store: GroupDailyStore | null,
): Record<
  string,
  (a: ContactAuthority, d: Record<string, unknown>) => Promise<unknown>
> {
  function available(): GroupDailyStore {
    if (!store)
      throw new AccountError(503, 'Controles do grupo indisponíveis.');
    return store;
  }
  const scope = (d: Record<string, unknown>) => ({
    groupId: uuid(d['groupId']),
    head: fingerprint(d['head']),
  });
  return {
    'group-daily-states': (a, d) => {
      keys(d, ['groups']);
      if (!Array.isArray(d['groups']) || d['groups'].length > 16)
        throw new AccountError(400, 'Lote de grupos inválido.');
      const values: unknown[] = d['groups'];
      return available().states(
        a,
        values.map((input) => {
          const row = object(input);
          keys(row, ['groupId', 'head']);
          return scope(row);
        }),
      );
    },
    'group-daily-state': (a, d) => {
      keys(d, ['groupId', 'head']);
      return available().state(a, scope(d));
    },
    'group-daily-mute': (a, d) => {
      keys(d, ['groupId', 'head', 'revision', 'mutedUntil']);
      return available().mute(a, {
        ...scope(d),
        revision: integer(d['revision'], Number.MAX_SAFE_INTEGER),
        mutedUntil: integer(d['mutedUntil'], Number.MAX_SAFE_INTEGER),
      });
    },
    'group-daily-read': (a, d) => {
      keys(d, ['groupId', 'head', 'ids']);
      return available().read(a, { ...scope(d), ids: ids(d['ids']) });
    },
    'group-daily-receipts': (a, d) => {
      keys(d, ['groupId', 'head', 'ids']);
      return available().receipts(a, { ...scope(d), ids: ids(d['ids']) });
    },
  };
}
