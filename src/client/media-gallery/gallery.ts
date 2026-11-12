import {
  t,
  translatedError,
  currentLanguage,
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

type Tab = 'media' | 'docs' | 'links';
type GalleryRow = DailyRow & { sentAt?: number };

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
  older?: { available: () => boolean; load: () => Promise<boolean> };
  /** Shows the message in its conversation. */
  open: (view: DailyView<V>) => void;
}

// Previews are read at most three at a time while the gallery is open.
const previewConcurrency = 3;

/**
 * Media, Docs and Links of one conversation, grouped by month (owner,
 * 12/11/2026). Owns its dialog, the preview reads and their object URLs,
 * all released on close.
 */
export class MediaGallery<V extends GalleryRow> {
  private readonly dialog = document.createElement('dialog');
  private readonly title = document.createElement('h2');
  private readonly tabs = document.createElement('div');
  private readonly body = document.createElement('div');
  private readonly footer = document.createElement('div');
  private readonly notice = document.createElement('p');
  private port: GalleryPort<V> | null = null;
  private tab: Tab = 'media';
  private abort = new AbortController();
  private readonly urls = new Set<string>();
  private queue: (() => Promise<void>)[] = [];
  private running = 0;
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
      button.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      this.tabs.append(button);
    }
    this.body.className = 'media-gallery-body';
    this.footer.className = 'media-gallery-footer';
    this.notice.className = 'media-gallery-notice';
    this.notice.setAttribute('role', 'status');
    this.dialog.append(header, this.tabs, this.body, this.notice, this.footer);
    this.dialog.addEventListener('close', () => this.release());
    document.body.append(this.dialog);
  }
  show(port: GalleryPort<V>): void {
    this.release();
    this.port = port;
    this.tab = 'media';
    this.title.textContent = port.title;
    this.render();
    if (!this.dialog.open) this.dialog.showModal();
  }
  close(): void {
    if (this.dialog.open) this.dialog.close();
    this.release();
  }
  private release(): void {
    this.abort.abort();
    this.abort = new AbortController();
    this.queue = [];
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.body.replaceChildren();
    this.notice.textContent = '';
  }
  private render(): void {
    const port = this.port;
    if (!port) return;
    // Previews of the previous tab stop; their URLs are released.
    this.abort.abort();
    this.abort = new AbortController();
    this.queue = [];
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    for (const button of this.tabs.querySelectorAll<HTMLElement>('button'))
      button.setAttribute(
        'aria-selected',
        String(button.dataset['tab'] === this.tab),
      );
    const items = galleryItems(port.views());
    this.body.replaceChildren(...this.sections(items));
    if (!this.body.children.length) this.body.append(this.empty());
    this.renderFooter(port);
  }
  private sections(items: GalleryItems<V>): HTMLElement[] {
    if (this.tab === 'media')
      return byMonth(items.media).map(([month, entries]) =>
        this.section(
          month,
          'media-gallery-grid',
          entries.map((e) => this.tile(e)),
        ),
      );
    if (this.tab === 'docs')
      return byMonth(items.docs).map(([month, entries]) =>
        this.section(
          month,
          'media-gallery-list',
          entries.map((e) => this.doc(e)),
        ),
      );
    return byMonth(items.links).map(([month, entries]) =>
      this.section(
        month,
        'media-gallery-list',
        entries.map((e) => this.link(e)),
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
        ? t('No photos or videos in the loaded messages.')
        : this.tab === 'docs'
          ? t('No documents in the loaded messages.')
          : t('No links in the loaded messages.');
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
    this.loadPreview(tile, entry);
    return tile;
  }
  private loadPreview(tile: HTMLElement, entry: GalleryMedia<V>): void {
    const port = this.port,
      signal = this.abort.signal;
    if (!port) return;
    this.queue.push(async () => {
      if (signal.aborted) return;
      try {
        const source = tileSource(entry),
          bytes = await port.media(entry.view, source.thumbnail, signal);
        if (!bytes || signal.aborted) return;
        const url = URL.createObjectURL(
          new Blob([bytes], source.frameType ? { type: source.frameType } : {}),
        );
        this.urls.add(url);
        tile.prepend(source.frameType ? firstFrame(url) : previewImage(url));
      } catch {
        // The tile keeps its icon; opening the message still works.
        tile.dataset['unavailable'] = 'true';
      }
    });
    this.pump();
  }
  private pump(): void {
    while (this.running < previewConcurrency && this.queue.length) {
      const next = this.queue.shift()!;
      this.running++;
      void next().finally(() => {
        this.running--;
        this.pump();
      });
    }
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
  private renderFooter(port: GalleryPort<V>): void {
    this.footer.replaceChildren();
    const hint = document.createElement('small');
    hint.textContent = t('Shows the messages loaded on this device.');
    this.footer.append(hint);
    const older = port.older;
    if (!older?.available()) return;
    const more = document.createElement('button');
    more.type = 'button';
    more.textContent = t('Load earlier messages');
    more.addEventListener('click', () => {
      more.disabled = true;
      this.notice.textContent = t('Loading…');
      older.load().then(
        () => {
          this.notice.textContent = '';
          this.render();
        },
        (error: unknown) => {
          more.disabled = false;
          this.notice.textContent =
            error instanceof Error
              ? translatedError(error.message)
              : t('Could not complete the operation.');
        },
      );
    });
    this.footer.append(more);
  }
}

function previewImage(url: string): HTMLImageElement {
  const image = document.createElement('img');
  image.alt = '';
  image.src = url;
  image.draggable = false;
  return image;
}

/** A still of a video's opening; iOS paints it only for a seek past 0. */
function firstFrame(url: string): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.disablePictureInPicture = true;
  video.tabIndex = -1;
  video.setAttribute('aria-hidden', 'true');
  video.src = `${url}#t=0.1`;
  return video;
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
