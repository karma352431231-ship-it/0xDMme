import { canonical } from '../../shared/devices/index.ts';
import { readMessageDelta } from './delta.ts';
import { messageItems } from './history.ts';
import type { Api } from './history.ts';
import { assertMessagePage } from './index-sync.ts';
import type { MessagePrefetch } from './index-sync.ts';

/** Choose a bounded source without committing progress before verification. */
export async function readPrefetchPage(api: Api, prefetch: MessagePrefetch) {
  const snapshot = await api('snapshot', {}),
    from = prefetch.completedSnapshot;
  const changed =
    from && canonical(from) !== canonical(snapshot)
      ? await readMessageDelta(api, from, snapshot)
      : null;
  if (changed !== null)
    return {
      snapshot,
      from,
      delta: true,
      after: 0,
      page: { items: changed, next: null },
    };
  const after = prefetch.cursor(snapshot);
  if (after === null) return null;
  const page = messageItems(await api('page', { snapshot, after }));
  assertMessagePage(page, after);
  return { snapshot, from, delta: false, after, page };
}
