import { expectedInterruption } from '../synchronization-work/index.ts';
import {
  GroupMessageIndex,
  IncompleteGroupIndex,
  currentGroupSnapshot,
  wire,
} from './message-index.ts';
import type { Snapshot, IndexItem } from './message-index.ts';
export { IncompleteGroupIndex } from './message-index.ts';
import { projectGroupMessages } from './message-projection.ts';
import { object, uuid } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type { GroupReadContext, GroupView } from './reader.ts';
interface Window {
  scope: string;
  snapshot: Snapshot;
  views: GroupView[];
  before: number | null;
}
interface ReadContext extends GroupReadContext {
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
  clear(): void {
    this.states.clear();
    this.windows.clear();
    this.index.clear();
  }
  prepared(group: string): boolean {
    return this.states.get(group)?.prepared ?? false;
  }
  finishPreparation(group: string): void {
    const state = this.states.get(group);
    if (state) state.prepared = true;
  }
  async read(c: ReadContext, before: number | null): Promise<Window> {
    try {
      return await this.readCurrent(c, before);
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
  private discard(group: string): void {
    this.states.delete(group);
    this.index.clear(group);
    for (const [key, window] of this.windows)
      if (window.snapshot.groupId === group) this.windows.delete(key);
  }
  private async readCurrent(
    c: ReadContext,
    before: number | null,
  ): Promise<Window> {
    c.guard?.();
    const snapshot = await currentGroupSnapshot(c),
      scope = canonical([
        c.authority.session.accountId,
        c.authority.session.deviceId,
        snapshot.directory,
        snapshot.head,
      ]),
      key = canonical([snapshot.groupId, before]);
    const previous = this.previousState(snapshot, scope),
      changed = await this.index.read(c, snapshot, previous?.snapshot ?? null);
    const result = await this.loadWindow(c, {
      snapshot,
      scope,
      key,
      before,
      changed,
      previous,
    });
    c.guard?.();
    await c.api('group-message-confirm', wire(snapshot));
    c.guard?.();
    this.commitWindow({ snapshot, scope, key, changed, previous, result });
    this.index.confirmed(snapshot);
    return result;
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
  private async recent(
    c: ReadContext,
    input: { scope: string; snapshot: Snapshot; before: number | null },
  ): Promise<Window> {
    const raw = object(
      await c.api('group-message-recent', {
        groupId: input.snapshot.groupId,
        head: input.snapshot.head,
        before: input.before,
      }),
    );
    const page = await c.read(raw),
      base = page.views.filter(
        (view) => view.kind !== 'profile' && !view.relation,
      );
    const relations = object(
      await c.api('group-message-relations', {
        ...wire(input.snapshot),
        ids: base.map((view) => view.id),
      }),
    );
    if (!Array.isArray(relations['ids']) || relations['ids'].length > 16)
      throw new Error('Invalid group edits.');
    let projected = base;
    await this.objects(
      c,
      input.snapshot,
      relations['ids'].map(uuid),
      (edits) => {
        projected = projectGroupMessages(projected, edits);
      },
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
          window.views.reduce(
            (bytes, view) => bytes + view.text.length * 2 + 1024,
            0,
          ),
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
