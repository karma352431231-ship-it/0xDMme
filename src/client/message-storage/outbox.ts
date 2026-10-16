import { vaultQuota } from '../../shared/vault/index.ts';
import { transaction } from './store.ts';
import type { RecordRow } from './store.ts';

const prefix = 'outbox-order:';
const indexBytes = 128;
const row = (request: IDBRequest): RecordRow | undefined =>
  request.result as RecordRow | undefined;
function validBudget(sequence: number, used: number): boolean {
  return (
    Number.isSafeInteger(sequence) &&
    sequence > 0 &&
    Number.isSafeInteger(used) &&
    used >= 0 &&
    used <= vaultQuota
  );
}

/** Ciphertext, its FIFO position and quota debit commit together. Retries never
 * replace an existing packet. No database version or historical key changes. */
export function enqueueOutbox(input: {
  scope: string;
  id: string;
  value: object;
  size: number;
  current: () => boolean;
}): Promise<void> {
  const { scope, id, value, size, current } = input;
  if (!Number.isSafeInteger(size) || size < 0)
    throw new Error('Orçamento local inválido.');
  return transaction(scope, (store, done) => {
    const old = store.get([scope, `outbox:${id}`]),
      usage = store.get([scope, 'usage']),
      sequence = store.get([scope, 'outbox-sequence']);
    let reads = 0;
    const update = () => {
      if (++reads !== 3) return;
      if (!current()) {
        store.transaction.abort();
        return;
      }
      if (row(old)) {
        done(undefined);
        return;
      }
      const next = Number(row(sequence)?.value ?? 0) + 1,
        used = Number(row(usage)?.value ?? 0) + size + indexBytes;
      if (!validBudget(next, used)) {
        store.transaction.abort();
        return;
      }
      const order = `${prefix}${String(next).padStart(16, '0')}:${id}`;
      store.put({
        scope,
        name: `outbox:${id}`,
        value: { ...value, outboxOrder: order },
        size,
      });
      store.put({ scope, name: order, value: id, size: indexBytes });
      store.put({ scope, name: 'outbox-sequence', value: next, size: 0 });
      store.put({ scope, name: 'usage', value: used, size: 0 });
      done(undefined);
    };
    old.onsuccess = update;
    usage.onsuccess = update;
    sequence.onsuccess = update;
  });
}

/** At most sixteen ordered lookups in one short transaction. Legacy drafts
 * retain their original format and are read once the ordered page is empty. */
export function outboxPage<T>(
  scope: string,
  names?: readonly string[],
): Promise<{ name: string; value: T }[]> {
  return transaction(scope, (store, done) => {
    if (names) {
      if (names.length > 16) {
        store.transaction.abort();
        return;
      }
      readEntries(
        store,
        { scope, entries: names.map((name) => ({ name })) },
        done,
      );
      return;
    }
    const request = store.getAll(
      IDBKeyRange.bound([scope, prefix], [scope, prefix + '\uffff']),
      16,
    );
    request.onsuccess = () => {
      const indexes = request.result as RecordRow[];
      if (!indexes.length) {
        legacyPage(store, scope, done);
        return;
      }
      if (indexes.some((index) => typeof index.value !== 'string')) {
        store.transaction.abort();
        return;
      }
      readEntries(
        store,
        {
          scope,
          entries: indexes.map((index) => ({
            name: `outbox:${index.value as string}`,
            order: index.name,
          })),
        },
        done,
      );
    };
  });
}
function readEntries<T>(
  store: IDBObjectStore,
  input: {
    scope: string;
    entries: readonly { name: string; order?: string }[];
  },
  done: (rows: { name: string; value: T }[]) => void,
): void {
  let remaining = input.entries.length,
    stale = 0;
  const result: { name: string; value: T }[] = [];
  if (!remaining) {
    done([]);
    return;
  }
  for (const [position, entry] of input.entries.entries()) {
    const request = store.get([input.scope, entry.name]);
    request.onsuccess = () => {
      const found = row(request);
      if (found)
        result[position] = { name: entry.name, value: found.value as T };
      else if (entry.order) {
        store.delete([input.scope, entry.order]);
        stale++;
      }
      if (--remaining === 0)
        finishIndexedRead(store, { scope: input.scope, stale }, () =>
          done(result.filter(Boolean)),
        );
    };
  }
}
/** An older client may have consumed a draft without knowing its new index.
 * Clean at most one bounded page; never infer acceptance or remove a draft. */
function finishIndexedRead(
  store: IDBObjectStore,
  input: { scope: string; stale: number },
  done: () => void,
): void {
  if (!input.stale) {
    done();
    return;
  }
  const request = store.get([input.scope, 'usage']);
  request.onsuccess = () => {
    store.put({
      scope: input.scope,
      name: 'usage',
      value: Math.max(
        0,
        Number(row(request)?.value ?? 0) - input.stale * indexBytes,
      ),
      size: 0,
    });
    done();
  };
}
function legacyPage<T>(
  store: IDBObjectStore,
  scope: string,
  done: (rows: { name: string; value: T }[]) => void,
): void {
  const request = store.getAll(
    IDBKeyRange.bound([scope, 'outbox:'], [scope, 'outbox:\uffff']),
    16,
  );
  request.onsuccess = () =>
    done(
      (request.result as RecordRow[]).map((item) => ({
        name: item.name,
        value: item.value as T,
      })),
    );
}
function orderName(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('outboxOrder' in value))
    return null;
  return typeof value.outboxOrder === 'string' &&
    value.outboxOrder.startsWith(prefix)
    ? value.outboxOrder
    : null;
}
export function removeOutbox(scope: string, name: string): Promise<void> {
  return transaction(scope, (store, done) => {
    const old = store.get([scope, name]),
      usage = store.get([scope, 'usage']);
    let reads = 0;
    const remove = () => {
      if (++reads !== 2) return;
      const previous = row(old),
        order = orderName(previous?.value);
      store.delete([scope, name]);
      if (order) store.delete([scope, order]);
      store.put({
        scope,
        name: 'usage',
        value: Math.max(
          0,
          Number(row(usage)?.value ?? 0) -
            (previous?.size ?? 0) -
            (order ? indexBytes : 0),
        ),
        size: 0,
      });
      done(undefined);
    };
    old.onsuccess = remove;
    usage.onsuccess = remove;
  });
}
