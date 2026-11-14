import type { PrivateSendContext } from '../chat-sync-diagnostics/index.ts';
import { transaction } from './store.ts';
import type { RecordRow } from './store.ts';

/** Replace a bounded set of encrypted records and debit their shared budget atomically. */
export function localPutBatchWithin(input: {
  scope: string;
  records: readonly { name: string; value: unknown; size: number }[];
  maximum: number;
  diagnostic?: PrivateSendContext | undefined;
}): Promise<void> {
  const { scope, records, maximum } = input;
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < 0 ||
    !records.length ||
    records.length > 32 ||
    new Set(records.map((r) => r.name)).size !== records.length ||
    records.some((r) => !Number.isSafeInteger(r.size) || r.size < 0)
  )
    throw new Error('Invalid local budget.');
  return transaction(
    scope,
    (store, done) => {
      const old = records.map((r) => store.get([scope, r.name])),
        usage = store.get([scope, 'usage']);
      let remaining = records.length + 1;
      const update = () => {
        if (--remaining) return;
        const used = Number(
          (usage.result as RecordRow | undefined)?.value ?? 0,
        );
        const next =
          used +
          records.reduce(
            (total, r, index) =>
              total +
              r.size -
              ((old[index]!.result as RecordRow | undefined)?.size ?? 0),
            0,
          );
        if (!Number.isSafeInteger(next) || next < 0 || next > maximum) {
          store.transaction.abort();
          return;
        }
        for (const record of records) store.put({ scope, ...record });
        store.put({ scope, name: 'usage', value: next, size: 0 });
        done(undefined);
      };
      for (const request of [...old, usage]) request.onsuccess = update;
    },
    { context: input.diagnostic, current: () => true },
  );
}
