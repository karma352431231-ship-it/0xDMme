import { t, translatedError } from '../../shared/i18n/index.ts';
import { stickerLink } from '../../shared/stickers/index.ts';
import type { GifSearch, KlipySticker } from '../gif-search/index.ts';
import { recentStickers } from './recents.ts';
import type { StickerSection, SectionView } from './pane.ts';

/**
 * KLIPY's sticker catalog (stage 2, 24/11/2026): trending first, search after
 * a short pause, more while scrolling. A chosen sticker stays a KLIPY link,
 * so it depends on KLIPY like its GIFs; nothing is copied.
 */
export function klipyStickerSection(
  search: GifSearch,
  chosen: (link: string) => void,
): StickerSection {
  return {
    id: 'klipy',
    label: 'KLIPY',
    icon: () => {
      const mark = document.createElement('span');
      mark.className = 'sticker-shelf-text';
      mark.textContent = 'K';
      return mark;
    },
    draw: (view) => drawCatalog(view, search, chosen),
  };
}

function catalogTile(
  item: KlipySticker,
  chosen: (link: string) => void,
): HTMLButtonElement {
  const button = document.createElement('button'),
    image = document.createElement('img');
  button.type = 'button';
  button.className = 'sticker-tile';
  button.setAttribute(
    'aria-label',
    item.title ? t('Sticker: {0}', [item.title]) : t('Sticker'),
  );
  image.src = item.preview;
  image.alt = '';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.width = item.width;
  image.height = item.height;
  button.append(image);
  button.addEventListener('click', () => {
    const link = stickerLink('klipy', item.path);
    recentStickers.choose(link);
    chosen(link);
  });
  return button;
}

function failureText(error: unknown): string {
  return error instanceof Error
    ? translatedError(error.message)
    : t('Stickers unavailable.');
}

/** One open catalog view: its query, paging and the latest request wins. */
class CatalogView {
  private page = 1;
  private next = false;
  private loading = false;
  private generation = 0;
  private readonly view: SectionView;
  private readonly search: GifSearch;
  private readonly chosen: (link: string) => void;
  readonly query = document.createElement('input');
  constructor(
    view: SectionView,
    search: GifSearch,
    chosen: (link: string) => void,
  ) {
    this.view = view;
    this.search = search;
    this.chosen = chosen;
  }
  async load(fresh: boolean): Promise<void> {
    if (this.view.signal.aborted || (this.loading && !fresh)) return;
    const current = this.begin(fresh);
    this.view.status.textContent = t('Loading stickers…');
    try {
      const result = await this.search.stickerPage({
        query: this.query.value,
        page: this.page,
      });
      if (current === this.generation && !this.view.signal.aborted)
        this.show(result.items, result.next);
    } catch (error: unknown) {
      if (current === this.generation)
        this.view.status.textContent = failureText(error);
    } finally {
      if (current === this.generation) this.loading = false;
    }
  }
  /** A fresh search restarts paging; either way the request is the latest. */
  private begin(fresh: boolean): number {
    if (fresh) {
      this.generation++;
      this.page = 1;
      this.view.grid.replaceChildren();
    }
    this.loading = true;
    return this.generation;
  }
  private show(items: readonly KlipySticker[], next: boolean): void {
    for (const item of items)
      this.view.grid.append(catalogTile(item, this.chosen));
    this.next = next;
    this.page++;
    this.view.status.textContent = this.view.grid.children.length
      ? ''
      : t('No stickers found.');
  }
  more(): void {
    const grid = this.view.grid;
    if (
      this.next &&
      !this.loading &&
      grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 120
    )
      void this.load(false);
  }
}

function drawCatalog(
  view: SectionView,
  search: GifSearch,
  chosen: (link: string) => void,
): () => void {
  const catalog = new CatalogView(view, search, chosen),
    field = document.createElement('label'),
    query = catalog.query,
    credit = document.createElement('small');
  field.className = 'emoji-search';
  query.type = 'search';
  query.maxLength = 100;
  query.autocomplete = 'off';
  query.placeholder = t('Search KLIPY stickers');
  query.setAttribute('aria-label', t('Search KLIPY stickers'));
  credit.className = 'emoji-credit';
  credit.textContent = t(
    'Powered by KLIPY · searches and stickers go through KLIPY',
  );
  field.append(query);
  view.tools.append(field);
  view.grid.after(credit);
  let timer = 0;
  query.addEventListener('input', () => {
    clearTimeout(timer);
    // A short pause keeps the shared request budget for real searches.
    timer = window.setTimeout(() => void catalog.load(true), 450);
  });
  view.grid.addEventListener('scroll', () => catalog.more(), {
    signal: view.signal,
  });
  void catalog.load(true);
  return () => {
    clearTimeout(timer);
    credit.remove();
  };
}
