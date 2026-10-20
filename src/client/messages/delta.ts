import { object } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import { messageItems } from './history.ts';
import type { Api, MessageItem } from './history.ts';

/** Current authenticated metadata only. Missing history requires an explicit
 * full reset; partial, mismatched or duplicate responses never advance a cursor. */
export async function readMessageDelta(
  api: Api,
  from: unknown,
  snapshot: unknown,
): Promise<MessageItem[] | null> {
  const value = object(await api('changes', { from, snapshot }));
  if (value['reset'] === true) return null;
  if (
    value['reset'] !== false ||
    canonical(value['from']) !== canonical(from) ||
    canonical(value['snapshot']) !== canonical(snapshot)
  )
    throw new Error('Changes belong to another snapshot.');
  const page = messageItems(
    { items: value['items'], next: value['next'] },
    256,
  );
  if (
    page.next !== null ||
    new Set(page.items.map((item) => item.id)).size !== page.items.length
  )
    throw new Error('Incomplete or duplicate changes.');
  return page.items;
}
