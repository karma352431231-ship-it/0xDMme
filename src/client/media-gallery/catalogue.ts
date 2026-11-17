import { galleryItems, tileSource } from './classify.ts';
import type { GalleryMedia } from './classify.ts';
import type { DailyRow, DailyView } from '../daily-text/index.ts';
import { GalleryPictureQueue, PictureAdmission } from './picture-queue.ts';
import { startLoad, timedLoad } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import type { MediaPreviews } from '../media-preview/index.ts';
import { prepareGalleryPicture } from './picture.ts';
import { historyPage } from '../history-window/index.ts';
import type { GalleryCheckpoint } from './checkpoint.ts';

export type GalleryRow = DailyRow & { sentAt?: number };
export interface GallerySource<V extends GalleryRow> {
  page: (
    before: number | null,
    signal: AbortSignal,
  ) => Promise<{
    views: readonly DailyView<V>[];
    next: number | null;
    cut?: string | null;
  }>;
  media: (
    view: DailyView<V>,
    thumbnail: boolean,
    signal: AbortSignal,
    trace?: LoadTrace,
  ) => Promise<Uint8Array<ArrayBuffer> | null>;
  previews?: (view: DailyView<V>, signal: AbortSignal) => MediaPreviews;
  checkpoint?: GalleryCheckpoint<V>;
  close: () => void;
}
export interface GallerySummary {
  count: () => number | null;
  subscribe: (changed: () => void) => () => void;
}
interface VerifiedWindow<V extends GalleryRow> {
  conversation: string;
  rows: readonly DailyView<V>[];
}

/** One conversation's complete verified catalogue and bounded preview memory.
 * Metadata preparation and preview reads progress independently of the chat DOM. */
export class MediaCatalogue<V extends GalleryRow> implements GallerySummary {
  private identity = '';
  private create: (() => GallerySource<V>) | null = null;
  private window: VerifiedWindow<V> | null = null;
  private bytes = 0;
  private source: GallerySource<V> | null = null;
  private abort = new AbortController();
  private readonly rows = new Map<string, DailyView<V>>();
  private readonly counts = new Map<string, number>();
  private total = 0;
  private pictures: GalleryPictureQueue<V> | null = null;
  private readonly admission = new PictureAdmission();
  private warmRemaining = 24;
  private readonly listeners = new Set<() => void>();
  private complete = false;
  private failure: unknown = null;
  count = (): number | null => (this.complete ? this.total : null);
  subscribe = (changed: () => void): (() => void) => {
    this.listeners.add(changed);
    return () => this.listeners.delete(changed);
  };
  views = (): readonly DailyView<V>[] => [...this.rows.values()];
  get loading(): boolean {
    return !!this.source && !this.complete && !this.failure;
  }
  get error(): unknown {
    return this.failure;
  }
  prepare(
    identity: string,
    create: () => GallerySource<V>,
    window?: VerifiedWindow<V>,
  ): void {
    if (identity === this.identity && this.source) return;
    if (
      window &&
      this.window &&
      this.source &&
      !this.failure &&
      appendedWindow(this.window, window)
    ) {
      this.identity = identity;
      this.window = window;
      try {
        this.remember(window.rows);
      } catch (error) {
        this.complete = false;
        this.failure = error;
      }
      this.changed();
      return;
    }
    this.clear();
    this.identity = identity;
    this.create = create;
    this.window = window ?? null;
    const source = create();
    const signal = this.abort.signal;
    this.source = source;
    this.pictures = new GalleryPictureQueue(
      signal,
      this.admission,
      (entry, trace, prepared) =>
        readPicture({ source, entry, signal, trace, prepared }),
    );
    void this.collect(source, signal);
  }
  clear(): void {
    if (!this.source && !this.identity) return;
    this.abort.abort();
    this.source?.close();
    this.source = null;
    this.window = null;
    this.bytes = 0;
    this.create = null;
    this.identity = '';
    this.abort = new AbortController();
    this.rows.clear();
    this.counts.clear();
    this.total = 0;
    this.pictures = null;
    this.admission.clear();
    this.warmRemaining = 24;
    this.complete = false;
    this.failure = null;
    this.changed();
  }
  retry(): void {
    if (this.failure) this.revalidate();
  }
  revalidate(): void {
    if (!this.create) return;
    const create = this.create,
      identity = this.identity,
      window = this.window;
    this.clear();
    this.prepare(identity, create);
    this.window = window;
  }
  picture(entry: GalleryMedia<V>): Promise<Uint8Array<ArrayBuffer> | null> {
    if (this.rows.get(entry.view.id)?.hash !== entry.view.hash)
      return Promise.resolve(null);
    return this.pictures?.read(entry) ?? Promise.resolve(null);
  }
  private async collect(
    source: GallerySource<V>,
    signal: AbortSignal,
  ): Promise<void> {
    const trace = startLoad('gallery-catalogue');
    try {
      const window = this.window;
      const seed = this.seed(window);
      if (await this.restore({ source, signal, trace, window, seed })) {
        this.finish(seed, trace);
        return;
      }
      const cut = await this.collectPages(source, signal, seed, trace);
      this.finish(seed, trace);
      if (cut && this.window === window)
        await source.checkpoint?.save({ cut, views: this.views() }, signal);
    } catch (error) {
      trace?.point(signal.aborted ? 'cancelled' : 'failed');
      if (signal.aborted) return;
      this.failure = error;
      this.changed();
    }
  }
  private seed(window: VerifiedWindow<V> | null): Set<string> {
    if (!window) return new Set();
    this.remember(window.rows);
    this.changed();
    return new Set(window.rows.map((row) => row.id));
  }
  private async restore(input: {
    source: GallerySource<V>;
    signal: AbortSignal;
    trace: LoadTrace | undefined;
    window: VerifiedWindow<V> | null;
    seed: Set<string>;
  }): Promise<boolean> {
    const { source, signal, trace, window, seed } = input;
    const checkpoint = source.checkpoint;
    if (!checkpoint) return false;
    const cached = await timedLoad(trace, 'gallery-cache', () =>
      checkpoint.read(signal),
    );
    signal.throwIfAborted();
    if (!cached || this.window !== window) return false;
    this.remember(cached);
    for (const view of cached) seed.delete(view.id);
    return true;
  }
  private async collectPages(
    source: GallerySource<V>,
    signal: AbortSignal,
    seed: Set<string>,
    trace: LoadTrace | undefined,
  ) {
    let before: number | null = null;
    let cut: string | null | undefined;
    do {
      const page = await timedLoad(trace, 'local-history', () =>
        source.page(before, signal),
      );
      signal.throwIfAborted();
      for (const view of page.views) seed.delete(view.id);
      this.remember(page.views);
      if (page.next !== null && before !== null && page.next >= before)
        throw new Error('Message window does not match.');
      cut = mergeCut(cut, page.cut ?? null);
      before = page.next;
      this.changed();
      if (before !== null) await yieldPreparation(signal);
    } while (before !== null);
    return cut;
  }
  private finish(
    stale: ReadonlySet<string>,
    trace: LoadTrace | undefined,
  ): void {
    for (const id of stale) this.bytes -= catalogueBytes(this.rows.get(id));
    this.replaceRows({ removed: stale, kept: new Map(), counts: new Map() });
    this.complete = true;
    trace?.point('complete', { loadOutcome: 'complete', loadRows: this.total });
    this.changed();
  }
  private remember(views: readonly DailyView<V>[]): void {
    const items = galleryItems(views);
    const kept = new Map(
      [...items.media, ...items.docs, ...items.links].map((item) => [
        item.view.id,
        item.view,
      ]),
    );
    const counts = new Map<string, number>();
    for (const item of [...items.media, ...items.docs, ...items.links])
      counts.set(item.view.id, (counts.get(item.view.id) ?? 0) + 1);
    const removed = new Set(views.map((view) => view.id));
    let bytes = this.bytes;
    for (const id of removed) {
      const previous = this.rows.get(id);
      if (previous) bytes -= catalogueBytes(previous);
    }
    for (const row of kept.values()) {
      bytes += catalogueBytes(row);
    }
    if (bytes > 8 * 1024 * 1024)
      throw new Error('Media catalogue exceeds the device memory budget.');
    this.bytes = bytes;
    const warm = items.media
      .filter(
        (item) =>
          item.preview && this.rows.get(item.view.id)?.hash !== item.view.hash,
      )
      .slice(0, this.warmRemaining);
    this.replaceRows({ removed, kept, counts });
    this.warmRemaining -= warm.length;
    this.pictures?.warm(warm);
  }
  private replaceRows(page: {
    removed: ReadonlySet<string>;
    kept: ReadonlyMap<string, DailyView<V>>;
    counts: ReadonlyMap<string, number>;
  }): void {
    const { removed, kept, counts } = page;
    for (const id of removed) {
      this.rows.delete(id);
      this.total -= this.counts.get(id) ?? 0;
      this.counts.delete(id);
    }
    for (const [id, count] of counts) {
      this.counts.set(id, count);
      this.total += count;
    }
    for (const row of kept.values()) this.rows.set(row.id, row);
  }
  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}

function mergeCut(
  previous: string | null | undefined,
  current: string | null,
): string | null {
  return previous === undefined || previous === current ? current : null;
}

async function readPicture<V extends GalleryRow>(input: {
  source: GallerySource<V>;
  entry: GalleryMedia<V>;
  signal: AbortSignal;
  trace: LoadTrace | undefined;
  prepared: (picture: Uint8Array<ArrayBuffer>) => void;
}): Promise<void> {
  const { source, entry, signal, trace, prepared } = input;
  const cache = source.previews?.(entry.view, signal);
  const cached = cache
    ? await timedLoad(trace, 'gallery-cache', cache.read)
    : null;
  if (cached) {
    prepared(currentPicture(cached, signal));
    return;
  }
  const selected = tileSource(entry);
  if (!selected.thumbnail) throw new Error('Preview unavailable.');
  const bytes = await source.media(
    entry.view,
    selected.thumbnail,
    signal,
    trace,
  );
  if (!bytes) throw new Error('Preview unavailable.');
  const picture = await timedLoad(trace, 'decode', () =>
    prepareGalleryPicture(currentPicture(bytes, signal), signal),
  );
  prepared(currentPicture(picture, signal));
  // The visible tile gets its bytes before the optional encrypted write.
  if (cache)
    await timedLoad(trace, 'gallery-cache-save', () => cache.save(picture));
}

function currentPicture(bytes: Uint8Array<ArrayBuffer>, signal: AbortSignal) {
  if (signal.aborted) {
    bytes.fill(0);
    signal.throwIfAborted();
  }
  return bytes;
}

function catalogueBytes(row: GalleryRow | undefined): number {
  return row ? JSON.stringify(row).length * 2 + 256 : 0;
}

/** A verified append can update counts without interrupting prepared pictures.
 * Changed or removed rows return to full verification instead. */
function appendedWindow<V extends GalleryRow>(
  before: VerifiedWindow<V>,
  after: VerifiedWindow<V>,
): boolean {
  if (before.conversation !== after.conversation || !after.rows.length)
    return false;
  const previousNewest = Math.max(
    0,
    ...before.rows.map((row) => row.sequence ?? 0),
  );
  if (!after.rows.some((row) => (row.sequence ?? 0) > previousNewest))
    return false;
  const oldest = Math.min(...after.rows.map((row) => row.sequence ?? 0));
  const current = new Map(after.rows.map((row) => [row.id, row]));
  return before.rows
    .filter((row) => (row.sequence ?? 0) >= oldest)
    .every(
      (row) => JSON.stringify(current.get(row.id)) === JSON.stringify(row),
    );
}

export function catalogueIdentity(
  conversation: string,
  rows: readonly GalleryRow[],
): string {
  const roots = rows
    .filter((row) => !row.relation && row.kind !== 'profile')
    .slice(-historyPage);
  const ids = new Set(roots.map((row) => row.id));
  const relevant = rows.filter(
    (row) => row.relation && ids.has(row.relation.id),
  );
  return JSON.stringify([
    conversation,
    [...roots, ...relevant].map((row) => [
      row.id,
      row.hash,
      row.text,
      'content' in row ? row.content : null,
    ]),
  ]);
}

function yieldPreparation(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, 25);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
}
