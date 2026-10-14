import { t } from '../../shared/i18n/index.ts';
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
type ReadContext = GroupReadContext;
interface Progress {
  key: string;
  after: number;
  items: IndexItem[];
  from: number | null;
}
export class IncompleteGroupIndex extends Error {}
export class GroupMessageIndex {
  private progress: Progress | null = null;
  clear(): void {
    this.progress = null;
  }
  async read(
    c: ReadContext,
    snapshot: Snapshot,
    from: Snapshot | null,
  ): Promise<IndexItem[] | null> {
    if (from?.revision === snapshot.revision) return [];
    const key = canonical([snapshot, c.authority.session.accountId]);
    const progress = this.start(key, from),
      deadline = Date.now() + 45000;
    this.progress = progress;
    for (let page = 0; page < 8 && Date.now() < deadline; page++) {
      if (!(await this.page(c, snapshot, progress))) continue;
      this.progress = null;
      return progress.from === null
        ? null
        : [...new Map(progress.items.map((item) => [item.id, item])).values()];
    }
    throw new IncompleteGroupIndex(
      t('Índice do grupo parcialmente conferido. Continue a sincronização.'),
    );
  }
  private start(key: string, from: Snapshot | null): Progress {
    if (this.progress?.key === key) return this.progress;
    const revision = from?.revision ?? null;
    return { key, after: revision ?? 0, from: revision, items: [] };
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
    appendChanges(progress, items);
    const next = readCursor(raw, { progress, snapshot, items });
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
    throw new Error('Delta de grupo divergente.');
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
    throw new Error('Snapshot de outro grupo ou autoridade.');
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
    throw new Error('Índice de grupo inválido.');
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
      throw new Error('Mensagem fora da participação atual.');
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
    throw new Error('Índice de grupo duplicado.');
  return items;
}

function assertFullPage(
  items: IndexItem[],
  after: number,
  next: number | null,
): void {
  let previous = after;
  for (const item of items) {
    if (item.sequence <= previous)
      throw new Error('Ordem de grupo divergente.');
    previous = item.sequence;
  }
  if (next === null && items.length > 0)
    throw new Error('Índice de grupo incompleto.');
  if (next !== null && next !== previous)
    throw new Error('Paginação de grupo divergente.');
}

function appendChanges(progress: Progress, items: IndexItem[]): void {
  if (progress.from === null) return;
  if (progress.items.length + items.length > 256)
    throw new Error('Delta de grupo excedido.');
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
    throw new Error('Cursor de outra revisão.');
  if (next !== null && next <= c.progress.after)
    throw new Error('Paginação de grupo divergente.');
  return next;
}
