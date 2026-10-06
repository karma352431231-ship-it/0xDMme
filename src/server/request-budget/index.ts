import { createHmac, randomBytes } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';

type BudgetEntry = {
  expires: number;
  requests: number;
  challenges: number;
  reads: number;
};

/** No raw IP storage/logging or fingerprint. Protected buckets live one minute. */
export class RequestBudget {
  private readonly budgets: { requests: number | null; reads: number };
  /** null removes the ordinary request quota, preserving reads and challenges. */
  constructor(budgets: { requests?: number | null; reads?: number } = {}) {
    this.budgets = {
      requests: budgets.requests === null ? null : (budgets.requests ?? 60),
      reads: budgets.reads ?? 240,
    };
  }
  private readonly secret = randomBytes(32);
  private readonly entries = new Map<string, BudgetEntry>();

  admit(remote: string, challenge: boolean, read = false): void {
    // Unlimited writes neither consume nor allocate a protected IP bucket.
    if (this.budgets.requests === null && !challenge && !read) return;
    const entry = this.entry(remote);
    if (read) entry.reads++;
    else entry.requests++;
    if (challenge) entry.challenges++;
    if (
      read ? entry.reads > this.budgets.reads : this.writeBudgetExceeded(entry)
    )
      throw new AccountError(429, 'Muitos pedidos. Aguarde.');
  }
  private writeBudgetExceeded(entry: BudgetEntry): boolean {
    return (
      (this.budgets.requests !== null &&
        entry.requests > this.budgets.requests) ||
      entry.challenges > 6
    );
  }
  private entry(remote: string): BudgetEntry {
    const now = Date.now();
    this.expire(now);
    const key = createHmac('sha256', this.secret).update(remote).digest('hex');
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= 256)
        throw new AccountError(429, 'Muitos pedidos. Aguarde.');
      entry = { expires: now + 60_000, requests: 0, challenges: 0, reads: 0 };
      this.entries.set(key, entry);
    }
    return entry;
  }
  private expire(now: number): void {
    for (const [key, entry] of this.entries)
      if (entry.expires <= now) this.entries.delete(key);
  }
  close(): void {
    this.entries.clear();
    this.secret.fill(0);
  }
}
