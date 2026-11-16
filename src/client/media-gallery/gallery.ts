import {
  t,
  currentLanguage,
  translatedError,
} from '../../shared/i18n/index.ts';
import { menuIcon } from '../menu-icons/index.ts';
import type { DailyRow, DailyView } from '../daily-text/index.ts';
import { galleryItems, tileSource } from './classify.ts';
import type {
  GalleryDoc,
  GalleryItems,
  GalleryLink,
  GalleryMedia,
  GalleryMonth,
} from './classify.ts';
import { watchGalleryHistory } from './history.ts';
import type { GalleryOlderHistory } from './history.ts';
import { GalleryPreviews } from './previews.ts';
import type { MediaCatalogue } from './catalogue.ts';

type Tab = 'media' | 'docs' | 'links';
type GalleryRow = DailyRow & { sentAt?: number };
type KeepRow = (key: string, create: () => HTMLElement) => HTMLElement;

/** What one conversation lends the gallery; its history owner keeps the data. */
export interface GalleryPort<V extends GalleryRow> {
  title: string;
  /** The messages loaded and decrypted on this device. */
  views: () => readonly DailyView<V>[];
  /**
   * The sender's small preview (thumbnail) or, when there is none, the file
   * itself: photos sent as originals and videos carry no preview.
   */
  media: (
    view: DailyView<V>,
    thumbnail: boolean,
    signal: AbortSignal,
  ) => Promise<Uint8Array<ArrayBuffer> | null>;
  older?: GalleryOlderHistory;
  catalogue?: MediaCatalogue<V>;
  /** Shows the message in its conversation. */
  open: (view: DailyView<V>) => void;
}

/**
 * Media, Docs and Links of one conversation, grouped by month (owner,
 * 12/11/2026). The dialog owns the lifetime of its projection, previews,
 * and older page requests.
 */
export class MediaGallery<V extends GalleryRow> {
  private readonly dialog = document.createElement('dialog');
  private readonly title = document.createElement('h2');
  private readonly tabs = document.createElement('div');
  private readonly body = document.createElement('div');
  private readonly list = document.createElement('div');
  private readonly notice = document.createElement('p');
  private readonly previews = new GalleryPreviews(this.body);
  private rows = new Map<string, HTMLElement>();
  private port: GalleryPort<V> | null = null;
  private tab: Tab = 'media';
  private lifetime: AbortController | null = null;
  private checkHistory: (() => void) | undefined;
  constructor() {
    this.dialog.className = 'media-gallery';
    this.dialog.setAttribute('aria-labelledby', 'media-gallery-title');
    const header = document.createElement('header'),
      close = document.createElement('button');
    close.type = 'button';
    close.className = 'info-icon';
    close.setAttribute('aria-label', t('Close'));
    close.append(menuIcon('close'));
    close.addEventListener('click', () => this.close());
    this.title.id = 'media-gallery-title';
    header.append(close, this.title);
    this.tabs.className = 'media-gallery-tabs';
    this.tabs.setAttribute('role', 'tablist');
    for (const [id, label] of [
      ['media', t('Media')],
      ['docs', t('Docs')],
      ['links', t('Links')],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.dataset['tab'] = id;
      button.textContent = label;
      button.addEventListener('click', () => this.selectTab(id));
      this.tabs.append(button);
    }
    this.body.className = 'media-gallery-body';
    this.notice.className = 'media-gallery-notice';
    this.notice.setAttribute('role', 'status');
    this.body.append(this.list, this.notice);
    this.dialog.append(header, this.tabs, this.body);
    this.dialog.addEventListener('close', () => {
      if (!this.dialog.open) this.release();
    });
    this.bindBackdrop();
    document.body.append(this.dialog);
  }
  show(port: GalleryPort<V>): void {
    this.release();
    this.port = port;
    port.catalogue?.retry();
    this.tab = 'media';
    this.title.textContent = port.title;
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
    this.body.scrollTop = 0;
    this.lifetime = new AbortController();
    if (port.catalogue) {
      const update = () => {
        this.render();
        this.notice.textContent = catalogueNotice(port.catalogue!);
      };
      const stop = port.catalogue.subscribe(update);
      this.lifetime.signal.addEventListener('abort', stop, { once: true });
      update();
    }
    if (port.older)
      this.checkHistory = watchGalleryHistory({
        body: this.body,
        notice: this.notice,
        older: port.older,
        repaint: () => this.render(),
        signal: this.lifetime.signal,
      });
  }
  close(): void {
    if (this.dialog.open) this.dialog.close();
    this.release();
  }
  private release(): void {
    this.lifetime?.abort();
    this.lifetime = null;
    this.checkHistory = undefined;
    this.port = null;
    this.clearRows();
    this.notice.textContent = '';
  }
  private clearRows(): void {
    this.previews.clear();
    this.rows.clear();
    this.list.replaceChildren();
  }
  private selectTab(tab: Tab): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.clearRows();
    this.body.scrollTop = 0;
    this.render();
    this.checkHistory?.();
  }
  private bindBackdrop(): void {
    let startedOutside = false;
    this.dialog.addEventListener('pointerdown', (event) => {
      startedOutside = event.button === 0 && outside(this.dialog, event);
    });
    this.dialog.addEventListener('pointercancel', () => {
      startedOutside = false;
    });
    this.dialog.addEventListener('click', (event) => {
      const dismiss = startedOutside && outside(this.dialog, event);
      startedOutside = false;
      if (dismiss) this.close();
    });
  }
  private render(): void {
    if (!this.port) return;
    for (const button of this.tabs.querySelectorAll<HTMLElement>('button'))
      button.setAttribute(
        'aria-selected',
        String(button.dataset['tab'] === this.tab),
      );
    const top = this.body.scrollTop;
    const focused = this.dialog.ownerDocument.activeElement;
    const next = new Map<string, HTMLElement>();
    const sections = this.sections(
      galleryItems(this.port.views()),
      (key, create) => {
        const row = this.rows.get(key) ?? create();
        next.set(key, row);
        return row;
      },
    );
    for (const [key, row] of this.rows)
      if (!next.has(key)) this.previews.forget(row);
    this.rows = next;
    if (!sections.length && this.showEmpty()) sections.push(this.empty());
    this.list.replaceChildren(...sections);
    this.body.scrollTop = top;
    if (focused instanceof HTMLElement && this.list.contains(focused))
      focused.focus({ preventScroll: true });
  }
  private showEmpty(): boolean {
    return !this.port?.older?.available() && !this.port?.catalogue?.loading;
  }
  private sections(items: GalleryItems<V>, keep: KeepRow): HTMLElement[] {
    if (this.tab === 'media')
      return byMonth(items.media).map(([month, entries]) =>
        this.section(
          month,
          'media-gallery-grid',
          entries.map((e) => keep(rowKey(e.view), () => this.tile(e))),
        ),
      );
    if (this.tab === 'docs')
      return byMonth(items.docs).map(([month, entries]) =>
        this.section(
          month,
          'media-gallery-list',
          entries.map((e) => keep(rowKey(e.view), () => this.doc(e))),
        ),
      );
    return byMonth(items.links).map(([month, entries]) =>
      this.section(
        month,
        'media-gallery-list',
        entries.map((e, index) =>
          keep(JSON.stringify([rowKey(e.view), e.url, index]), () =>
            this.link(e),
          ),
        ),
      ),
    );
  }
  private section(
    month: GalleryMonth,
    className: string,
    children: HTMLElement[],
  ): HTMLElement {
    const section = document.createElement('section'),
      heading = document.createElement('h3'),
      list = document.createElement('div');
    heading.textContent = month.label;
    list.className = className;
    list.append(...children);
    section.append(heading, list);
    return section;
  }
  private empty(): HTMLElement {
    const empty = document.createElement('p');
    empty.className = 'media-gallery-empty';
    empty.textContent =
      this.tab === 'media'
        ? t('No photos or videos yet.')
        : this.tab === 'docs'
          ? t('No documents yet.')
          : t('No links yet.');
    return empty;
  }
  private opener(view: DailyView<V>): () => void {
    return () => {
      const port = this.port;
      this.close();
      port?.open(view);
    };
  }
  private tile(entry: GalleryMedia<V>): HTMLElement {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'media-gallery-tile';
    tile.setAttribute('aria-label', entry.name);
    tile.title = entry.name;
    tile.append(menuIcon(entry.video ? 'video' : 'image'));
    if (entry.video) tile.dataset['video'] = 'true';
    tile.addEventListener('click', this.opener(entry.view));
    const port = this.port!;
    const source = tileSource(entry);
    this.previews.watch(
      tile,
      (signal) =>
        port.catalogue
          ? port.catalogue.picture(entry)
          : port.media(entry.view, source.thumbnail, signal),
      port.catalogue ? null : source.frameType,
    );
    return tile;
  }
  private doc(entry: GalleryDoc<V>): HTMLElement {
    const row = rowButton('file', entry.name, [
      t('{0} MB', [(entry.bytes / 1_000_000).toFixed(2)]),
      dateText(entry.view.sentAt),
    ]);
    row.addEventListener('click', this.opener(entry.view));
    return row;
  }
  private link(entry: GalleryLink<V>): HTMLElement {
    const row = rowButton('link', entry.host, [
      entry.url,
      dateText(entry.view.sentAt),
    ]);
    row.addEventListener('click', this.opener(entry.view));
    return row;
  }
}

function rowKey(view: GalleryRow): string {
  return JSON.stringify([view.id, view.hash]);
}

function catalogueNotice(catalogue: {
  loading: boolean;
  error: unknown;
}): string {
  if (catalogue.loading) return t('Loading…');
  if (!catalogue.error) return '';
  return catalogue.error instanceof Error
    ? translatedError(catalogue.error.message)
    : t('Could not complete the operation.');
}

function outside(dialog: HTMLDialogElement, event: MouseEvent): boolean {
  if (event.target !== dialog) return false;
  const bounds = dialog.getBoundingClientRect();
  return (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  );
}

function byMonth<E extends { month: GalleryMonth }>(
  entries: readonly E[],
): [GalleryMonth, E[]][] {
  const months = new Map<string, [GalleryMonth, E[]]>();
  for (const entry of entries) {
    const group = months.get(entry.month.key) ?? [entry.month, []];
    group[1].push(entry);
    months.set(entry.month.key, group);
  }
  return [...months.values()];
}

function rowButton(
  icon: 'file' | 'link',
  title: string,
  details: string[],
): HTMLButtonElement {
  const row = document.createElement('button'),
    copy = document.createElement('span'),
    name = document.createElement('strong'),
    detail = document.createElement('small');
  row.type = 'button';
  row.className = 'media-gallery-row';
  name.textContent = title;
  detail.textContent = details.filter(Boolean).join(' · ');
  copy.append(name, detail);
  row.append(menuIcon(icon), copy);
  return row;
}

function dateText(sentAt: number | undefined): string {
  return sentAt === undefined
    ? ''
    : new Date(sentAt).toLocaleDateString(currentLanguage(), {
        day: 'numeric',
        month: 'short',
      });
}
