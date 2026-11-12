import { t, currentLanguage } from '../../shared/i18n/index.ts';
import { animatedAttachmentContent } from '../../shared/attachments/index.ts';
import type { DailyRow, DailyView } from '../daily-text/index.ts';

export interface GalleryMonth {
  key: string;
  label: string;
}
interface GalleryEntry<V> {
  view: DailyView<V>;
  month: GalleryMonth;
}
export interface GalleryMedia<V> extends GalleryEntry<V> {
  video: boolean;
  name: string;
  /** Whether the sender attached a small preview to show in the grid. */
  preview: boolean;
}
export interface GalleryDoc<V> extends GalleryEntry<V> {
  name: string;
  bytes: number;
}
export interface GalleryLink<V> extends GalleryEntry<V> {
  url: string;
  host: string;
}
export interface GalleryItems<V> {
  media: GalleryMedia<V>[];
  docs: GalleryDoc<V>[];
  links: GalleryLink<V>[];
}
type GalleryRow = DailyRow & { sentAt?: number };

const linkPattern = /https?:\/\/[^\s<>"']+/gu;

/** "This month", then month names; the year only outside the current one. */
export function galleryMonth(
  sentAt: number | undefined,
  now = Date.now(),
): GalleryMonth {
  if (sentAt === undefined) return { key: 'unknown', label: t('Earlier') };
  const date = new Date(sentAt),
    today = new Date(now),
    key = `${date.getFullYear()}-${date.getMonth()}`;
  if (key === `${today.getFullYear()}-${today.getMonth()}`)
    return { key, label: t('This month') };
  return {
    key,
    label: new Intl.DateTimeFormat(currentLanguage(), {
      month: 'long',
      ...(date.getFullYear() === today.getFullYear()
        ? {}
        : { year: 'numeric' as const }),
    }).format(date),
  };
}

function attachment(view: DailyView<GalleryRow>) {
  try {
    return animatedAttachmentContent(JSON.parse(view.text) as unknown);
  } catch {
    // A row that is not a readable attachment simply has no media.
    return null;
  }
}

/**
 * The photos and videos, documents and links of the loaded messages, newest
 * first (owner, 12/11/2026). View-once messages and voice notes stay out.
 */
export function galleryItems<V extends GalleryRow>(
  views: readonly DailyView<V>[],
  now = Date.now(),
): GalleryItems<V> {
  const items: GalleryItems<V> = { media: [], docs: [], links: [] };
  const newest = [...views].sort(
    (a, b) =>
      (b.sentAt ?? 0) - (a.sentAt ?? 0) ||
      (b.sequence ?? 0) - (a.sequence ?? 0),
  );
  for (const view of newest) {
    if (view.content.viewOnce || view.kind === 'profile') continue;
    const month = galleryMonth(view.sentAt, now);
    if (view.kind === 'attachment') addAttachment(items, view, month);
    addLinks(items, view, month);
  }
  return items;
}

/** Photos and videos to the grid; other files except voice notes to Docs. */
function addAttachment<V extends GalleryRow>(
  items: GalleryItems<V>,
  view: DailyView<V>,
  month: GalleryMonth,
): void {
  const content = attachment(view);
  if (!content || content.voice) return;
  const video = content.type.startsWith('video/');
  if (content.image || video)
    items.media.push({
      view,
      month,
      video,
      name: content.name,
      preview: !!content.thumbnail,
    });
  else
    items.docs.push({
      view,
      month,
      name: content.name,
      bytes: content.file.ref.bytes,
    });
}

/** Every web link in the text or caption, without trailing punctuation. */
function addLinks<V extends GalleryRow>(
  items: GalleryItems<V>,
  view: DailyView<V>,
  month: GalleryMonth,
): void {
  for (const match of view.content.text.matchAll(linkPattern)) {
    const url = match[0].replace(/[).,;:!?]+$/u, '');
    try {
      items.links.push({ view, month, url, host: new URL(url).host });
    } catch {
      // Not a parseable URL; it stays plain text in the chat.
    }
  }
}

export function galleryCount<V>(items: GalleryItems<V>): number {
  return items.media.length + items.docs.length + items.links.length;
}
