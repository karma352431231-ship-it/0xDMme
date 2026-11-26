import { IncompleteGroupIndex } from './message-index.ts';

/** The steps one account turn can run; each verifies and commits on its own. */
export interface PreparationSteps {
  /** One page of the group list after `after`. */
  list: (
    after: string | null,
  ) => Promise<{ groups: string[]; next: string | null }>;
  /** The group's latest window; true while its local copy still owes
   * history. */
  latest: (group: string) => Promise<boolean>;
  /** One bounded background step of the group; true while more is owed. */
  fill: (group: string) => Promise<boolean>;
  /** True when other work waits for the account turn. */
  shouldYield: () => boolean;
}

/** Steps per turn and the time after which no new step starts. */
const turnSteps = 8;
const turnMs = 2000;

/** Which group account-wide preparation visits next. Every group's latest
 * window comes first, so new messages are received and previews are current
 * before any older history is read; groups whose local copy still owes
 * history are filled afterwards. A new request starts another latest pass and
 * keeps the groups still being filled. Progress lives for the session; what
 * each device holds is kept by preparation-state. */
export class GroupPreparationPlan {
  private after: string | null = null;
  private listed = false;
  private due: string[] = [];
  private readonly filling = new Set<string>();
  private version: number | null = null;
  complete = false;

  /** A request newer than the last one this plan served starts a new latest
   * pass; without a version, so does a call after the plan completed. */
  requested(version?: number): void {
    if (version === undefined ? !this.complete : version === this.version)
      return;
    this.version = version ?? this.version;
    this.after = null;
    this.listed = false;
    this.due = [];
    this.complete = false;
  }

  /** Runs steps until the turn's budget is spent, other work waits or
   * nothing remains; true while more remains. An index that needs another
   * turn ends this one; the same group continues next time. */
  async run(steps: PreparationSteps): Promise<boolean> {
    const deadline = Date.now() + turnMs;
    for (let step = 0; step < turnSteps; step++) {
      if (step > 0 && (steps.shouldYield() || Date.now() >= deadline))
        return true;
      try {
        if (!(await this.step(steps))) return false;
      } catch (error: unknown) {
        if (error instanceof IncompleteGroupIndex) return true;
        throw error;
      }
    }
    return true;
  }

  private async step(steps: PreparationSteps): Promise<boolean> {
    const group = this.due[0];
    if (group !== undefined) {
      const owed = await steps.latest(group);
      this.due.shift();
      if (owed) this.filling.add(group);
      else this.filling.delete(group);
      return true;
    }
    if (!this.listed || this.after !== null) {
      const page = await steps.list(this.after);
      this.due = page.groups;
      this.after = page.next;
      this.listed = true;
      return true;
    }
    const [next] = this.filling;
    if (next === undefined) {
      this.complete = true;
      return false;
    }
    if (!(await steps.fill(next))) this.filling.delete(next);
    return true;
  }
}
