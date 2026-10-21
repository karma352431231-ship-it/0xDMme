import { WorkInterruption } from '../synchronization-work/index.ts';
import { object, uuid } from '../../shared/account/index.ts';
import { canonical, fingerprint } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { groupEditRelation } from '../../shared/group-messages/index.ts';
import { applyGroupRemovals } from './removals.ts';
import type { GroupRemovalItem } from './removals.ts';
import type { GroupReadContext } from './reader.ts';
export interface Snapshot {
  groupId: string;
  head: string;
  directory: string;
  revision: number;
}
export interface IndexItem extends GroupRemovalItem {
  deleted: boolean;
}
type ReadContext = Omit<GroupReadContext, 'machine'> & { indexPages?: number };
interface Progress {
  key: string;
  after: number;
  items: IndexItem[];
  from: number | null;
  complete: boolean;
}
export class IncompleteGroupIndex extends WorkInterruption {
  constructor() {
    super('continuation');
  }
}
export class GroupMessageIndex {
  private readonly progress = new Map<string, Progress>();
  clear(groupId?: string): void {
    if (groupId) this.progress.delete(groupId);
    else this.progress.clear();
  }
  confirmed(snapshot: Snapshot): void {
    this.progress.delete(snapshot.groupId);
  }
  async read(
    c: ReadContext,
    snapshot: Snapshot,
    from: Snapshot | null,
  ): Promise<IndexItem[] | null> {
    if (from?.revision === snapshot.revision) return [];
    const key = canonical([snapshot, c.authority.session.accountId]);
    const progress = this.start(snapshot.groupId, key, from),
      deadline = Date.now() + 45000;
    if (progress.complete) return this.result(progress);
    for (
      let page = 0;
      page < (c.indexPages ?? 8) && Date.now() < deadline;
      page++
    ) {
      if (!(await this.page(c, snapshot, progress))) continue;
      progress.complete = true;
      return this.result(progress);
    }
    throw new IncompleteGroupIndex();
  }
  private result(progress: Progress): IndexItem[] | null {
    return progress.from === null
      ? null
      : [...new Map(progress.items.map((item) => [item.id, item])).values()];
  }
  private start(groupId: string, key: string, from: Snapshot | null): Progress {
    const existing = this.progress.get(groupId);
    if (existing?.key === key) return existing;
    const revision = from?.revision ?? null;
    const progress = {
      key,
      after: revision ?? 0,
      from: revision,
      items: [],
      complete: false,
    };
    this.progress.delete(groupId);
    this.progress.set(groupId, progress);
    while (this.progress.size > 16)
      this.progress.delete(this.progress.keys().next().value!);
    return progress;
  }
  private trim(current: string): void {
    let total = [...this.progress.values()].reduce(
      (sum, progress) => sum + progress.items.length,
      0,
    );
    for (const [id, progress] of this.progress) {
      if (total <= 256) break;
      if (id === current) continue;
      this.progress.delete(id);
      total -= progress.items.length;
    }
  }
  private async page(
    c: ReadContext,
    snapshot: Snapshot,
    progress: Progress,
  ): Promise<boolean> {
    const full = progress.from === null;
    const raw = object(
      await c.api(full ? 'group-message-index' : 'group-message-changes', {
        ...wire(snapshot),
        after: progress.after,
        ...(full ? {} : { from: progress.from }),
      }),
    );
    if (raw['reset'] === true) {
      progress.from = null;
      progress.after = 0;
      progress.items = [];
      return false;
    }
    assertDelta(raw, progress, snapshot);
    const items = readIndex(raw, c);
    await applyGroupRemovals(
      { ...c, groupId: snapshot.groupId, head: snapshot.head },
      items,
    );
    const next = readCursor(raw, { progress, snapshot, items });
    appendChanges(progress, items);
    this.trim(snapshot.groupId);
    if (next === null) return true;
    progress.after = next;
    return false;
  }
}
function assertDelta(
  raw: Record<string, unknown>,
  progress: Progress,
  snapshot: Snapshot,
): void {
  if (progress.from === null) return;
  if (
    raw['reset'] !== false ||
    raw['from'] !== progress.from ||
    raw['revision'] !== snapshot.revision
  )
    throw new Error('Group change set mismatch.');
}
export async function currentGroupSnapshot(c: ReadContext): Promise<Snapshot> {
  const snapshot = readSnapshot(
    await c.api('group-message-snapshot', {
      groupId: c.group.state.groupId,
      head: c.group.head,
    }),
  );
  if (
    snapshot.groupId !== c.group.state.groupId ||
    snapshot.head !== c.group.head ||
    snapshot.directory !== c.authority.directory
  )
    throw new Error(
      'Snapshot belongs to another group or authorization context.',
    );
  return snapshot;
}
function readSnapshot(input: unknown): Snapshot {
  const value = object(input);
  return {
    groupId: uuid(value['groupId']),
    head: fingerprint(value['head']),
    directory: fingerprint(value['directory']),
    revision: integer(value['revision'], Number.MAX_SAFE_INTEGER),
  };
}
export function wire(snapshot: Snapshot) {
  return {
    groupId: snapshot.groupId,
    head: snapshot.head,
    revision: snapshot.revision,
  };
}
function readIndex(raw: Record<string, unknown>, c: ReadContext): IndexItem[] {
  const values = raw['items'];
  if (!Array.isArray(values) || values.length > 16)
    throw new Error('Invalid group index.');
  const joined =
    c.group.state.members.find(
      (member) => member.accountId === c.authority.session.accountId,
    )?.joined ?? Infinity;
  const items = values.map((input: unknown) => {
    const value = object(input),
      epoch = integer(value['epoch'], 100000);
    if (
      typeof value['deleted'] !== 'boolean' ||
      epoch < joined ||
      epoch > c.group.state.epoch
    )
      throw new Error('Message is outside your current group participation.');
    return {
      id: uuid(value['id']),
      hash: fingerprint(value['hash']),
      sender: uuid(value['sender']),
      sequence: integer(value['sequence'], Number.MAX_SAFE_INTEGER),
      epoch,
      deleted: value['deleted'],
      deletion: value['deletion'],
      ...(value['relation'] == null
        ? {}
        : { relation: groupEditRelation(value['relation']) }),
    };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error('Duplicate group index.');
  return items;
}

function assertFullPage(
  items: IndexItem[],
  after: number,
  next: number | null,
): void {
  let previous = after;
  for (const item of items) {
    if (item.sequence <= previous) throw new Error('Group order mismatch.');
    previous = item.sequence;
  }
  if (next === null && items.length > 0)
    throw new Error('Incomplete group index.');
  if (next !== null && next !== previous)
    throw new Error('Group pagination does not match.');
}

function appendChanges(progress: Progress, items: IndexItem[]): void {
  if (progress.from === null) return;
  if (progress.items.length + items.length > 256)
    throw new Error('Group change set limit exceeded.');
  progress.items.push(...items);
}
function readCursor(
  raw: Record<string, unknown>,
  c: { progress: Progress; snapshot: Snapshot; items: IndexItem[] },
): number | null {
  const next =
    raw['next'] === null ? null : integer(raw['next'], Number.MAX_SAFE_INTEGER);
  if (c.progress.from === null) assertFullPage(c.items, c.progress.after, next);
  if (c.progress.from !== null && next !== null && next > c.snapshot.revision)
    throw new Error('Cursor belongs to another revision.');
  if (next !== null && next <= c.progress.after)
    throw new Error('Group pagination does not match.');
  return next;
}
