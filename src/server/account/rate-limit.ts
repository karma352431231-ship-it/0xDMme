import { createHmac, randomBytes } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';

/** No raw IP storage/logging or fingerprint. One minute, 256 entries maximum. */
export class AccountRateLimit {
  private readonly budgets: { requests: number; reads: number };
  constructor(budgets: { requests?: number; reads?: number } = {}) {
    this.budgets = {
      requests: budgets.requests ?? 60,
      reads: budgets.reads ?? 240,
    };
  }
  private readonly secret = randomBytes(32);
  private readonly entries = new Map<
    string,
    { expires: number; requests: number; challenges: number; reads: number }
  >();

  admit(remote: string, challenge: boolean, read = false): void {
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
    if (read) entry.reads++;
    else entry.requests++;
    if (challenge) entry.challenges++;
    if (
      read
        ? entry.reads > this.budgets.reads
        : entry.requests > this.budgets.requests || entry.challenges > 6
    )
      throw new AccountError(429, 'Muitos pedidos. Aguarde.');
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
