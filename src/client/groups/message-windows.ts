import { decodeDailyText } from '../../shared/daily/index.ts';
import { readReopen, writeReopen } from '../reopen-cache/index.ts';
import { groupCacheScope } from './cache.ts';
import { groupQuota } from '../../shared/group-quota/index.ts';
import { expectedInterruption } from '../synchronization-work/index.ts';
import {
  GroupMessageIndex,
  IncompleteGroupIndex,
  currentGroupSnapshot,
  wire,
} from './message-index.ts';
import type { Snapshot, IndexItem } from './message-index.ts';
import { GroupDelta } from './message-delta.ts';
export { IncompleteGroupIndex } from './message-index.ts';
import { projectGroupMessages, groupViewBytes } from './message-projection.ts';
import { localGroupEdits } from './history.ts';
import { object, uuid } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import {
  HistoryFloors,
  historyPage,
  reachFloor,
} from '../history-window/index.ts';
import type { HistoryFloor } from '../history-window/index.ts';
import type { GroupReadContext, GroupView } from './reader.ts';
interface Window {
  scope: string;
  snapshot: Snapshot;
  views: GroupView[];
  before: number | null;
}
interface ReadContext extends Omit<GroupReadContext, 'machine'> {
  indexPages?: number;
  guard?: () => void;
  read: (input: unknown) => Promise<{ views: GroupView[] }>;
}
/** Session-only bounded candidates. Metadata continuity and final confirmation
 * are required before candidates become a visible group window. */
export class GroupMessageWindows {
  private readonly states = new Map<
    string,
    { scope: string; snapshot: Snapshot; prepared: boolean }
  >();
  private readonly windows = new Map<string, Window>();
  private readonly index = new GroupMessageIndex();
  /** How far back each group's latest window reaches; see history-window. */
  private readonly floors = new HistoryFloors();
  /** False after the server answered that it has no delta operation. */
  private deltas = true;
  clear(): void {
    this.states.clear();
    this.windows.clear();
    this.index.clear();
    this.floors.clear();
  }
  /** False once the group's latest window has nothing further back. */
  olderAvailable(group: string, views: readonly GroupView[]): boolean {
    return (
      !this.floors.complete(group) &&
      (this.floors.floor(group) !== null || views.length >= historyPage)
    );
  }
  prepared(group: string): boolean {
    return this.states.get(group)?.prepared ?? false;
  }
  finishPreparation(group: string): void {
    const state = this.states.get(group);
    if (state) state.prepared = true;
  }
  /** The latest window (before null) keeps the group's floor and, with
   * `older`, reaches one page further back; other cursors read single pages. */
  async read(
    c: ReadContext,
    before: number | null,
    older = false,
  ): Promise<Window> {
    try {
      return await this.readCurrent(c, before, older);
    } catch (error: unknown) {
      if (
        !(error instanceof IncompleteGroupIndex) &&
        !expectedInterruption(error)
      ) {
        this.discard(c.group.state.groupId);
      }
      throw error;
    }
  }
  /** The list needs the complete latest window, without extending a history
   * floor or writing a reopen checkpoint just to decorate a directory row. */
  async latest(c: ReadContext): Promise<Window> {
    try {
      return await this.readCurrent(c, null, false, true);
    } catch (error: unknown) {
      if (
        !(error instanceof IncompleteGroupIndex) &&
        !expectedInterruption(error)
      )
        this.discard(c.group.state.groupId);
      throw error;
    }
  }
  private discard(group: string): void {
    this.states.delete(group);
    this.index.clear(group);
    for (const [key, window] of this.windows)
      if (window.snapshot.groupId === group) this.windows.delete(key);
  }
  private async readCurrent(
    c: ReadContext,
    before: number | null,
    older: boolean,
    latest = false,
  ): Promise<Window> {
    c.guard?.();
    await this.restoreCheckpoint(c);
    c.guard?.();
    const { scope, snapshot, read } = await this.target(c),
      key = canonical([snapshot.groupId, before]);
    const previous = this.previousState(snapshot, scope),
      changed = await this.index.read(
        read,
        snapshot,
        previous?.snapshot ?? null,
      ),
      history = this.historyRequest(snapshot.groupId, before, latest),
      floor = history.floor;
    const loaded = await this.loadWindow(read, {
      snapshot,
      scope,
      key,
      before,
      floor,
      changed,
      previous,
    });
    const reached = await this.reachFloor(read, {
      scope,
      snapshot,
      views: loaded.views,
      floor,
      older: before === null && older,
    });
    const result = { ...loaded, views: reached.rows };
    c.guard?.();
    await c.api('group-message-confirm', wire(snapshot));
    c.guard?.();
    this.commitWindow({ snapshot, scope, key, changed, previous, result });
    this.index.confirmed(snapshot);
    if (history.remember) {
      this.floors.update(snapshot.groupId, reached);
      await this.saveCheckpoint(c, result);
    }
    return result;
  }
  private historyRequest(
    group: string,
    before: number | null,
    latest: boolean,
  ) {
    const remember = before === null && !latest;
    return { remember, floor: remember ? this.floors.floor(group) : null };
  }
  private async saveCheckpoint(c: ReadContext, result: Window): Promise<void> {
    if (
      result.views.some(
        (view) =>
          view.kind === 'text' &&
          view.contentFormat === 'daily' &&
          decodeDailyText(view.text).viewOnce,
      )
    )
      return;
    await writeReopen(c.authority, this.checkpointLocation(c), {
      ...result,
      views: projectGroupMessages([], result.views),
      before: result.views[0]?.sequence ?? null,
    });
    c.guard?.();
  }
  private checkpointLocation(c: ReadContext) {
    return {
      scope: groupCacheScope(
        c.authority.session.accountId,
        c.group.state.groupId,
      ),
      name: 'reopen:group',
      binding: c.group.head,
      maximum: groupQuota,
    };
  }
  private async restoreCheckpoint(c: ReadContext): Promise<void> {
    const group = c.group.state.groupId;
    if (this.states.has(group)) return;
    const value = await readReopen<Window>(
      c.authority,
      this.checkpointLocation(c),
    );
    c.guard?.();
    const scope = canonical([
      c.authority.session.accountId,
      c.authority.session.deviceId,
      c.authority.directory,
      c.group.head,
    ]);
    if (
      !value ||
      value.scope !== scope ||
      value.snapshot.groupId !== group ||
      !Array.isArray(value.views) ||
      value.views.length > 16 ||
      value.views.some((view) => view.groupId !== group)
    )
      return;
    this.states.set(group, {
      scope,
      snapshot: value.snapshot,
      prepared: false,
    });
    this.remember(canonical([group, null]), value);
  }
  /** The snapshot to read and the reader serving it. */
  private async target(c: ReadContext) {
    // A snapshot always carries this directory and head, so the scope is known
    // before asking for it.
    const scope = canonical([
        c.authority.session.accountId,
        c.authority.session.deviceId,
        c.authority.directory,
        c.group.head,
      ]),
      delta = await this.delta(c, scope),
      fresh = delta?.snapshot ?? (await currentGroupSnapshot(c)),
      snapshot = this.index.target(fresh);
    const read =
      delta && snapshot === fresh ? { ...c, api: delta.serve(c.api) } : c;
    return { scope, snapshot, read };
  }
  /** Older pages at the same snapshot, back to the floor and one further
   * when asked; each page is read and verified like the latest one. */
  private reachFloor(
    c: ReadContext,
    input: {
      scope: string;
      snapshot: Snapshot;
      views: GroupView[];
      floor: HistoryFloor;
      older: boolean;
    },
  ) {
    const { scope, snapshot } = input;
    return reachFloor({
      rows: input.views,
      floor: input.floor,
      older: input.older,
      page: async (before) =>
        (await this.recent(c, { scope, snapshot, before })).views,
      merge: joinPages,
    });
  }
  /** Warm reads of a group with no unfinished change set ask for the delta. */
  private async delta(c: ReadContext, scope: string) {
    const previous = this.states.get(c.group.state.groupId);
    if (
      !this.deltas ||
      previous?.scope !== scope ||
      this.index.retains(c.group.state.groupId)
    )
      return null;
    const delta = await GroupDelta.read(c, previous.snapshot.revision);
    if (!delta) this.deltas = false;
    c.guard?.();
    return delta;
  }
  private previousState(snapshot: Snapshot, scope: string) {
    const previous = this.states.get(snapshot.groupId);
    if (previous?.scope !== scope) return null;
    if (snapshot.revision < previous.snapshot.revision)
      throw new Error('Outdated group state.');
    return previous;
  }
  private async loadWindow(
    c: ReadContext,
    input: {
      snapshot: Snapshot;
      scope: string;
      key: string;
      before: number | null;
      floor: HistoryFloor;
      changed: IndexItem[] | null;
      previous: { snapshot: Snapshot } | null;
    },
  ): Promise<Window> {
    const candidate = this.windows.get(input.key);
    if (
      candidate &&
      candidate.scope === input.scope &&
      candidate.snapshot.revision === input.previous?.snapshot.revision &&
      input.changed !== null
    ) {
      const removed = new Set(
        input.changed.filter(explicitRemoval).map((item) => item.id),
      );
      let views = candidate.views.filter((view) => !removed.has(view.id));
      await this.readChanged(c, input.snapshot, input.changed, (page) => {
        views = projectGroupMessages(
          views,
          page.filter(
            (view) =>
              view.relation ||
              input.before === null ||
              view.sequence < input.before,
          ),
          input.floor,
        );
      });
      return {
        scope: input.scope,
        snapshot: input.snapshot,
        before: views[0]?.sequence ?? candidate.before,
        views,
      };
    }
    if (input.changed?.length)
      await this.readChanged(c, input.snapshot, input.changed, () => {});
    return this.recent(c, input);
  }
  private commitWindow(input: {
    snapshot: Snapshot;
    scope: string;
    key: string;
    changed: IndexItem[] | null;
    previous: { snapshot: Snapshot; prepared: boolean } | null;
    result: Window;
  }): void {
    this.advanceWindows(
      input.snapshot,
      input.previous?.snapshot ?? null,
      input.changed,
      input.key,
    );
    this.states.delete(input.snapshot.groupId);
    this.states.set(input.snapshot.groupId, {
      scope: input.scope,
      snapshot: input.snapshot,
      prepared: input.changed !== null && (input.previous?.prepared ?? false),
    });
    while (this.states.size > 256)
      this.states.delete(this.states.keys().next().value!);
    this.remember(input.key, input.result);
  }
  private async readChanged(
    c: ReadContext,
    snapshot: Snapshot,
    items: IndexItem[],
    consume: (views: GroupView[]) => void,
  ): Promise<GroupView[]> {
    return this.objects(
      c,
      snapshot,
      items
        .filter(
          (item) =>
            !item.deleted ||
            !item.deletion ||
            object(item.deletion)['type'] !== 'message',
        )
        .map((item) => item.id),
      consume,
    );
  }
  private async objects(
    c: ReadContext,
    snapshot: Snapshot,
    ids: string[],
    consume?: (views: GroupView[]) => void,
  ): Promise<GroupView[]> {
    const pending = new Set(ids),
      views: GroupView[] = [],
      deadline = Date.now() + 45000;
    while (pending.size) {
      if (Date.now() > deadline)
        throw new Error('Group preparation timed out; try again.');
      const requested = [...pending].slice(0, 16),
        raw = object(
          await c.api('group-message-objects', {
            ...wire(snapshot),
            ids: requested,
          }),
        );
      if (!Array.isArray(raw['items']) || !raw['items'].length)
        throw new Error('Incomplete group objects.');
      const returned = (raw['items'] as unknown[]).map((item) =>
        uuid(object(item)['id']),
      );
      if (
        new Set(returned).size !== returned.length ||
        returned.some((id) => !requested.includes(id))
      )
        throw new Error('Objects belong to another query.');
      const page = await c.read(raw);
      if (consume) consume(page.views);
      else views.push(...page.views);
      for (const id of returned) pending.delete(id);
    }
    return views;
  }
  private async related(
    c: ReadContext,
    snapshot: Snapshot,
    base: GroupView[],
  ): Promise<GroupView[]> {
    let projected = base,
      after: string | null = null;
    const deadline = Date.now() + 45000;
    do {
      c.guard?.();
      if (Date.now() > deadline)
        throw new Error('Group preparation timed out; try again.');
      const relations = object(
        await c.api('group-message-relations', {
          ...wire(snapshot),
          ids: base.map((view) => view.id),
          ...(after ? { after } : {}),
        }),
      );
      const page = relationPage(relations, after);
      await this.objects(c, snapshot, page.ids, (actions) => {
        projected = projectGroupMessages(projected, actions);
      });
      after = page.next;
    } while (after !== null);
    return projected;
  }
  private async recent(
    c: ReadContext,
    input: { scope: string; snapshot: Snapshot; before: number | null },
  ): Promise<Window> {
    const raw = object(
      await c.api('group-message-recent', {
        groupId: input.snapshot.groupId,
        head: input.snapshot.head,
        before: input.before,
        ...(input.snapshot.anchor === undefined
          ? {}
          : { anchor: input.snapshot.anchor }),
      }),
    );
    const page = await c.read(raw),
      base = page.views.filter(
        (view) => view.kind !== 'profile' && !view.relation,
      );
    let projected = await this.related(c, input.snapshot, base);
    const local = projected.filter((view) => view.localOnly);
    if (local.length)
      projected = projectGroupMessages(
        projected,
        await localGroupEdits(c.authority, input.snapshot.groupId, local),
      );
    return {
      scope: input.scope,
      snapshot: input.snapshot,
      views: projected,
      before:
        projected[0]?.sequence ??
        (raw['next'] === null
          ? null
          : integer(raw['next'], Number.MAX_SAFE_INTEGER)),
    };
  }
  private advanceWindows(
    snapshot: Snapshot,
    from: Snapshot | null,
    items: IndexItem[] | null,
    current: string,
  ): void {
    for (const [key, window] of this.windows) {
      if (key === current || window.snapshot.groupId !== snapshot.groupId)
        continue;
      const roots = new Set(window.views.map((view) => view.id));
      if (
        items === null ||
        window.snapshot.revision !== from?.revision ||
        items.some(
          (item) =>
            roots.has(item.id) ||
            (item.relation && roots.has(item.relation.id)),
        )
      )
        this.windows.delete(key);
      else window.snapshot = snapshot;
    }
  }
  private remember(key: string, value: Window): void {
    this.windows.delete(key);
    this.windows.set(key, value);
    while (
      this.windows.size > 16 ||
      [...this.windows.values()].reduce(
        (total, window) =>
          total +
          window.views.reduce((bytes, view) => bytes + groupViewBytes(view), 0),
        0,
      ) >
        8 * 1024 * 1024
    )
      this.windows.delete(this.windows.keys().next().value!);
  }
}

function explicitRemoval(item: IndexItem): boolean {
  return (
    item.deleted &&
    !!item.deletion &&
    object(item.deletion)['type'] === 'message'
  );
}

/** Validate the bounded action page and strictly advancing transport cursor. */
function relationPage(raw: Record<string, unknown>, after: string | null) {
  if (!Array.isArray(raw['ids']) || raw['ids'].length > 16)
    throw new Error('Invalid group actions.');
  const ids = raw['ids'].map(uuid),
    next = raw['next'] == null ? null : uuid(raw['next']);
  if (next !== null && after !== null && next <= after)
    throw new Error('Invalid group action cursor.');
  return { ids, next };
}

/** Group windows hold roots only; edits are already projected into them. */
function joinPages(
  newer: readonly GroupView[],
  older: readonly GroupView[],
): GroupView[] {
  const rows = new Map(older.map((view) => [view.id, view]));
  for (const view of newer) rows.set(view.id, view);
  return [...rows.values()].sort((a, b) => a.sequence - b.sequence);
}
