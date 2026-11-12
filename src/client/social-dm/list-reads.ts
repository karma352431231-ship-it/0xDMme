import type { VaultWorkOptions } from '../vault-authority/index.ts';
import { WorkInterruption } from '../synchronization-work/index.ts';
import type { socialPage } from '../../shared/social-dm/index.ts';

type Page = ReturnType<typeof socialPage>;

/** Only equivalent in-flight reads share a turn. No settled result is cached.
 * The controller invalidates this owner on session or directory invalidation. */
export class SocialListReads {
  private generation = 0;
  private readonly pending = new Map<string, Promise<Page>>();
  clear(): void {
    this.generation++;
    this.pending.clear();
  }
  read(input: {
    after: string | null;
    options: VaultWorkOptions;
    load: () => Promise<Page>;
    observed: (shared: boolean) => void;
  }): Promise<Page> {
    const key = JSON.stringify([input.after, input.options.priority ?? null]);
    const held = this.pending.get(key);
    input.observed(!!held);
    if (held) return held;
    if (this.pending.size >= 64)
      return Promise.reject(new WorkInterruption('scheduler'));
    const generation = this.generation;
    const work = input
      .load()
      .then((page) => {
        if (generation !== this.generation)
          throw new WorkInterruption('replacement');
        return page;
      })
      .finally(() => {
        if (this.pending.get(key) === work) this.pending.delete(key);
      });
    this.pending.set(key, work);
    return work;
  }
}
