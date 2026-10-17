/** IDB IO adapter only: ordered compound keys, serial read/write transactions
 * and atomic commit/abort. The outbox/index/quota algorithms stay real. */
export function recordDatabase() {
  let records = new Map<string, unknown>(),
    previous = Promise.resolve();
  const key = (value: readonly string[]) => value.join('\u0000');
  interface Request {
    result: unknown;
    onsuccess?: () => void;
  }
  interface Range {
    lower: readonly string[];
    upper: readonly string[];
    lowerOpen: boolean;
  }
  function transaction() {
    const start = previous;
    let release = () => {},
      working = new Map<string, unknown>(),
      pending = 0,
      closed = false;
    previous = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = start.then(() => {
      working = structuredClone(records);
    });
    const tx = {
      oncomplete: undefined as (() => void) | undefined,
      onabort: undefined as (() => void) | undefined,
      abort() {
        if (closed) return;
        closed = true;
        release();
        tx.onabort?.();
      },
      objectStore: () => store,
    };
    function commit() {
      if (closed || pending !== 0) return;
      closed = true;
      records = working;
      release();
      tx.oncomplete?.();
    }
    function request(read: () => unknown): Request {
      const result: Request = { result: undefined };
      pending++;
      void ready
        .then(() => {
          if (closed) return;
          result.result = structuredClone(read());
          result.onsuccess?.();
        })
        .catch(() => tx.abort())
        .finally(() => {
          pending--;
          commit();
        });
      return result;
    }
    const store = {
      transaction: tx,
      get: (value: readonly string[]) => request(() => working.get(key(value))),
      put(value: { scope: string; name: string }) {
        working.set(key([value.scope, value.name]), structuredClone(value));
      },
      delete(value: readonly string[]) {
        working.delete(key(value));
      },
      getAll(range: Range, maximum: number) {
        return request(() =>
          [...working.entries()]
            .filter(([name]) =>
              range.lowerOpen
                ? name > key(range.lower)
                : name >= key(range.lower),
            )
            .filter(([name]) => name <= key(range.upper))
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .slice(0, maximum)
            .map(([, value]) => value),
        );
      },
    };
    return tx;
  }
  return {
    factory: {
      open() {
        const opening: Request = { result: { close() {}, transaction } };
        queueMicrotask(() => opening.onsuccess?.());
        return opening;
      },
    } as unknown as IDBFactory,
    range: {
      bound: (
        lower: readonly string[],
        upper: readonly string[],
        lowerOpen = false,
      ) => ({ lower, upper, lowerOpen }),
    },
  };
}
