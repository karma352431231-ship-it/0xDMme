import { canonical } from '../../shared/devices/index.ts';
import { readMessageDelta } from './delta.ts';
import type { Api, MessageItem } from './history.ts';

/** The validated change manifest of the one frozen journal cut being applied.
 * Memory only, bounded by the delta contract to 256 metadata items without
 * bodies. Later pages of the same cut reuse it instead of fetching it again;
 * every turn still confirms the cut's fence on the server. A restart, another
 * cut or any failure fetches it again. */
export class JournalManifest {
  private retained: { key: string; items: readonly MessageItem[] } | null =
    null;
  async read(
    api: Api,
    from: unknown,
    snapshot: unknown,
  ): Promise<readonly MessageItem[] | null> {
    const key = canonical([from, snapshot]);
    if (this.retained?.key === key) return this.retained.items;
    this.retained = null;
    const items = await readMessageDelta(api, from, snapshot);
    if (items !== null) this.retained = { key, items };
    return items;
  }
  clear(): void {
    this.retained = null;
  }
}
