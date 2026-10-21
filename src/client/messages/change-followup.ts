import { MessageWarmup } from './warmup.ts';

type Step = () => Promise<void>;
export type ChangeFollowupScope = 'receipts' | 'content' | 'all';

/** Categorized wakeups coalesce without promoting receipt metadata into account
 * maintenance. Counters precede optional decoration, after visible verification. */
export class MessageChangeFollowup {
  private pending: ChangeFollowupScope | null = null;
  private readonly counts: MessageWarmup;
  private readonly decoration: MessageWarmup;
  constructor(options: {
    available: () => boolean;
    run: (step: Step) => Promise<void>;
    changed: () => void;
    failed: (error: unknown) => void;
    unread: Step;
    steps: readonly [Step, Step, Step];
  }) {
    const ports = {
      run: options.run,
      changed: options.changed,
      failed: options.failed,
    };
    this.counts = new MessageWarmup({
      ...ports,
      available: options.available,
      steps: [options.unread],
    });
    this.decoration = new MessageWarmup({
      ...ports,
      available: () => options.available() && !this.counts.pending,
      steps: options.steps,
    });
  }
  admit(scope: ChangeFollowupScope): void {
    if (scope === 'all' || this.pending === 'all') this.pending = 'all';
    else if (scope === 'content' || this.pending === 'content')
      this.pending = 'content';
    else this.pending = 'receipts';
  }
  take(): ChangeFollowupScope {
    const scope = this.pending ?? 'all';
    this.pending = null;
    return scope;
  }
  queue(scope: ChangeFollowupScope = 'all'): void {
    if (scope === 'receipts') return;
    this.counts.queue();
    if (scope === 'all') this.decoration.queue();
  }
  resume(): void {
    this.counts.resume();
    this.decoration.resume();
  }
  reset(): void {
    this.pending = null;
    this.counts.reset();
    this.decoration.reset();
  }
}
