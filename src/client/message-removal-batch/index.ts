import { removalFailure } from '../own-removals/index.ts';

export type MessageRemovalResult = { id: string } & PromiseSettledResult<void>;

export function assertRemovalBatch(targets: readonly { id: string }[]): void {
  if (
    targets.length > 64 ||
    new Set(targets.map((target) => target.id)).size !== targets.length
  )
    throw new Error('Select up to 64 distinct messages at a time.');
}

/** One authorized client turn, at most four independent signed requests in
 * flight. All replies settle before the caller reads the conversation once. */
export async function removeMessageBatch<T extends { id: string }>(
  targets: readonly T[],
  remove: (target: T) => Promise<unknown>,
): Promise<MessageRemovalResult[]> {
  assertRemovalBatch(targets);
  const results: MessageRemovalResult[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < targets.length) {
      const index = next++,
        target = targets[index]!;
      try {
        await remove(target);
        results[index] = {
          id: target.id,
          status: 'fulfilled',
          value: undefined,
        };
      } catch (reason: unknown) {
        results[index] = { id: target.id, status: 'rejected', reason };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, targets.length) }, worker),
  );
  return results;
}

/** A lost reply is success only when the ordinary verified read proves it.
 * A refused deletion never becomes success merely because its row is absent. */
export async function verifyMessageRemovals(
  results: readonly MessageRemovalResult[],
  verification: {
    refresh: () => Promise<unknown>;
    done: (id: string) => boolean;
  },
): Promise<MessageRemovalResult[]> {
  try {
    await verification.refresh();
  } catch (error: unknown) {
    const uncertain = results.find(
      (result) =>
        result.status === 'rejected' &&
        removalFailure(result.reason) === 'uncertain',
    );
    if (uncertain?.status === 'rejected') throw uncertain.reason;
    throw error;
  }
  return results.map((result) =>
    result.status === 'rejected' &&
    removalFailure(result.reason) === 'uncertain' &&
    verification.done(result.id)
      ? { id: result.id, status: 'fulfilled', value: undefined }
      : result,
  );
}
