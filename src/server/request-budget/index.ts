import { createHmac, randomBytes } from 'node:crypto';
import { getHeapStatistics } from 'node:v8';
import { AccountError } from '../../shared/account/index.ts';

type BudgetEntry = {
  expires: number;
  requests: number;
  challenges: number;
  reads: number;
};

/** No raw IP storage/logging or fingerprint. Protected buckets live one minute. */
export class RequestBudget {
  private readonly budgets: { requests: number | null; reads: number | null };
  /** Reads have no default quota. null removes a quota; challenges stay bounded. */
  constructor(
    budgets: { requests?: number | null; reads?: number | null } = {},
  ) {
    this.budgets = {
      requests: budgets.requests === null ? null : (budgets.requests ?? 60),
      reads: budgets.reads ?? null,
    };
  }
  // Charge a conservative KiB per protected entry instead of a fixed user count.
  private readonly capacity = Math.max(
    1,
    Math.floor(
      Math.min(process.availableMemory(), getHeapStatistics().heap_size_limit) /
        1024,
    ),
  );
  private readonly secret = randomBytes(32);
  private readonly entries = new Map<string, BudgetEntry>();
  private cleanup: ReturnType<typeof setTimeout> | null = null;

  admit(remote: string, challenge: boolean, read = false): void {
    // Unlimited requests neither consume nor allocate a protected IP bucket.
    const maximum = read ? this.budgets.reads : this.budgets.requests;
    if (maximum === null && !challenge) return;
    const entry = this.entry(remote);
    if (read) entry.reads++;
    else entry.requests++;
    if (challenge) entry.challenges++;
    if (this.budgetExceeded(entry, read))
      throw new AccountError(429, 'Muitos pedidos. Aguarde.');
  }
  private budgetExceeded(entry: BudgetEntry, read: boolean): boolean {
    if (read)
      return this.budgets.reads !== null && entry.reads > this.budgets.reads;
    return (
      (this.budgets.requests !== null &&
        entry.requests > this.budgets.requests) ||
      entry.challenges > 6
    );
  }
  private entry(remote: string): BudgetEntry {
    const now = performance.now();
    this.expire(now);
    const key = createHmac('sha256', this.secret).update(remote).digest('hex');
    let entry = this.entries.get(key);
    // Bounded sweeping may leave this client's expired entry behind the prefix.
    if (entry && entry.expires <= now) {
      this.entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      if (this.entries.size >= this.capacity)
        throw new AccountError(429, 'Muitos pedidos. Aguarde.');
      entry = { expires: now + 60_000, requests: 0, challenges: 0, reads: 0 };
      this.entries.set(key, entry);
      this.scheduleCleanup();
    }
    return entry;
  }
  private expire(now: number): void {
    // Fixed windows keep insertion/expiry order. Bound cleanup even after a burst.
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expires > now || removed === 256) break;
      this.entries.delete(key);
      removed++;
    }
  }
  private scheduleCleanup(): void {
    if (this.cleanup) return;
    const first = this.entries.values().next().value;
    if (!first) return;
    this.cleanup = setTimeout(
      () => {
        this.cleanup = null;
        this.expire(performance.now());
        this.scheduleCleanup();
      },
      Math.max(1, first.expires - performance.now()),
    );
    this.cleanup.unref();
  }
  close(): void {
    if (this.cleanup) clearTimeout(this.cleanup);
    this.cleanup = null;
    this.entries.clear();
    this.secret.fill(0);
  }
}
