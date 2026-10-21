import { supportsMessageDelta } from '../../shared/message-sync/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import { readMessageDelta } from './delta.ts';
import { messagePeer } from './index-sync.ts';
import type { Api, MessageItem } from './history.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';

interface DeltaView {
  id: string;
  hash: string;
  kind: string;
  peer: string;
  own: boolean;
  sequence?: number;
  relation?: MessageRelation;
}

/** A complete authenticated journal bridges the retained projection to the new
 * snapshot. Only changed visible packets are read; unchanged rows keep their
 * verified content. Publication and cursor advancement belong to final confirm. */
export async function readIncrementalWindow<T extends DeltaView>(input: {
  candidate: { snapshot: string; views: T[] } | null;
  snapshot: unknown;
  account: string;
  peer: string | null;
  before: number | null;
  api: Api;
  remove: (item: MessageItem) => Promise<void>;
  read: (items: MessageItem[]) => Promise<T[]>;
  delivery: (views: T[]) => Promise<T[]>;
}) {
  if (!input.candidate || !eligible(input)) return null;
  const from: unknown = JSON.parse(input.candidate.snapshot);
  if (canonical(from) === canonical(input.snapshot)) return null;
  const items = await readMessageDelta(input.api, from, input.snapshot);
  if (items === null) return null;
  // Validate all removals, including other conversations, before any projection
  // or cache can move to this account snapshot.
  for (const item of items) {
    messagePeer(input.account, item);
    if (item.deleted) await input.remove(item);
  }
  const changes = items.filter(
    (item) => messagePeer(input.account, item) === input.peer,
  );
  const retained = retainedRows(input.candidate.views, changes);
  const selected = selectWindow(retained, changes, input.account);
  if (selected === null) return null;
  const ids = new Set(selected.map((view) => view.id));
  const changed = changes.filter((item) => !item.deleted && ids.has(item.id));
  const opened = await input.read(changed);
  if (opened.length !== changed.length)
    throw new Error('Message pagination does not match.');
  const views = [
    ...retained.filter((view) => ids.has(view.id)),
    ...(await input.delivery(opened)),
  ].sort(compareSequence);
  return { views, from, changes: items };
}

function selectWindow(
  views: DeltaView[],
  changes: MessageItem[],
  account: string,
) {
  return boundWindow([
    ...views,
    ...changes
      .filter((item) => !item.deleted)
      .map((item) => ({
        id: item.id,
        hash: item.hash,
        kind: item.kind,
        peer: messagePeer(account, item),
        own: item.sender === account,
        sequence: item.sequence,
        ...(item.relation ? { relation: item.relation } : {}),
      })),
  ]);
}

function compareSequence(a: DeltaView, b: DeltaView): number {
  return (a.sequence ?? 0) - (b.sequence ?? 0) || a.id.localeCompare(b.id);
}

function isRoot(row: { kind: string; relation?: MessageRelation }): boolean {
  return row.kind !== 'profile' && !row.relation;
}

function retainedRows<T extends DeltaView>(
  views: T[],
  changes: MessageItem[],
): T[] {
  const changed = new Map(changes.map((item) => [item.id, item]));
  for (const view of views) {
    const item = changed.get(view.id);
    if (item && item.hash !== view.hash)
      throw new Error('Message differs from validated history.');
  }
  return views.filter(
    (view) =>
      !changed.has(view.id) &&
      !(view.relation && changed.get(view.relation.id)?.deleted),
  );
}

function boundWindow<T extends DeltaView>(views: T[]): T[] | null {
  const ordered = views.sort(compareSequence);
  const roots = new Set(
    ordered
      .filter(isRoot)
      .slice(-16)
      .map((view) => view.id),
  );
  const profiles = new Map<boolean, T>();
  for (const view of ordered)
    if (view.kind === 'profile') profiles.set(view.own, view);
  const result = ordered.filter((view) =>
    view.kind === 'profile'
      ? profiles.get(view.own) === view
      : roots.has(view.relation?.id ?? view.id),
  );
  // Preserve the existing relation-window contract; never silently drop actions.
  return result.filter((view) => view.relation).length > 48 ? null : result;
}

function eligible(input: {
  peer: string | null;
  before: number | null;
  snapshot: unknown;
}): boolean {
  return (
    input.peer !== null &&
    input.before === null &&
    supportsMessageDelta(input.snapshot)
  );
}
