import type { DailyStore, PushJob, PushJobCursor } from '../database/index.ts';
import type { PushRegistration } from '../../shared/daily/index.ts';
import { reserveOperationMemory } from '../memory-admission/index.ts';

/** Durable markers stay in PostgreSQL; this owner retains each admitted send. */
export class PushDispatcher {
  private readonly store: Pick<
    DailyStore,
    'jobPage' | 'eligible' | 'finish' | 'nextPushAttempt'
  >;
  private readonly send: (subscription: PushRegistration) => Promise<void>;
  private readonly wake: () => void;
  private readonly running = new Set<Promise<void>>();
  private readonly active = new Map<string, PushJob>();
  private failure: { reason: unknown } | null = null;
  private stopped = false;
  constructor(options: {
    store: Pick<
      DailyStore,
      'jobPage' | 'eligible' | 'finish' | 'nextPushAttempt'
    >;
    send: (subscription: PushRegistration) => Promise<void>;
    wake?: () => void;
  }) {
    this.store = options.store;
    this.send = options.send;
    this.wake = options.wake ?? (() => {});
  }
  /** Reconcile markers without waiting for external sends; completions wake the consumer. */
  async dispatch(): Promise<number | null> {
    if (this.stopped) return null;
    this.throwFailure();
    const releasePage = reserveOperationMemory(65_536);
    if (!releasePage) return Date.now() + 250;
    let after: PushJobCursor | null = null;
    let admitted: boolean;
    try {
      do {
        const page = await this.store.jobPage(after);
        admitted = this.admit(page.items);
        after = page.next;
      } while (after && admitted && !this.failure && !this.stopped);
    } finally {
      releasePage();
    }
    return this.nextAttempt(admitted);
  }
  private admit(jobs: PushJob[]): boolean {
    for (const job of jobs) {
      if (this.stopped || this.failure) break;
      const key = `${job.account_id}:${job.device_id}`;
      if (this.active.has(key)) continue;
      const release = reserveOperationMemory(1_048_576);
      if (!release) return false;
      this.start({ job, key, release });
    }
    return true;
  }
  private start(input: {
    job: PushJob;
    key: string;
    release: () => void;
  }): void {
    this.active.set(input.key, input.job);
    const work = this.deliver(input.job)
      .catch((reason: unknown) => {
        this.failure ??= { reason };
      })
      .finally(() => {
        this.active.delete(input.key);
        this.running.delete(work);
        input.release();
        try {
          this.wake();
        } catch (reason: unknown) {
          this.failure ??= { reason };
        }
      });
    this.running.add(work);
  }
  private async deliver(job: PushJob): Promise<void> {
    const eligible = await this.store.eligible(job);
    if (this.stopped) return;
    if (!eligible) {
      await this.store.finish(job, 'sent');
      return;
    }
    await this.store.finish(job, await this.sendOutcome(job.subscription));
  }
  private async sendOutcome(
    subscription: PushRegistration,
  ): Promise<'sent' | 'gone' | 'retry'> {
    try {
      await this.send(subscription);
      return 'sent';
    } catch (error: unknown) {
      return subscriptionGone(error) ? 'gone' : 'retry';
    }
  }
  private nextAttempt(
    admitted: boolean,
  ): Promise<number | null> | number | null {
    if (this.stopped) return null;
    if (this.failure) return Date.now();
    if (!admitted) return Date.now() + 250;
    return this.store.nextPushAttempt([...this.active.values()]);
  }
  private throwFailure(): void {
    if (!this.failure) return;
    const { reason } = this.failure;
    this.failure = null;
    throw reason;
  }
  get busy(): boolean {
    return this.running.size > 0;
  }
  async settle(): Promise<void> {
    while (this.running.size) await Promise.all(this.running);
    this.throwFailure();
  }
  stop(): void {
    this.stopped = true;
  }
}
function subscriptionGone(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('statusCode' in error))
    return false;
  return error.statusCode === 404 || error.statusCode === 410;
}
