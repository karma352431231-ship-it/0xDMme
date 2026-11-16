import { galleryItems, tileSource } from './classify.ts';
import type { GalleryMedia } from './classify.ts';
import type { DailyRow, DailyView } from '../daily-text/index.ts';
import { MediaMemory } from '../media-memory/index.ts';
import { prepareGalleryPicture } from './picture.ts';
import { historyPage } from '../history-window/index.ts';

export type GalleryRow = DailyRow & { sentAt?: number };
export interface GallerySource<V extends GalleryRow> {
  page: (
    before: number | null,
    signal: AbortSignal,
  ) => Promise<{
    views: readonly DailyView<V>[];
    next: number | null;
  }>;
  media: (
    view: DailyView<V>,
    thumbnail: boolean,
    signal: AbortSignal,
  ) => Promise<Uint8Array<ArrayBuffer> | null>;
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
  private pictures = new MediaMemory();
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Map<string, GalleryMedia<V>>();
  private readonly files = new Map<string, DailyView<V>>();
  private readonly reads = new Map<
    string,
    Promise<Uint8Array<ArrayBuffer> | null>
  >();
  private running = 0;
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
        this.pump();
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
    this.source = create();
    void this.collect(this.source, this.abort.signal);
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
    this.pictures.clear();
    this.pictures = new MediaMemory();
    this.pending.clear();
    this.files.clear();
    this.reads.clear();
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
    this.prepare(identity, create, window ?? undefined);
  }
  picture(entry: GalleryMedia<V>): Promise<Uint8Array<ArrayBuffer> | null> {
    const source = this.source;
    if (!source) return Promise.resolve(null);
    const signal = this.abort.signal;
    if (!this.complete && !this.failure)
      return this.metadataReady(signal).then(() => {
        signal.throwIfAborted();
        return this.picture(entry);
      });
    if (this.failure)
      return Promise.reject(
        this.failure instanceof Error
          ? this.failure
          : new Error('Could not complete the operation.'),
      );
    const existing = this.reads.get(entry.view.id);
    if (existing) return existing;
    const reading = this.pictures.read(entry.view.id, 'thumbnail', async () => {
      const selected = tileSource(entry);
      const bytes = await source.media(entry.view, selected.thumbnail, signal);
      signal.throwIfAborted();
      if (!bytes) throw new Error('Preview unavailable.');
      return prepareGalleryPicture(bytes, selected.frameType, signal);
    });
    this.reads.set(entry.view.id, reading);
    void reading.then(
      () => this.finishPicture(entry.view.id, reading, signal),
      () => this.finishPicture(entry.view.id, reading, signal),
    );
    return reading;
  }
  private finishPicture(
    id: string,
    reading: Promise<Uint8Array<ArrayBuffer> | null>,
    signal: AbortSignal,
  ): void {
    if (signal.aborted || this.reads.get(id) !== reading) return;
    this.reads.delete(id);
  }
  private async collect(
    source: GallerySource<V>,
    signal: AbortSignal,
  ): Promise<void> {
    let before: number | null = null;
    try {
      do {
        const page = await source.page(before, signal);
        signal.throwIfAborted();
        this.remember(page.views);
        if (page.next !== null && before !== null && page.next >= before)
          throw new Error('Message window does not match.');
        before = page.next;
        this.complete = before === null;
        this.pump();
        this.changed();
        if (before !== null) await yieldPreparation(signal);
      } while (before !== null);
    } catch (error) {
      if (signal.aborted) return;
      this.failure = error;
      this.changed();
    }
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
    this.queueAttachments(items);
    this.replaceRows({ removed, kept, counts });
  }
  private queueAttachments(items: ReturnType<typeof galleryItems<V>>): void {
    const changed = (view: GalleryRow) =>
      this.rows.get(view.id)?.hash !== view.hash;
    for (const item of items.media)
      if (changed(item.view)) this.pending.set(item.view.id, item);
    for (const item of items.docs)
      if (changed(item.view)) this.files.set(item.view.id, item.view);
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
  private pump(): void {
    if (!this.complete) return;
    while (this.running < 2 && (this.pending.size || this.files.size)) {
      const entry = this.pending.values().next().value;
      const work = entry ? this.nextPicture(entry) : this.nextFile();
      this.running++;
      void work
        .catch(() => {
          // A visible tile retries through the same verified source.
        })
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }
  private metadataReady(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = () => {
        if (!this.complete && !this.failure && !signal.aborted) return;
        stop();
        signal.removeEventListener('abort', finish);
        if (signal.aborted) reject(new Error('Preview unavailable.'));
        else resolve();
      };
      const stop = this.subscribe(finish);
      signal.addEventListener('abort', finish, { once: true });
      finish();
    });
  }
  private nextPicture(
    entry: GalleryMedia<V>,
  ): Promise<Uint8Array<ArrayBuffer> | null> {
    this.pending.delete(entry.view.id);
    return this.picture(entry);
  }
  private async nextFile(): Promise<null> {
    const view = this.files.values().next().value!;
    this.files.delete(view.id);
    const source = this.source;
    if (!source) return null;
    const bytes = await source.media(view, false, this.abort.signal);
    bytes?.fill(0);
    return null;
  }
  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}

function catalogueBytes(row: GalleryRow): number {
  return JSON.stringify(row).length * 2 + 256;
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
