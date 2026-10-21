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
  for (const item of input.items) {
    const cached = await input.cached(item);
    if (cached) views.set(item.id, cached);
    else missing.push(item);
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
