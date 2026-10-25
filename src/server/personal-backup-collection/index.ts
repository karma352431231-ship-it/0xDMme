import type { Database } from '../database/index.ts';
import type { ObjectStore } from '../object-store/index.ts';
/** Collect the store's bounded page. Never acknowledge an object before deletion;
 * errors propagate so immediate and scheduled callers retain retry obligations. */
export async function collectPersonalBackups(
  store: Pick<Database['backups'], 'garbage' | 'collected'>,
  objects: Pick<ObjectStore, 'discardPersonal'>,
): Promise<void> {
  for (const item of await store.garbage()) {
    await objects.discardPersonal(item.object_hash);
    await store.collected(item.account_id, item.id);
  }
}
