import { t } from '../../shared/i18n/index.ts';
import { validReaction } from '../../shared/daily/index.ts';
import { emojiCategories, emojiPageSize } from './catalog.ts';
import type { EmojiRow } from './catalog.ts';
import { EmojiArtwork } from './artwork.ts';
import { emojiCatalog, loadEmojiCatalog } from './catalog-source.ts';
import { recentEmojis } from './recents.ts';
const artwork = new EmojiArtwork();
const textRenders = new WeakMap<HTMLElement, object>();
export function emojiText(host: HTMLElement, text: string): void {
  const render = {};
  textRenders.set(host, render);
  host.textContent = text;
  if (!/(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u20e3)/u.test(text))
    return;
  void loadEmojiCatalog().then(
    (catalog) => {
      if (host.isConnected && textRenders.get(host) === render)
        artwork.text(host, text, catalog);
    },
    () => {
      // Unicode remains visible when optional artwork cannot be loaded.
    },
  );
}
function element<T extends HTMLElement>(
  host: HTMLElement,
  selector: string,
): T {
  const node = host.querySelector<T>(selector);
  if (!node) throw new Error('Emoji panel incomplete.');
  return node;
}
function option(host: HTMLSelectElement, value: string, label: string): void {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
  host.append(item);
}
/** Category dock icons, drawn here; the order follows emojiCategories. */
const categoryIcons = [
  '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
  '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  '<path d="M5 19c0-8 6-13 14-14-1 8-6 14-14 14zM5 19l7-7"/>',
  '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M11 3v3"/>',
  '<path d="M4 15l2-6h12l2 6v3H4zM7 18v2M17 18v2M6.5 15h.01M17.5 15h.01"/>',
  '<circle cx="12" cy="12" r="9"/><path d="M3.5 9.5c5 2 12 2 17 0M3.5 14.5c5-2 12-2 17 0M12 3v18"/>',
  '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z"/>',
  '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
] as const;
const tones = [
  ['all', '✋', t('All skin tones')],
  ['none', '✋', t('No modifier')],
  ['🏻', '✋🏻', t('Light')],
  ['🏼', '✋🏼', t('Medium light')],
  ['🏽', '✋🏽', t('Medium')],
  ['🏾', '✋🏾', t('Medium dark')],
  ['🏿', '✋🏿', t('Dark')],
] as const;
interface PanelOptions {
  selected: (emoji: string) => void;
  close: () => void;
  gifPane?: (host: HTMLElement, close: () => void) => void;
  start?: 'emoji' | 'gif';
}
/** Shared emoji content; presentation and composer insertion belong to callers. */
export class EmojiPanel {
  private readonly host: HTMLElement;
  private readonly options: PanelOptions;
  constructor(host: HTMLElement, options: PanelOptions) {
    this.host = host;
    this.options = options;
    host.innerHTML = t('html.81724dfa0bc5');
    this.bind(host);
    element(host, '[data-close]').addEventListener('click', options.close);
    if (options.gifPane) this.modes(host, options.gifPane);
    if (options.start === 'gif')
      element<HTMLButtonElement>(host, '[data-mode="gif"]').click();
    void artwork
      .ready()
      .then(() => {
        if (host.isConnected) this.credit();
      })
      .catch(() => {
        if (host.isConnected)
          element(host, '[data-art]').textContent = t(
            "Artwork unavailable. You can still choose emoji using this device's appearance.",
          );
      });
  }
  private credit(): void {
    element(this.host, '[data-art]').textContent = recentEmojis.persistent
      ? t('Twemoji artwork · CC-BY-4.0 · Recents saved on this device')
      : t('Twemoji artwork · CC-BY-4.0 · Recents only in this session');
  }
  private select(emoji: string): void {
    recentEmojis.choose(emoji);
    this.options.selected(emoji);
    if (!this.host.isConnected) return;
    this.renderRecent(
      this.host,
      element<HTMLInputElement>(this.host, '[data-query]').value.trim() !== '',
      element<HTMLSelectElement>(this.host, '[data-tone]').value,
    );
    this.credit();
  }
  private modes(
    dialog: HTMLElement,
    gifPane: (host: HTMLElement, close: () => void) => void,
  ): void {
    const modes = element(dialog, '[data-modes]'),
      pane = element(dialog, '[data-gif-pane]');
    modes.hidden = false;
    modes.append(element(dialog, '[data-close]'));
    let mounted = false;
    modes.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((tab) => {
      tab.addEventListener('click', () => {
        const gif = tab.dataset['mode'] === 'gif';
        dialog.dataset['mode'] = gif ? 'gif' : 'emoji';
        modes
          .querySelectorAll('[data-mode]')
          .forEach((other) =>
            other.setAttribute('aria-pressed', String(other === tab)),
          );
        pane.hidden = !gif;
        if (gif && !mounted) {
          mounted = true;
          gifPane(pane, () => this.options.close());
        }
      });
    });
  }
  private bind(dialog: HTMLElement): void {
    const query = element<HTMLInputElement>(dialog, '[data-query]'),
      tone = element<HTMLSelectElement>(dialog, '[data-tone]'),
      dock = element(dialog, '[data-dock]'),
      grid = element(dialog, '[data-grid]');
    for (const [value, glyph, label] of tones) {
      option(tone, value, glyph);
      tone.lastElementChild?.setAttribute('aria-label', label);
    }
    let category = '0',
      offset = 0,
      total = 0;
    const tabs = emojiCategories.map((label, i) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.title = label;
      tab.setAttribute('aria-label', label);
      tab.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${categoryIcons[i] ?? ''}</svg>`;
      tab.addEventListener('click', () => {
        category = String(i);
        query.value = '';
        render(true);
      });
      dock.append(tab);
      return tab;
    });
    const render = (fresh: boolean) => {
      if (fresh) {
        offset = 0;
        grid.replaceChildren();
        grid.scrollTop = 0;
      }
      const searching = query.value.trim() !== '';
      const catalog = emojiCatalog();
      const result = catalog.search({
        query: query.value,
        category: searching ? 'all' : category,
        tone: tone.value,
        offset,
        recent: recentEmojis.values(),
      });
      total = result.total;
      this.appendGlyphs(grid, result.entries);
      tabs.forEach((tab, i) =>
        tab.setAttribute(
          'aria-pressed',
          String(!searching && String(i) === category),
        ),
      );
      element(dialog, '[data-section-title]').textContent = searching
        ? t('Results')
        : (emojiCategories[Number(category)] ?? '');
      element(dialog, '[data-result]').textContent = total
        ? ''
        : t('No emoji found.');
      this.renderRecent(dialog, searching, tone.value);
      const typed = query.value.trim();
      element<HTMLButtonElement>(dialog, '[data-custom]').hidden =
        !typed || !validReaction(typed) || !!catalog.find(typed);
    };
    for (const control of [query, tone])
      control.addEventListener('input', () => {
        render(true);
      });
    // Next page loads as the grid scrolls, without pagination buttons.
    grid.addEventListener('scroll', () => {
      if (
        offset + emojiPageSize < total &&
        grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 80
      ) {
        offset += emojiPageSize;
        render(false);
      }
    });
    element(dialog, '[data-custom]').addEventListener('click', () => {
      const emoji = query.value.trim();
      if (emoji && validReaction(emoji)) this.select(emoji);
    });
    render(true);
    void loadEmojiCatalog().then(
      () => {
        if (dialog.isConnected) render(true);
      },
      () => {
        if (dialog.isConnected)
          element(dialog, '[data-result]').textContent = t(
            "Artwork unavailable. You can still choose emoji using this device's appearance.",
          );
      },
    );
  }
  private renderRecent(
    dialog: HTMLElement,
    searching: boolean,
    tone: string,
  ): void {
    const section = element(dialog, '[data-recent-section]');
    section.hidden = searching || !recentEmojis.values().length;
    if (section.hidden) return;
    const row = element(dialog, '[data-recent]');
    row.replaceChildren();
    this.appendGlyphs(
      row,
      emojiCatalog().search({
        query: '',
        category: 'recent',
        tone,
        offset: 0,
        recent: recentEmojis.values(),
      }).entries,
    );
  }
  private appendGlyphs(host: HTMLElement, rows: readonly EmojiRow[]): void {
    for (const row of rows) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = row[1];
      button.setAttribute('aria-label', row[1]);
      button.append(artwork.glyph(row[0], emojiCatalog()));
      button.addEventListener('click', () => this.select(row[0]));
      host.append(button);
    }
  }
}
