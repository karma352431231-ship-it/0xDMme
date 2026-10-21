import type pg from 'pg';
import type { LiveChangeCategory } from '../../shared/live-changes/index.ts';
import type { DatabaseChanges } from './changes.ts';

export interface ChangeDetails {
  category?: LiveChangeCategory;
  authorization?: boolean;
}
interface AccountChange {
  categories: Set<LiveChangeCategory>;
  unclassified: boolean;
  authorization: boolean;
  removed: boolean;
}
interface ChangeGroup {
  accounts: string[];
  categories: LiveChangeCategory[] | null;
  authorization: boolean;
  removed: boolean;
}
/** Transaction-local hints retain each account's scope; they contain no payloads. */
export class ChangeBatch {
  private readonly accounts = new Map<string, AccountChange>();
  add(
    accounts: readonly string[],
    details: ChangeDetails,
    removed = false,
  ): void {
    for (const account of accounts) {
      const pending = this.accounts.get(account) ?? {
        categories: new Set<LiveChangeCategory>(),
        unclassified: false,
        authorization: false,
        removed: false,
      };
      if (details.category) pending.categories.add(details.category);
      else pending.unclassified = true;
      pending.authorization ||= details.authorization === true;
      pending.removed ||= removed;
      this.accounts.set(account, pending);
    }
  }
  groups(): ChangeGroup[] {
    const groups = new Map<string, ChangeGroup>();
    for (const [account, pending] of this.accounts) {
      const categories = pending.unclassified
        ? null
        : [...pending.categories].sort();
      const key = JSON.stringify([
        categories,
        pending.authorization,
        pending.removed,
      ]);
      const group = groups.get(key) ?? {
        accounts: [],
        categories,
        authorization: pending.authorization,
        removed: pending.removed,
      };
      group.accounts.push(account);
      groups.set(key, group);
    }
    return [...groups.values()];
  }
}
/** Owns registration and delivery only; the caller owns COMMIT and rollback. */
export class TransactionChanges {
  private readonly active = new WeakMap<pg.PoolClient, ChangeBatch>();
  private readonly changes: DatabaseChanges | undefined;
  private readonly relayChanges: boolean;
  constructor(changes: DatabaseChanges | undefined, relayChanges: boolean) {
    this.changes = changes;
    this.relayChanges = relayChanges;
  }
  attach(client: pg.PoolClient, batch: ChangeBatch): void {
    this.active.set(client, batch);
  }
  detach(client: pg.PoolClient): void {
    this.active.delete(client);
  }
  changed(
    client: pg.PoolClient,
    accounts: readonly string[],
    details: ChangeDetails,
  ): void {
    this.batch(client).add(accounts, details);
  }
  removed(
    client: pg.PoolClient,
    accounts: readonly string[],
    category?: LiveChangeCategory,
  ): void {
    this.batch(client).add(accounts, category ? { category } : {}, true);
  }
  private batch(client: pg.PoolClient): ChangeBatch {
    const batch = this.active.get(client);
    if (!batch) throw new Error('Change requires a coordinated transaction.');
    return batch;
  }
  async relay(client: pg.PoolClient, batch: ChangeBatch): Promise<void> {
    if (!this.relayChanges) return;
    for (const group of batch.groups())
      for (let offset = 0; offset < group.accounts.length; offset += 64)
        await client.query("SELECT pg_notify('hash_talk_content_changes',$1)", [
          JSON.stringify({
            ...group,
            accounts: group.accounts.slice(offset, offset + 64),
          }),
        ]);
  }
  committed(batch: ChangeBatch): void {
    for (const group of batch.groups())
      this.changes?.committed(group.accounts, group);
  }
}
