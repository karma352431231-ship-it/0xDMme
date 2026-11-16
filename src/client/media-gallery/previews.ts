type ReadPreview = (
  signal: AbortSignal,
) => Promise<Uint8Array<ArrayBuffer> | null>;
interface Preview {
  tile: HTMLElement;
  read: ReadPreview;
  visible: boolean;
  loading: boolean;
  image?: { url: string; element: HTMLElement };
}

/** Only tiles near the scroll viewport hold decoded media or start reads.
 * A read that outlives its tile still counts toward the concurrency limit. */
export class GalleryPreviews {
  private readonly observer: IntersectionObserver | null;
  private readonly tiles = new Map<Element, Preview>();
  private readonly pending = new Set<Preview>();
  private abort = new AbortController();
  private running = 0;
  constructor(body: HTMLElement) {
    this.observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                const preview = this.tiles.get(entry.target);
                if (preview) this.expose(preview, entry.isIntersecting);
              }
              this.pump();
            },
            { root: body, rootMargin: '140px 0px' },
          );
  }
  watch(tile: HTMLElement, read: ReadPreview): void {
    const preview = { tile, read, visible: false, loading: false };
    this.tiles.set(tile, preview);
    if (this.observer) this.observer.observe(tile);
    else {
      this.expose(preview, true);
      this.pump();
    }
  }
  forget(tile: HTMLElement): void {
    const preview = this.tiles.get(tile);
    if (!preview) return;
    this.expose(preview, false);
    this.observer?.unobserve(tile);
    this.tiles.delete(tile);
  }
  clear(): void {
    this.abort.abort();
    this.abort = new AbortController();
    for (const tile of this.tiles.values()) this.expose(tile, false);
    this.tiles.clear();
    this.observer?.disconnect();
  }
  private expose(preview: Preview, visible: boolean): void {
    preview.visible = visible;
    if (visible) {
      if (!preview.loading && !preview.image) this.pending.add(preview);
    } else {
      this.pending.delete(preview);
      if (preview.image) {
        preview.image.element.remove();
        URL.revokeObjectURL(preview.image.url);
        delete preview.image;
      }
    }
  }
  private pump(): void {
    while (this.running < 3 && this.pending.size) {
      const preview = this.pending.values().next().value!;
      this.pending.delete(preview);
      this.running++;
      preview.loading = true;
      void this.load(preview, this.abort.signal).finally(() => {
        this.running--;
        preview.loading = false;
        this.pump();
      });
    }
  }
  private async load(preview: Preview, signal: AbortSignal): Promise<void> {
    try {
      const bytes = await preview.read(signal);
      if (!bytes || signal.aborted || !preview.visible) return;
      const url = URL.createObjectURL(new Blob([bytes]));
      const element = previewImage(url);
      preview.image = { url, element };
      preview.tile.prepend(element);
    } catch {
      // The tile keeps its icon and still opens its message.
      if (!signal.aborted && preview.visible)
        preview.tile.dataset['unavailable'] = 'true';
    }
  }
}

function previewImage(url: string): HTMLImageElement {
  const image = document.createElement('img');
  image.alt = '';
  image.src = url;
  image.draggable = false;
  return image;
}
