import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
/**
 * GIF catalog through KLIPY (owner decision of 09/10/2026, plan §5.11).
 *
 * The browser talks to KLIPY directly: search terms, the device IP and the GIFs
 * shown reach KLIPY. The message stays E2EE and carries only the media link.
 * No user identifier is sent and the page sends no referrer. The key comes from
 * the server configuration; without it the GIF tab is simply absent.
 */
import { gifMessageUrl } from './links.ts';
export { gifMessageUrl, gifUrls, withoutGifLinks } from './links.ts';
export { showExternalGif, showGifText, renderGif } from './presentation.ts';
export interface GifResult {
  id: string;
  title: string;
  /** Small animated preview for the picker grid. */
  preview: string;
  /** Looping clip sent in the message. */
  clip: string;
  width: number;
  height: number;
}
export interface GifPage {
  items: GifResult[];
  next: boolean;
}

const keyPattern = /^[A-Za-z0-9]{32,128}$/u;
const perPage = 24;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}
interface MediaFile {
  url: string;
  width: number;
  height: number;
}
function mediaFile(entry: Record<string, unknown> | null): MediaFile | null {
  const url = entry?.['url'],
    width = entry?.['width'],
    height = entry?.['height'];
  if (typeof url !== 'string' || !gifMessageUrl(url)) return null;
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  return width > 0 && height > 0 ? { url, width, height } : null;
}
function file(
  sizes: Record<string, unknown> | null,
  size: string,
  format: string,
): MediaFile | null {
  return mediaFile(record(record(sizes?.[size])?.[format]));
}
function gifResult(value: unknown): GifResult | null {
  const item = record(value);
  if (!item || item['type'] !== 'gif') return null;
  const sizes = record(item['file']);
  const preview = file(sizes, 'sm', 'webp') ?? file(sizes, 'sm', 'gif'),
    clip = file(sizes, 'md', 'mp4') ?? file(sizes, 'sm', 'mp4');
  if (!preview || !clip) return null;
  return {
    id: String(item['id']),
    title: typeof item['title'] === 'string' ? item['title'].slice(0, 120) : '',
    preview: preview.url,
    clip: clip.url,
    width: preview.width,
    height: preview.height,
  };
}

/** Validates an untrusted KLIPY page; anything unexpected is dropped. */
export function parseGifPage(value: unknown): GifPage {
  const page = record(record(value)?.['data']);
  const items = Array.isArray(page?.['data']) ? page['data'] : [];
  return {
    items: items
      .slice(0, perPage)
      .map(gifResult)
      .filter((item): item is GifResult => item !== null),
    next: page?.['has_next'] === true,
  };
}

export class GifSearch {
  private key: Promise<string | null> | null = null;
  private readonly consent: () => Promise<boolean>;
  private readonly context: () => AbortSignal;
  constructor(consent: () => Promise<boolean>, context: () => AbortSignal) {
    this.consent = consent;
    this.context = context;
  }

  /** Whether the server configured a KLIPY key; read once per page load. */
  available(): Promise<boolean> {
    return this.apiKey().then((key) => key !== null);
  }
  async page(input: { query: string; page: number }): Promise<GifPage> {
    const active = this.context();
    if (!(await this.consent()))
      throw new Error('Allow external GIFs in Profile to use KLIPY.');
    const key = await this.apiKey();
    if (!key) throw new Error('GIFs unavailable on this server.');
    active.throwIfAborted();
    if (!(await this.consent())) throw new Error('GIF permission withdrawn.');
    active.throwIfAborted();
    const query = input.query.trim().slice(0, 100);
    const params = new URLSearchParams({
      page: String(input.page),
      per_page: String(perPage),
      locale: currentLanguage() === 'zh-CN' ? 'zh_CN' : 'en_US',
    });
    if (query) params.set('q', query);
    const response = await fetch(
      `https://api.klipy.com/api/v1/${key}/gifs/${query ? 'search' : 'trending'}?${params.toString()}`,
      {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: AbortSignal.any([active, AbortSignal.timeout(8000)]),
      },
    );
    if (!response.ok) throw new Error('GIF search is currently unavailable.');
    const page = parseGifPage(await response.json());
    active.throwIfAborted();
    if (!(await this.consent())) throw new Error('GIF permission withdrawn.');
    return page;
  }
  private apiKey(): Promise<string | null> {
    this.key ??= fetch('/api/account/config', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        const key = record(record(data)?.['gifSearch'])?.['key'];
        return typeof key === 'string' && keyPattern.test(key) ? key : null;
      })
      .catch(() => {
        this.key = null;
        return null;
      });
    return this.key;
  }
}

/**
 * GIF tab for the emoji panel: trending first, search after a short pause,
 * more results while scrolling, and KLIPY attribution as its terms require.
 */
export function mountGifPane(
  host: HTMLElement,
  search: GifSearch,
  chosen: (url: string) => void,
): void {
  host.innerHTML = t('html.201618052901');
  const query = host.querySelector<HTMLInputElement>('[data-gif-query]'),
    grid = host.querySelector<HTMLElement>('[data-gif-grid]'),
    status = host.querySelector<HTMLElement>('[data-gif-status]');
  if (!query || !grid || !status) return;
  let page = 1,
    next = false,
    loading = false,
    generation = 0,
    timer = 0;
  const show = (result: GifPage): void => {
    for (const item of result.items) grid.append(gifTile(item, chosen));
    next = result.next;
    page++;
    status.textContent = grid.children.length ? '' : t('No GIFs found.');
  };
  const load = async (fresh: boolean): Promise<void> => {
    if (!canLoad(fresh)) return;
    const current = fresh ? ++generation : generation;
    if (fresh) {
      page = 1;
      grid.replaceChildren();
    }
    loading = true;
    status.textContent = t('Loading GIFs…');
    try {
      const result = await search.page({ query: query.value, page });
      if (current === generation && host.isConnected) show(result);
    } catch (error: unknown) {
      if (current === generation) status.textContent = failure(error);
    } finally {
      if (current === generation) loading = false;
    }
  };
  function canLoad(fresh: boolean): boolean {
    return host.isConnected && !host.hidden && (!loading || fresh);
  }
  query.addEventListener('input', () => {
    clearTimeout(timer);
    // A short pause keeps the shared request budget for real searches.
    timer = window.setTimeout(() => void load(true), 450);
  });
  grid.addEventListener('scroll', () => {
    if (
      next &&
      !loading &&
      grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 120
    )
      void load(false);
  });
  void load(true);
  query.focus();
}
function failure(error: unknown): string {
  return error instanceof Error
    ? translatedError(error.message)
    : t('GIFs unavailable.');
}
function gifTile(
  item: GifResult,
  chosen: (url: string) => void,
): HTMLButtonElement {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'gif-tile';
  tile.title = item.title;
  tile.setAttribute(
    'aria-label',
    item.title ? t('GIF: {0}', [item.title]) : 'GIF',
  );
  const image = document.createElement('img');
  image.src = item.preview;
  image.alt = '';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.width = item.width;
  image.height = item.height;
  tile.append(image);
  tile.addEventListener('click', () => {
    chosen(item.clip);
  });
  return tile;
}
