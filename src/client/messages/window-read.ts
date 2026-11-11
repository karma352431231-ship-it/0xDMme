import type { MessageItem } from './history.ts';

/** Reuse authenticated copies first; opening and indexing keep their own owners.
 * A transport group must return every requested packet before publication. */
export async function readMessageWindow<T extends { id: string }>(input: {
  items: MessageItem[];
  cached: (item: MessageItem) => Promise<T | null>;
  missing: (items: MessageItem[]) => Promise<Map<string, T>>;
  complete: (views: T[]) => Promise<void>;
}): Promise<T[]> {
  const views = new Map<string, T>(),
    missing: MessageItem[] = [];
  // Cached reads only decrypt and verify local copies; SDK/missing work stays serialized.
  for (let offset = 0; offset < input.items.length; offset += 2) {
    const page = input.items.slice(offset, offset + 2);
    const cached = await Promise.allSettled(
      page.map((item) => input.cached(item)),
    );
    for (const [index, result] of cached.entries()) {
      if (result.status === 'rejected') {
        const error: unknown = result.reason;
        throw error;
      }
      const item = page[index]!;
      if (result.value) views.set(item.id, result.value);
      else missing.push(item);
    }
  }
  if (missing.length)
    for (const [id, view] of await input.missing(missing)) views.set(id, view);
  const ordered = input.items.map((item) => {
    const view = views.get(item.id);
    if (!view || view.id !== item.id)
      throw new Error('Message window is incomplete.');
    return view;
  });
  await input.complete(ordered);
  return ordered;
}
