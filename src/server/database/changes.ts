import {
  isLiveChangeCategory,
  liveChangeCategories,
} from '../../shared/live-changes/index.ts';
import type { LiveChangeCategory } from '../../shared/live-changes/index.ts';
export interface CommittedChange {
  accounts: readonly string[];
  categories: readonly LiveChangeCategory[] | null;
  authorization: boolean;
  removed: boolean;
  revoked: readonly string[];
  ended: readonly string[];
}
interface Observer {
  notify: (change: CommittedChange) => void;
  failed: () => void;
}
/** Advisory, in-process events for the single web service. No content or durable queue. */
export class DatabaseChanges {
  private readonly listeners = new Set<Observer>();
  subscribe(observer: Observer): () => void {
    this.listeners.add(observer);
    return () => {
      this.listeners.delete(observer);
    };
  }
  private observer: Observer | null = null;
  /** A cross-process hint gap requires a fresh signed snapshot; call state stays local. */
  invalidateStreams(): void {
    this.observer?.failed();
  }
  observe(observer: Observer): () => void {
    if (this.observer) throw new Error('Change observer is already active.');
    this.observer = observer;
    return () => {
      if (this.observer === observer) this.observer = null;
    };
  }
  committed(
    accounts: Iterable<string>,
    details: {
      categories?: readonly LiveChangeCategory[] | null;
      authorization?: boolean;
      removed?: boolean;
      revoked?: readonly string[];
      ended?: readonly string[];
    } = {},
  ): void {
    const unique = [...new Set(accounts)];
    if (!unique.length) return;
    const change = {
      accounts: unique,
      categories: changeCategories(details.categories),
      authorization: details.authorization ?? false,
      removed: details.removed ?? false,
      revoked: details.revoked ?? [],
      ended: details.ended ?? [],
    };
    for (const listener of this.listeners) this.deliver(listener, change);
    if (this.observer) this.deliver(this.observer, change);
  }
  private deliver(observer: Observer, change: CommittedChange): void {
    try {
      observer.notify(change);
    } catch {
      // Never report a durable COMMIT as failed because an advisory event failed.
      // Closing channels forces a fresh snapshot instead of leaving a blind stream.
      observer.failed();
    }
  }
}

/** A legacy, empty, or unfamiliar scope requires general authenticated recovery. */
export function changeCategories(value: unknown): LiveChangeCategory[] | null {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > liveChangeCategories.length ||
    !value.every(isLiveChangeCategory)
  )
    return null;
  return [...new Set(value)];
}
