import {
  explorePage,
  feedPage,
} from '../../shared/community-discovery/index.ts';

export type DiscoveryPage =
  | { kind: 'explore'; value: ReturnType<typeof explorePage> }
  | { kind: 'feed'; value: ReturnType<typeof feedPage> };

/** Only the currently rendered, bounded public page can retain its DOM.
 * Every response is validated before comparison; removal markers, counts,
 * filters and cursors participate in the identity. No network read is skipped. */
export class DiscoverySnapshot {
  private identity = '';
  clear(): void {
    this.identity = '';
  }
  read(view: string, query: string, raw: unknown) {
    const page: DiscoveryPage =
      view === 'explore'
        ? { kind: 'explore', value: explorePage(raw) }
        : { kind: 'feed', value: feedPage(raw) };
    const identity = JSON.stringify([view, query, page]);
    const changed = identity !== this.identity;
    this.identity = identity;
    return { page, changed };
  }
}
