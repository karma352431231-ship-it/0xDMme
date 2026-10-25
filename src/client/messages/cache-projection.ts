import type { MessageItem } from './history.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';
import { relationBudget, windowRoots } from '../history-window/index.ts';
import type { HistoryFloor } from '../history-window/index.ts';
interface CachedView {
  id: string;
  hash: string;
  peer: string;
  sequence?: number;
  relation?: MessageRelation;
  kind: string;
  own: boolean;
}

/** Immutable packet identities plus authenticated removals update a retained
 * window; older actions never resurrect a removed root during replay. The
 * window keeps the conversation's floor (history-window). */
export function projectCachedConversation<T extends CachedView>(
  previous: T[],
  items: MessageItem[],
  incoming: T[],
  floor: HistoryFloor = null,
): T[] {
  const changes = new Map(items.map((item) => [item.id, item]));
  for (const view of previous) {
    const item = changes.get(view.id);
    if (item && item.hash !== view.hash)
      throw new Error('Message differs from validated history.');
  }
  const removed = new Set(
    items.filter((item) => item.deleted).map((item) => item.id),
  );
  const rows = new Map(
    previous
      .filter(
        (view) =>
          !changes.has(view.id) && !removed.has(view.relation?.id ?? ''),
      )
      .map((view) => [view.id, view]),
  );
  for (const view of incoming) {
    if (!removed.has(view.id) && !removed.has(view.relation?.id ?? ''))
      rows.set(view.id, view);
  }
  return boundWindow(
    [...rows.values()].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
    floor,
  );
}

function boundWindow<T extends CachedView>(
  ordered: T[],
  floor: HistoryFloor,
): T[] {
  const roots = new Set(
    windowRoots(
      ordered.filter((row) => row.kind !== 'profile' && !row.relation),
      floor,
      (row) => row.sequence,
    ).map((row) => row.id),
  );
  const profiles = new Map(
    ordered
      .filter((row) => row.kind === 'profile')
      .map((row) => [row.own, row.id]),
  );
  const bounded = ordered.filter((row) =>
    row.kind === 'profile'
      ? profiles.get(row.own) === row.id
      : roots.has(row.relation?.id ?? row.id),
  );
  if (bounded.filter((row) => row.relation).length > relationBudget(roots.size))
    throw new Error('Message relation window exceeds its verified budget.');
  return bounded;
}

/** Profile bodies stay in the encrypted profile store after verification. */
export function retainedMessageView<T extends { kind?: string; text: string }>(
  view: T,
): T {
  return view.kind === 'profile' ? { ...view, text: '' } : view;
}
