import { t } from '../../shared/i18n/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import type { PublicPostMedia } from '../../shared/public-media/index.ts';
import {
  stickerReferences,
  withoutStickerLinks,
} from '../../shared/stickers/index.ts';
import type { StickerReference } from '../../shared/stickers/index.ts';
import { externalMediaGate } from '../external-media/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { gifUrls, renderGif, withoutGifLinks } from '../gif-search/index.ts';
import {
  openImageGallery,
  scrollTap,
  watchScrollTaps,
} from '../image-viewer/index.ts';
import type { GalleryItem } from '../image-viewer/index.ts';
import { publicPostMediaBlob } from '../public-media/index.ts';
import { stickerFigure, stickerViewSource } from '../stickers/index.ts';

/**
 * A post's pictures, GIFs and stickers as small squares that open one
 * gallery viewer over all of them (owner, 25/11/2026). The reply sheet shows
 * them as a row under "Replying to"; a reply with several items shows them
 * as a 2×2 grid whose fourth square counts the rest. Everything read here,
 * object URLs included, lives as long as `signal`.
 */
export interface TileOptions {
  signal: AbortSignal;
  privacy?: ExternalMediaConsent | undefined;
  /**
   * 'shown' draws GIFs only once external media is allowed (the reply sheet,
   * whose post preview keeps the choice); 'gated' asks in the square.
   */
  gifs: 'shown' | 'gated';
}
interface Tile {
  element: HTMLElement;
  item: GalleryItem;
}

/** GIF links a post draws (the post card shows at most three). */
function postGifs(post: Pick<CommunityPost, 'text'>): string[] {
  return gifUrls(post.text).slice(0, 3);
}
/** The words of a post whose GIF and sticker links are drawn as tiles. */
export function withoutTileLinks(text: string): string {
  return withoutStickerLinks(
    withoutGifLinks(text, gifUrls(text)),
    stickerReferences(text),
  );
}
/** How many squares a post would show, and whether one is a video. */
export function postMediaCount(post: Pick<CommunityPost, 'text' | 'media'>): {
  count: number;
  video: boolean;
} {
  const media = post.media ?? [];
  return {
    count:
      media.length +
      postGifs(post).length +
      stickerReferences(post.text).length,
    video: media.some((item) => item.result.kind === 'video'),
  };
}

function objectUrl(blob: Blob, signal: AbortSignal): string {
  const url = URL.createObjectURL(blob);
  signal.addEventListener('abort', () => URL.revokeObjectURL(url), {
    once: true,
  });
  return url;
}

/** A square that acts as a button around content that may hold its own. */
function square(label: string, open: () => void): HTMLElement {
  const element = document.createElement('span');
  element.className = 'post-media-tile';
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', label);
  watchScrollTaps();
  element.addEventListener('click', (event) => {
    // The consent button of a GIF square answers on its own.
    if (event.target instanceof Element && event.target.closest('button'))
      return;
    event.preventDefault();
    event.stopPropagation();
    // The end of a scroll is not a tap on the square (26/11/2026).
    if (scrollTap()) return;
    open();
  });
  element.addEventListener('keydown', (event) => {
    if (event.target !== element) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open();
  });
  return element;
}

function pictureTile(
  media: PublicPostMedia,
  signal: AbortSignal,
  open: () => void,
): Tile {
  const element = square(t('Open photo'), open);
  void publicPostMediaBlob(media, true, signal)
    .then((blob) => {
      if (signal.aborted) return;
      const image = document.createElement('img');
      image.alt = '';
      image.decoding = 'async';
      image.src = objectUrl(blob, signal);
      element.append(image);
    })
    .catch(() => {
      // The square stays as a placeholder; the gallery skips what fails.
    });
  let full: Promise<string> | null = null;
  return {
    element,
    item: {
      alt: '',
      load: () => {
        full ??= publicPostMediaBlob(media, false, signal).then((blob) =>
          objectUrl(blob, signal),
        );
        full.catch(() => {
          full = null;
        });
        return full.then((url) => ({ url }));
      },
    },
  };
}

function gifTile(url: string, options: TileOptions, open: () => void): Tile {
  const element = square('GIF', open);
  element.classList.add('is-gif');
  if (options.gifs === 'shown' || !options.privacy) renderGif(element, url);
  else
    externalMediaGate(element, {
      consent: options.privacy,
      kind: 'gifs',
      signal: options.signal,
      label: t('Show GIF'),
      automatic: true,
      render: (target) => renderGif(target, url),
    });
  return {
    element,
    item: {
      alt: 'GIF',
      load: () => {
        // A clip opens only after the reader allowed it in the square.
        if (!element.querySelector('video, img'))
          return Promise.reject(new Error('GIF not allowed.'));
        // A clip can become a video sticker (26/11/2026).
        return Promise.resolve({ url, clip: url.endsWith('.mp4') });
      },
    },
  };
}

function stickerTile(
  sticker: StickerReference,
  options: TileOptions,
  open: () => void,
): Tile {
  const figure = stickerFigure(sticker, {
    privacy: options.privacy,
    signal: options.signal,
  });
  const element = square(t('Sticker'), open);
  element.classList.add('is-sticker');
  element.append(figure);
  let owned: string | null = null;
  return {
    element,
    item: {
      alt: t('Sticker'),
      load: () => {
        if (owned) return Promise.resolve({ url: owned, action: false });
        const source = stickerViewSource(figure);
        if (!source) return Promise.reject(new Error('Sticker unavailable.'));
        if (source.clip)
          return Promise.resolve({
            url: source.url,
            clip: true,
            action: false,
          });
        if (source.owned) {
          owned = source.url;
          options.signal.addEventListener(
            'abort',
            () => URL.revokeObjectURL(source.url),
            { once: true },
          );
        }
        return Promise.resolve({ url: source.url, action: false });
      },
    },
  };
}

/**
 * Squares for a post's pictures (not videos), GIF links and stickers, in
 * that order; each opens the gallery of all of them at its own place.
 */
export function postMediaTiles(
  post: Pick<CommunityPost, 'text' | 'media'>,
  options: TileOptions,
): HTMLElement[] {
  const tiles: Tile[] = [];
  const opener = (index: number) => () =>
    openImageGallery({
      items: tiles.map((tile) => tile.item),
      start: index,
      trigger: tiles[index]!.element,
      signal: options.signal,
    });
  const add = (build: (open: () => void) => Tile) =>
    tiles.push(build(opener(tiles.length)));
  for (const media of post.media ?? [])
    if (media.result.kind !== 'video')
      add((open) => pictureTile(media, options.signal, open));
  if (options.gifs === 'gated' || options.privacy?.permitted('gifs'))
    for (const url of postGifs(post))
      add((open) => gifTile(url, options, open));
  for (const sticker of stickerReferences(post.text))
    add((open) => stickerTile(sticker, options, open));
  return tiles.map((tile) => tile.element);
}

/**
 * A reply with two or more items and no video (owner choice A, 25/11/2026):
 * the first four squares in a 2×2 grid; past four, the fourth counts the
 * rest and still opens the gallery there. Returns null when the reply keeps
 * its usual full-size media.
 */
export function replyMediaGrid(
  post: Pick<CommunityPost, 'text' | 'media'>,
  options: { signal: AbortSignal; privacy?: ExternalMediaConsent | undefined },
): HTMLElement | null {
  const { count, video } = postMediaCount(post);
  if (count < 2 || video) return null;
  const tiles = postMediaTiles(post, { ...options, gifs: 'gated' });
  const grid = document.createElement('div');
  grid.className = 'reply-media-grid';
  // Squares past the fourth stay in the page, hidden, so their GIF consent
  // and sticker artwork resolve for the gallery like the visible ones.
  grid.append(...tiles);
  for (const tile of tiles.slice(4)) tile.classList.add('is-overflow');
  if (tiles.length > 4) {
    const more = document.createElement('span');
    more.className = 'post-media-more';
    more.textContent = `+${tiles.length - 4}`;
    tiles[3]!.append(more);
    tiles[3]!.setAttribute(
      'aria-label',
      t('{0} more', [String(tiles.length - 4)]),
    );
  }
  return grid;
}
