import {
  measurePrivateSend,
  timedLoad,
} from '../chat-sync-diagnostics/index.ts';
import type { PrivateSendContext } from '../chat-sync-diagnostics/index.ts';
import { decodeDailyText } from '../../shared/daily/index.ts';
import { readReopen, writeReopen } from '../reopen-cache/index.ts';
import { groupCacheScope } from './cache.ts';
import { groupQuota } from '../../shared/group-quota/index.ts';
import { expectedInterruption } from '../synchronization-work/index.ts';
import {
  GroupMessageIndex,
  IncompleteGroupIndex,
  currentGroupSnapshot,
  explicitDeletion,
  wire,
} from './message-index.ts';
import { GroupCoverage, ReadObservation } from './preparation-state.ts';
import type { Coverage } from './preparation-state.ts';
import type { Snapshot, IndexItem } from './message-index.ts';
import { GroupDelta } from './message-delta.ts';
export { IncompleteGroupIndex } from './message-index.ts';
import { projectGroupMessages, groupViewBytes } from './message-projection.ts';
import { localGroupEdits } from './history.ts';
import { object, uuid } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import {
  CenteredHistory,
  HistoryFloors,
  historyPage,
  reachFloor,
} from '../history-window/index.ts';
import type { HistorySlice } from '../../shared/messages/index.ts';
import type { HistoryFloor } from '../history-window/index.ts';
import type { GroupReadContext, GroupView } from './reader.ts';
interface Window {
  scope: string;
  snapshot: Snapshot;
  views: GroupView[];
  before: number | null;
}
interface ReadContext extends Omit<GroupReadContext, 'machine'> {
  diagnostic?: PrivateSendContext | undefined;
  historyTrace?:
    import('../chat-sync-diagnostics/index.ts').LoadTrace | undefined;
  indexPages?: number;
  /** Background reads stop between pages when other work waits. */
  shouldYield?: () => boolean;
  guard?: () => void;
  read: (input: unknown) => Promise<{ views: GroupView[] }>;
}
interface State {
  scope: string;
  snapshot: Snapshot;
}
/** One confirmed read in progress: its snapshot, the reader observing what
 * it read and where the change journal continues. */
interface Cut {
  scope: string;
  snapshot: Snapshot;
  read: ReadContext;
  seen: ReadObservation;
  from: number | null;
  above: number | null;
  previous: State | null;
}
function checkCenteredRows(
  rows: readonly GroupView[],
  slice: HistorySlice,
): void {
  if (
    rows.length > slice.limit ||
    rows.some((row) =>
      slice.direction === 'newer'
        ? row.sequence <= slice.cursor
        : row.sequence >= slice.cursor,
    )
  )
    throw new Error('Group message window does not match.');
}
/** Session-only bounded candidates. Metadata continuity and final confirmation
 * are required before candidates become a visible group window. */
export class GroupMessageWindows {
  private readonly states = new Map<string, State>();
  private readonly windows = new Map<string, Window>();
  private readonly index = new GroupMessageIndex();
  /** What the device's local copy already holds; see preparation-state. */
  private readonly coverage = new GroupCoverage();
  /** How far back each group's latest window reaches; see history-window. */
  private readonly floors = new HistoryFloors();
  /** False after the server answered that it has no delta operation. */
  private deltas = true;
  clear(): void {
    this.states.clear();
    this.windows.clear();
    this.index.clear();
    this.floors.clear();
    this.coverage.clear();
  }
  /** False once the group's latest window has nothing further back. */
  olderAvailable(group: string, views: readonly GroupView[]): boolean {
    return (
      !this.floors.complete(group) &&
      (this.floors.floor(group) !== null || views.length >= historyPage)
    );
  }
  /** True while the device's local copy still misses older history or owed
   * packets of the group; known after a read of it. */
  preparationDue(c: Pick<ReadContext, 'authority' | 'group'>): boolean {
    return this.coverage.due(c.group.state.groupId, ownJoined(c));
  }
  confirmedCut(group: string): Snapshot | null {
    return this.states.get(group)?.snapshot ?? null;
  }
  /** The latest window (before null) keeps the group's floor and, with
   * `older`, reaches one page further back; other cursors read single pages. */
  async read(
    c: ReadContext,
    before: number | null | CenteredHistory<GroupView>,
    older = false,
  ): Promise<Window> {
    try {
      return before instanceof CenteredHistory
        ? await this.readCentered(c, before)
        : await this.readCurrent(c, before, older);
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
  private async readCentered(
    c: ReadContext,
    history: CenteredHistory<GroupView>,
  ): Promise<Window> {
    c.guard?.();
    await this.restoreCheckpoint(c);
    const { scope, snapshot, read, previous, from, above } =
      await this.target(c);
    // A focused read does not read changed packets, so it leaves the
    // coverage where it is and later reads continue the journal from there.
    const { changed } = await this.index.read(read, snapshot, from, above);
    const focus = await history.stage({
      cut: canonical(snapshot),
      read: (slice) =>
        this.recent(read, { scope, snapshot, before: null, slice }).then(
          (page) => page.views,
        ),
    });
    c.guard?.();
    await timedLoad(c.historyTrace, 'confirm', () =>
      c.api('group-message-confirm', wire(snapshot)),
    );
    c.guard?.();
    const result = { scope, snapshot, views: focus.rows, before: null };
    this.commitWindow({
      snapshot,
      scope,
      key: canonical([snapshot.groupId, 'focus', history.anchor]),
      changed,
      previous,
      result,
    });
    this.index.confirmed(snapshot);
    focus.commit();
    return result;
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
  /** Background preparation of the device's local copy at one confirmed
   * cut: packets still owed first, then older pages of the first full pass,
   * at most `pages` reads and none after other work starts waiting. Nothing
   * is shown, so no window is kept. False once nothing remains. */
  async prepare(c: ReadContext, pages: number): Promise<boolean> {
    try {
      return await this.prepareCut(c, pages);
    } catch (error: unknown) {
      if (
        !(error instanceof IncompleteGroupIndex) &&
        !expectedInterruption(error)
      )
        this.discard(c.group.state.groupId);
      throw error;
    }
  }
  private async prepareCut(c: ReadContext, pages: number): Promise<boolean> {
    c.guard?.();
    await this.restoreCheckpoint(c);
    c.guard?.();
    const group = c.group.state.groupId,
      joined = ownJoined(c),
      coverage = this.coverage.current(group, joined);
    if (!coverage || !this.coverage.due(group, joined)) return false;
    const cut = await this.target(c),
      { snapshot, read } = cut;
    const { changed, newer } = await this.index.read(
      read,
      snapshot,
      cut.from,
      cut.above,
    );
    if (changed?.length)
      await this.readChanged(read, snapshot, changed, () => {});
    const filled = await this.fill(c, cut, coverage, pages);
    c.guard?.();
    await c.api('group-message-confirm', wire(snapshot));
    c.guard?.();
    this.commitState({
      snapshot,
      scope: cut.scope,
      key: null,
      changed,
      previous: cut.previous,
    });
    this.index.confirmed(snapshot);
    await this.confirmCoverage(c, cut, { changed, newer, ...filled });
    return this.coverage.due(group, joined);
  }
  /** Owed packets first, then older pages of the first full pass, at the
   * cut; at most `pages` reads and none after other work starts waiting. */
  private async fill(
    c: ReadContext,
    cut: Cut,
    coverage: Coverage,
    pages: number,
  ) {
    const owed = [...coverage.owed],
      requested: string[] = [];
    let older = coverage.older;
    for (
      let page = 0;
      page < pages && (owed.length || older !== null);
      page++
    ) {
      if (page > 0 && c.shouldYield?.()) break;
      c.guard?.();
      if (owed.length) {
        const batch = owed.splice(0, 16);
        // An id the cut no longer returns has nothing left to read.
        await this.objectPage(cut.read, cut.snapshot, batch);
        requested.push(...batch);
        continue;
      }
      older = (
        await this.recent(cut.read, {
          scope: cut.scope,
          snapshot: cut.snapshot,
          before: older,
        })
      ).before;
    }
    return {
      requested,
      older:
        coverage.older === null
          ? undefined
          : { from: coverage.older, to: older },
    };
  }
  /** Reports a confirmed cut that read every changed packet to the
   * coverage; `requested` owed packets count as read unless held. */
  private async confirmCoverage(
    c: ReadContext,
    cut: Cut,
    read: {
      changed: IndexItem[] | null;
      newer: string[] | null;
      start?: number | null | undefined;
      older?: { from: number; to: number | null } | undefined;
      requested?: string[];
    },
  ): Promise<void> {
    const requested = read.requested ?? [];
    await this.coverage.confirmed(c.authority, cut.snapshot.groupId, {
      joined: ownJoined(c),
      snapshot: cut.snapshot,
      from: read.changed === null ? null : cut.from,
      newer: read.newer,
      ...(read.start === undefined ? {} : { start: read.start }),
      ...(read.older ? { older: read.older } : {}),
      settled: [
        ...cut.seen.settled,
        ...requested.filter((id) => !cut.seen.held.has(id)),
      ],
      held: [...cut.seen.held],
    });
    c.guard?.();
  }
  private discard(group: string): void {
    this.coverage.reverify(group);
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
    await timedLoad(c.historyTrace, 'local-history', () =>
      this.restoreCheckpoint(c),
    );
    c.guard?.();
    const cut = await this.target(c),
      { scope, snapshot, read, previous } = cut,
      key = canonical([snapshot.groupId, before]);
    const { changed, newer } = await this.index.read(
        read,
        snapshot,
        cut.from,
        cut.above,
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
    await timedLoad(c.historyTrace, 'confirm', () =>
      measurePrivateSend(c.diagnostic, 'receipt-confirm', () =>
        c.api('group-message-confirm', wire(snapshot)),
      ),
    );
    c.guard?.();
    this.commitWindow({ snapshot, scope, key, changed, previous, result });
    this.index.confirmed(snapshot);
    // Every changed packet was read above, so the coverage can follow.
    await this.confirmCoverage(c, cut, {
      changed,
      newer,
      start: before === null ? result.before : undefined,
    });
    if (history.remember) {
      this.floors.update(snapshot.groupId, reached);
      await measurePrivateSend(c.diagnostic, 'receipt-persist', () =>
        this.saveCheckpoint(c, result),
      );
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
    await this.coverage.load(c.authority, group, ownJoined(c));
    if (this.states.has(group)) return;
    const value = await readReopen<Window>(
      c.authority,
      this.checkpointLocation(c),
    );
    c.guard?.();
    const scope = readScope(c);
    if (
      !value ||
      value.scope !== scope ||
      value.snapshot.groupId !== group ||
      !Array.isArray(value.views) ||
      value.views.length > 16 ||
      value.views.some((view) => view.groupId !== group)
    )
      return;
    this.states.set(group, { scope, snapshot: value.snapshot });
    this.remember(canonical([group, null]), value);
  }
  /** The snapshot to read, the reader serving it and where the change
   * journal continues. */
  private async target(c: ReadContext): Promise<Cut> {
    const scope = readScope(c),
      start = this.journalStart(c, scope),
      delta = await this.delta(c, start.from),
      fresh = delta?.snapshot ?? (await currentGroupSnapshot(c)),
      snapshot = this.index.target(fresh);
    if (start.kept && snapshot.revision < start.kept.snapshot.revision)
      throw new Error('Outdated group state.');
    const seen = new ReadObservation();
    return {
      scope,
      snapshot,
      seen,
      from: start.from,
      above: start.above,
      read: observed(
        delta && snapshot === fresh ? { ...c, api: delta.serve(c.api) } : c,
        seen,
      ),
      previous:
        start.kept?.snapshot.revision === start.from ? start.kept : null,
    };
  }
  /** The earlier of the device's coverage and the confirmed window, so
   * neither misses a change. The coverage outlives head and directory
   * changes; a window is reused only at that exact revision. */
  private journalStart(c: ReadContext, scope: string) {
    const group = c.group.state.groupId,
      joined = ownJoined(c),
      known = this.states.get(group),
      kept = known?.scope === scope ? known : null;
    return {
      kept,
      above: this.coverage.current(group, joined)?.high ?? null,
      from: earliest(
        this.coverage.journal(group, joined) ?? undefined,
        kept?.snapshot.revision,
      ),
    };
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
  private async delta(c: ReadContext, from: number | null) {
    if (
      !this.deltas ||
      from === null ||
      this.index.retains(c.group.state.groupId)
    )
      return null;
    const delta = await GroupDelta.read(c, from);
    if (!delta) this.deltas = false;
    c.guard?.();
    return delta;
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
      previous: State | null;
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
        input.changed.filter(explicitDeletion).map((item) => item.id),
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
    previous: State | null;
    result: Window;
  }): void {
    this.commitState(input);
    this.remember(input.key, input.result);
  }
  /** The confirmed cut becomes the group's state; other windows advance to
   * it or are dropped. `key` names the window this read itself produced. */
  private commitState(input: {
    snapshot: Snapshot;
    scope: string;
    key: string | null;
    changed: IndexItem[] | null;
    previous: State | null;
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
    });
    while (this.states.size > 256)
      this.states.delete(this.states.keys().next().value!);
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
      items.filter((item) => !explicitDeletion(item)).map((item) => item.id),
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
      const page = await this.objectPage(
        c,
        snapshot,
        [...pending].slice(0, 16),
      );
      if (!page.returned.length) throw new Error('Incomplete group objects.');
      if (consume) consume(page.views);
      else views.push(...page.views);
      for (const id of page.returned) pending.delete(id);
    }
    return views;
  }
  /** One objects request; the server may return fewer packets than asked. */
  private async objectPage(
    c: ReadContext,
    snapshot: Snapshot,
    requested: string[],
  ): Promise<{ returned: string[]; views: GroupView[] }> {
    const raw = object(
      await c.api('group-message-objects', {
        ...wire(snapshot),
        ids: requested,
      }),
    );
    if (!Array.isArray(raw['items']))
      throw new Error('Incomplete group objects.');
    const returned = (raw['items'] as unknown[]).map((item) =>
      uuid(object(item)['id']),
    );
    if (
      new Set(returned).size !== returned.length ||
      returned.some((id) => !requested.includes(id))
    )
      throw new Error('Objects belong to another query.');
    return {
      returned,
      views: returned.length ? (await c.read(raw)).views : [],
    };
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
    input: {
      scope: string;
      snapshot: Snapshot;
      before: number | null;
      slice?: HistorySlice;
    },
  ): Promise<Window> {
    const raw = object(
      await c.api('group-message-recent', {
        groupId: input.snapshot.groupId,
        head: input.snapshot.head,
        before: input.before,
        ...(input.slice ? { slice: input.slice } : {}),
        ...(input.snapshot.anchor === undefined
          ? {}
          : { anchor: input.snapshot.anchor }),
      }),
    );
    const page = await c.read(raw),
      base = page.views.filter(
        (view) => view.kind !== 'profile' && !view.relation,
      );
    if (input.slice) checkCenteredRows(base, input.slice);
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
    current: string | null,
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

/** Windows and checkpoints belong to this account, device, directory and
 * group head. */
function readScope(c: ReadContext): string {
  return canonical([
    c.authority.session.accountId,
    c.authority.session.deviceId,
    c.authority.directory,
    c.group.head,
  ]);
}
/** The reader with every page it returns reported to `seen`. */
function observed(c: ReadContext, seen: ReadObservation): ReadContext {
  return {
    ...c,
    read: async (raw) => {
      const page = await c.read(raw);
      seen.record(page.views);
      return page;
    },
  };
}
function ownJoined(c: Pick<ReadContext, 'authority' | 'group'>): number {
  return (
    c.group.state.members.find(
      (member) => member.accountId === c.authority.session.accountId,
    )?.joined ?? 0
  );
}
function earliest(...revisions: (number | undefined)[]): number | null {
  const known = revisions.filter((value) => value !== undefined);
  return known.length ? Math.min(...known) : null;
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
