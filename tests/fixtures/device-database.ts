/** Only the IDB record transaction contract; cryptography stays real. */
export function deviceDatabase(): IDBFactory {
  const records = new Map<string, unknown>();
  return {
    open() {
      const opening: { result: unknown; onsuccess?: () => void } = {
        result: {
          close() {},
          transaction() {
            const transaction: {
              oncomplete?: () => void;
              abort(): void;
              objectStore(): unknown;
            } = {
              abort() {},
              objectStore: () => ({
                get(key: string) {
                  const request: { result: unknown; onsuccess?: () => void } = {
                    result: structuredClone(records.get(key)),
                  };
                  queueMicrotask(() => {
                    request.onsuccess?.();
                    transaction.oncomplete?.();
                  });
                  return request;
                },
                put(value: unknown, key: string) {
                  records.set(key, structuredClone(value));
                },
                add(value: unknown, key: string) {
                  if (records.has(key)) throw new Error('Duplicate IDB record');
                  records.set(key, structuredClone(value));
                },
              }),
            };
            return transaction;
          },
        },
      };
      queueMicrotask(() => opening.onsuccess?.());
      return opening;
    },
  } as unknown as IDBFactory;
}
