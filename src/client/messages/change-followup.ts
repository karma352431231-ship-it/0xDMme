import type { HistoryKind } from './preparation.ts';

type Step = () => Promise<void>;
/** `groups` refreshes counters; `group-directory` the group list itself. */
type FollowupTask =
  'direct' | 'contacts' | 'groups' | 'group-directory' | 'presence';
export type ChangeFollowupScope = 'receipts' | 'content' | 'all';
export interface ChangeFollowupPlan {
  scope: ChangeFollowupScope;
  direct: boolean;
}
const scopeRank: Record<ChangeFollowupScope, number> = {
  receipts: 0,
  content: 1,
  all: 2,
};
const taskOrder: readonly FollowupTask[] = [
  'direct',
  'contacts',
  'groups',
  'group-directory',
  'presence',
];
/** A general wakeup refreshes the group directory, which includes counters. */
const generalTasks: readonly FollowupTask[] = [
  'direct',
  'contacts',
  'group-directory',
  'presence',
];

/** Categorized metadata owners share one bounded continuation. Repeated group
 * receipts and generic decoration cannot schedule the same group read twice. */
export class MessageChangeFollowup {
  private pending: ChangeFollowupPlan | null = null;
  private readonly tasks = new Set<FollowupTask>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private readonly options: {
    available: () => boolean;
    run: (step: Step) => Promise<void>;
    changed: () => void;
    failed: (error: unknown) => void;
    unread: Step;
    groups: Step;
    steps: readonly [Step, Step, Step];
  };
  constructor(options: MessageChangeFollowup['options']) {
    this.options = options;
  }
  admit(scope: ChangeFollowupScope, kind: HistoryKind = 'direct'): void {
    const previous = this.pending?.scope ?? 'receipts';
    const effective = scopeRank[previous] > scopeRank[scope] ? previous : scope;
    const direct =
      effective === 'all' || kind === 'direct' || this.pending?.direct === true;
    this.pending = { scope: effective, direct };
  }
  take(): ChangeFollowupPlan {
    const plan = this.pending ?? { scope: 'all', direct: true };
    this.pending = null;
    return plan;
  }
  queue(plan: ChangeFollowupPlan): void {
    if (plan.direct) this.tasks.add('direct');
    if (plan.scope === 'all')
      for (const task of generalTasks) this.tasks.add(task);
    this.resume();
  }
  counters(kind: HistoryKind): void {
    this.tasks.add(kind);
    this.resume();
  }
  resume(): void {
    if (
      this.timer !== null ||
      this.running ||
      !this.tasks.size ||
      !this.options.available()
    )
      return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.step().catch(this.options.failed);
    }, 1000);
  }
  reset(): void {
    this.pending = null;
    this.tasks.clear();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  private async step(): Promise<void> {
    if (!this.options.available()) return;
    const task = taskOrder.find((candidate) => this.tasks.has(candidate));
    if (!task) return;
    this.tasks.delete(task);
    this.running = true;
    try {
      await this.options.run(this.operation(task));
    } catch (error: unknown) {
      this.options.failed(error);
    } finally {
      this.running = false;
      this.options.changed();
      this.resume();
    }
  }
  private operation(task: FollowupTask): Step {
    if (task === 'direct') return this.options.unread;
    if (task === 'groups') return this.options.groups;
    if (task === 'group-directory') return this.options.steps[1];
    return task === 'contacts' ? this.options.steps[0] : this.options.steps[2];
  }
}
