import { AccountError } from '../../shared/account/index.ts';
import { reserveOperationMemory } from '../memory-admission/index.ts';

const requestBytes = 131_072;

function reserve(reason: string): () => void {
  const release = reserveOperationMemory(requestBytes);
  if (!release) throw new AccountError(429, reason);
  return release;
}

/** Bounds transient authentication work before asynchronous validation or SQL. */
export async function withTemporaryAdmission<T>(
  reason: string,
  work: () => Promise<T>,
): Promise<T> {
  const release = reserve(reason);
  try {
    return await work();
  } finally {
    release();
  }
}

interface Entry<T> {
  value: T;
  expires: number;
  release: () => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Owns opaque authentication state and its memory until removal or expiry. */
export class TemporaryRequests<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly options: {
    unavailable: string;
    now?: () => number;
    removed?: (id: string, value: T) => void;
  };
  private closed = false;

  constructor(options: TemporaryRequests<T>['options']) {
    this.options = options;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  add(id: string, value: T, expires: number, replacing?: T): boolean {
    const remaining = expires - this.now();
    if (this.closed || !(remaining > 0 && remaining <= 300_000)) return false;
    const current = this.get(id);
    if (this.entries.has(id) && current !== replacing) return false;
    const release = reserve(this.options.unavailable);
    if (this.entries.has(id)) this.delete(id, current);
    const timer = setTimeout(() => this.expire(id, value), remaining);
    timer.unref();
    this.entries.set(id, { value, expires, release, timer });
    return true;
  }

  private expire(id: string, value: T): void {
    const entry = this.entries.get(id);
    if (!entry || entry.value !== value) return;
    const remaining = entry.expires - this.now();
    if (remaining <= 0) {
      this.delete(id, value);
      return;
    }
    entry.timer = setTimeout(() => this.expire(id, value), remaining);
    entry.timer.unref();
  }

  get(id: string): T | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.delete(id, entry.value);
      return undefined;
    }
    return entry.value;
  }

  delete(id: string, expected?: T): void {
    const entry = this.entries.get(id);
    if (!entry || (expected !== undefined && entry.value !== expected)) return;
    this.entries.delete(id);
    clearTimeout(entry.timer);
    entry.release();
    this.options.removed?.(id, entry.value);
  }

  close(): void {
    this.closed = true;
    for (const id of this.entries.keys()) this.delete(id);
  }
}
