import { AccountError } from '../../shared/account/index.ts';
import { conversationPreview } from '../conversation-preview/index.ts';
import type { ConversationPreview } from '../conversation-preview/index.ts';
import { loadingPresentation } from '../chat-sync-diagnostics/index.ts';
import { WorkInterruption } from '../synchronization-work/index.ts';
import { IncompleteGroupIndex } from './message-index.ts';
import { groupMessageView } from './message-content.ts';
import type { GroupView } from './reader.ts';
import type { GroupSummary } from './directory-refresh.ts';

interface PreviewOptions {
  read: (
    group: GroupSummary,
    guard: () => void,
  ) => Promise<readonly GroupView[]>;
  selected: () => string | null;
  changed: () => void;
  failed: (error: unknown) => void;
}
interface Projection {
  preview: ConversationPreview | undefined;
}
/** One bounded visible page, round-robin index continuations and memory-only
 * projections. Selected/history publications supersede an in-flight list read.
 * The caller admits each turn through the existing group/authority owner. */
export class GroupPreviews {
  private readonly options: PreviewOptions;
  private readonly records = new Map<string, Projection>();
  private pending: GroupSummary[] = [];
  private generation = 0;
  private active: Promise<boolean> | null = null;
  private readonly loading = new Map<
    string,
    ReturnType<typeof loadingPresentation>
  >();
  private emptyPending = false;
  constructor(options: PreviewOptions) {
    this.options = options;
  }
  get(group: string): ConversationPreview | undefined {
    return this.records.get(group)?.preview;
  }
  clear(): void {
    this.generation++;
    this.pending = [];
    this.records.clear();
    this.cancelPresentation();
    this.emptyPending = false;
  }
  queue(groups: readonly GroupSummary[]): void {
    this.generation++;
    this.pending = groups.filter((group) => !group.localOnly).slice(0, 16);
    const retained = new Set(this.pending.map((group) => group.state.groupId));
    for (const [id, loading] of this.loading) {
      loading.cancel();
      if (!retained.has(id)) this.loading.delete(id);
    }
    this.emptyPending = this.pending.length === 0;
    for (const group of this.pending)
      if (!this.loading.has(group.state.groupId))
        this.loading.set(
          group.state.groupId,
          loadingPresentation('group-previews', group.state.groupId),
        );
    if (this.emptyPending)
      this.loading.set('', loadingPresentation('group-previews'));
  }
  private cancelPresentation(): void {
    for (const loading of this.loading.values()) loading.cancel();
    this.loading.clear();
  }
  publish(group: string, views: readonly GroupView[]): void {
    const latest = views.at(-1);
    const preview = latest
      ? conversationPreview({
          ...latest,
          displayText: groupMessageView(latest).content.text,
        })
      : undefined;
    this.records.delete(group);
    this.records.set(group, { preview });
    while (this.records.size > 128)
      this.records.delete(this.records.keys().next().value!);
  }
  presented(host: HTMLElement, groups: readonly string[]): void {
    for (const [id, loading] of this.loading)
      loading.presented(host, id === '' || groups.includes(id));
  }
  step(): Promise<boolean> {
    if (this.active) return this.active;
    const work = this.next().finally(() => {
      if (this.active === work) this.active = null;
    });
    this.active = work;
    return work;
  }
  private async next(): Promise<boolean> {
    const group = this.pending.shift();
    if (!group) {
      if (this.emptyPending) {
        this.emptyPending = false;
        await this.loading.get('')?.run(() => Promise.resolve(0));
        this.options.changed();
      }
      return false;
    }
    const id = group.state.groupId;
    if (this.options.selected() === id) return this.pending.length > 0;
    const generation = this.generation;
    const previous = this.records.get(id);
    const guard = () => {
      if (generation !== this.generation) throw new WorkInterruption('session');
    };
    try {
      await this.loading.get(id)?.run(
        async () => {
          const views = await this.options.read(group, guard);
          guard();
          if (
            this.records.get(id) !== previous ||
            this.options.selected() === id
          )
            throw new WorkInterruption('replacement');
          this.publish(id, views);
          return views.length ? 1 : 0;
        },
        (error) => error instanceof IncompleteGroupIndex,
      );
      this.options.changed();
    } catch (error: unknown) {
      this.failedRead({ error, generation, group, previous });
    }
    return this.pending.length > 0;
  }
  private failedRead(input: {
    error: unknown;
    generation: number;
    group: GroupSummary;
    previous: Projection | undefined;
  }): void {
    const { error, generation, group, previous } = input;
    if (generation !== this.generation) return;
    if (error instanceof IncompleteGroupIndex) {
      this.pending.push(group);
      return;
    }
    if (error instanceof WorkInterruption) return;
    if (error instanceof AccountError && [401, 403].includes(error.status))
      this.clear();
    else if (this.records.get(group.state.groupId) === previous)
      this.records.delete(group.state.groupId);
    this.options.failed(error);
    this.options.changed();
  }
}
