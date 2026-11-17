import { MediaMemory } from '../media-memory/index.ts';
import { historyWait, startLoad } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import type { GalleryMedia } from './classify.ts';
import type { DailyRow } from '../daily-text/index.ts';

type Picture = Uint8Array<ArrayBuffer>;
interface Job<V extends DailyRow> {
  entry: GalleryMedia<V>;
  promise: Promise<Picture | null>;
  resolve: (picture: Picture | null) => void;
  visible: boolean;
  started: boolean;
  trace: LoadTrace | undefined;
  admitted: () => void;
}

/** One conversation's picture work. Prioritize visible thumbnails and
 * coalesce tile requests with preparation already in progress. */
export class GalleryPictureQueue<V extends DailyRow> {
  private readonly jobs = new Map<string, Job<V>>();
  private readonly memory = new MediaMemory();
  private readonly signal: AbortSignal;
  private readonly load: (
    entry: GalleryMedia<V>,
    trace: LoadTrace | undefined,
    prepared: (picture: Picture) => void,
  ) => Promise<void>;
  private readonly admission: PictureAdmission;
  constructor(
    signal: AbortSignal,
    admission: PictureAdmission,
    load: GalleryPictureQueue<V>['load'],
  ) {
    this.signal = signal;
    this.admission = admission;
    this.load = load;
    signal.addEventListener('abort', () => this.clear(), { once: true });
  }
  warm(entries: readonly GalleryMedia<V>[]): void {
    for (const entry of entries) {
      if (entry.preview) this.enqueue(entry, false);
    }
    this.pump();
  }
  read(entry: GalleryMedia<V>): Promise<Picture | null> {
    if (this.signal.aborted) return Promise.resolve(null);
    if (this.memory.has(entry.view.id, 'thumbnail'))
      return this.memory.read(entry.view.id, 'thumbnail', () =>
        Promise.reject(new Error('Preview unavailable.')),
      );
    const job = this.enqueue(entry, true);
    this.pump();
    // Every tile owns its bytes. Background callers only use the stored copy.
    return job.promise.then((bytes) =>
      !this.signal.aborted && bytes ? Uint8Array.from(bytes) : null,
    );
  }
  private enqueue(entry: GalleryMedia<V>, visible: boolean): Job<V> {
    const previous = this.jobs.get(entry.view.id);
    if (previous) {
      previous.visible ||= visible;
      return previous;
    }
    let resolve!: Job<V>['resolve'];
    const promise = new Promise<Picture | null>((settle) => {
      resolve = settle;
    });
    const trace = startLoad('gallery-preview');
    const job = {
      entry,
      promise,
      resolve,
      visible,
      started: false,
      trace,
      admitted: historyWait(trace, 'queue'),
    };
    this.jobs.set(entry.view.id, job);
    return job;
  }
  private pump(): void {
    if (this.signal.aborted) return;
    this.admission.pump(this.next, this.run);
  }
  private next = (allowWarm: boolean): Job<V> | undefined => {
    const waiting = [...this.jobs.values()].filter((job) => !job.started);
    return (
      waiting.find((job) => job.visible) ?? (allowWarm ? waiting[0] : undefined)
    );
  };
  private run = async (job: Job<V>): Promise<void> => {
    job.started = true;
    job.admitted();
    try {
      await this.load(job.entry, job.trace, (picture) => {
        const stored = this.memory.read(job.entry.view.id, 'thumbnail', () =>
          Promise.resolve(picture),
        );
        void stored.then(job.resolve, () => job.resolve(null));
        job.trace?.point('published');
      });
      job.trace?.point(this.signal.aborted ? 'cancelled' : 'complete', {
        loadOutcome: this.signal.aborted ? 'cancelled' : 'complete',
      });
    } catch {
      job.resolve(null);
      job.trace?.point(this.signal.aborted ? 'cancelled' : 'failed');
    } finally {
      this.jobs.delete(job.entry.view.id);
    }
  };
  private clear(): void {
    this.memory.clear();
    for (const job of this.jobs.values()) {
      job.resolve(null);
      job.trace?.point('cancelled', { loadOutcome: 'cancelled' });
    }
    this.jobs.clear();
  }
}

/** Wait for the previous conversation's active reads to release their slots. */
export class PictureAdmission {
  private active = 0;
  private refill: (() => void) | undefined;
  pump<V extends DailyRow>(
    next: (allowWarm: boolean) => Job<V> | undefined,
    run: (job: Job<V>) => Promise<void>,
  ): void {
    this.refill = () => this.pump(next, run);
    while (this.active < 3) {
      const job = next(this.active < 2);
      if (!job) return;
      this.active++;
      void run(job).finally(() => {
        this.active--;
        this.refill?.();
      });
    }
  }
  clear(): void {
    this.refill = undefined;
  }
}
