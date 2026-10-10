import { validReaction } from '../../shared/daily/index.ts';
import {
  EmojiCatalog,
  emojiCategories,
  emojiPageSize,
  insertEmoji,
} from './catalog.ts';
import type { EmojiRow } from './catalog.ts';
import { EmojiArtwork } from './artwork.ts';

declare const EMOJI_CATALOG: readonly EmojiRow[];
const catalog = new EmojiCatalog(
  typeof EMOJI_CATALOG === 'undefined' ? [] : EMOJI_CATALOG,
);
const artwork = new EmojiArtwork();
export { EmojiCatalog, insertEmoji };
export type { EmojiRow };
export function emojiText(host: HTMLElement, text: string): void {
  artwork.text(host, text, catalog);
}

function element<T extends HTMLElement>(
  host: HTMLElement,
  selector: string,
): T {
  const node = host.querySelector<T>(selector);
  if (!node) throw new Error('Painel de emojis incompleto.');
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
  ['all', '✋', 'Todos os tons'],
  ['none', '✋', 'Sem modificador'],
  ['🏻', '✋🏻', 'Clara'],
  ['🏼', '✋🏼', 'Média clara'],
  ['🏽', '✋🏽', 'Média'],
  ['🏾', '✋🏾', 'Média escura'],
  ['🏿', '✋🏿', 'Escura'],
] as const;
export class EmojiPicker {
  private recent: string[] = [];
  private dialog: HTMLDialogElement | null = null;
  private resolve: ((emoji: string | null) => void) | null = null;
  private anchor: HTMLElement | null = null;

  /**
   * `gifPane` adds the GIF tab (composer only); it mounts its own content and
   * calls `close` when a GIF was chosen. Reactions keep the emoji panel alone.
   */
  choose(
    anchor: HTMLElement,
    gifPane?: (host: HTMLElement, close: () => void) => void,
  ): Promise<string | null> {
    this.finish(null);
    this.anchor = anchor;
    const dialog = document.createElement('dialog');
    dialog.className = 'emoji-picker';
    dialog.setAttribute('aria-label', 'Escolher emoji');
    // Authored markup only; emoji names enter through textContent/attributes.
    dialog.innerHTML = `<nav class="picker-modes" data-modes hidden aria-label="Emoji ou GIF"><button type="button" data-mode="emoji" aria-pressed="true">Emoji</button><button type="button" data-mode="gif" aria-pressed="false">GIF</button></nav><div class="gif-pane" data-gif-pane hidden></div><div class="emoji-top"><label class="emoji-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span class="visually-hidden">Buscar emoji</span><input type="search" maxlength="128" autocomplete="off" data-query placeholder="Buscar emoji"></label><label class="emoji-tone"><span class="visually-hidden">Tom de pele</span><select data-tone></select></label><button type="button" class="emoji-close" data-close aria-label="Fechar painel de emojis">×</button></div><section class="emoji-recent" data-recent-section hidden><h3>Recentes</h3><div class="emoji-recent-row" data-recent></div></section><h3 class="emoji-section-title" data-section-title></h3><div data-grid class="emoji-grid" role="listbox" aria-label="Emojis"></div><p data-result class="emoji-empty" role="status"></p><button type="button" class="emoji-custom" data-custom hidden>Usar emoji digitado</button><nav class="emoji-dock" data-dock aria-label="Categorias de emoji"></nav><small class="emoji-credit" data-art role="status">Carregando desenhos…</small>`;
    this.dialog = dialog;
    document.body.append(dialog);
    const promise = new Promise<string | null>((resolve) => {
      this.resolve = resolve;
    });
    this.bind(dialog);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.finish(null);
    });
    dialog.addEventListener('close', () => {
      if (this.dialog === dialog) this.finish(null);
    });
    // A click outside the panel (on the backdrop) closes it.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.finish(null);
    });
    element<HTMLButtonElement>(dialog, '[data-close]').addEventListener(
      'click',
      () => this.finish(null),
    );
    try {
      dialog.showModal();
    } catch (error: unknown) {
      this.finish(null);
      throw error;
    }
    if (gifPane) this.modes(dialog, gifPane);
    place(dialog, anchor);
    element<HTMLInputElement>(dialog, '[data-query]').focus();
    void artwork
      .ready()
      .then(() => {
        if (dialog.isConnected)
          element(dialog, '[data-art]').textContent =
            'Desenhos Twemoji · CC-BY-4.0 · Recentes só nesta sessão';
      })
      .catch(() => {
        if (dialog.isConnected)
          element(dialog, '[data-art]').textContent =
            'Desenhos indisponíveis. Você ainda pode escolher o emoji com a aparência deste aparelho.';
      });
    return promise;
  }
  close(): void {
    this.finish(null);
  }
  private modes(
    dialog: HTMLDialogElement,
    gifPane: (host: HTMLElement, close: () => void) => void,
  ): void {
    const modes = element(dialog, '[data-modes]'),
      pane = element(dialog, '[data-gif-pane]');
    modes.hidden = false;
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
          gifPane(pane, () => this.finish(null));
        }
      });
    });
  }
  reset(): void {
    this.recent = [];
    this.finish(null);
  }
  private finish(emoji: string | null): void {
    const dialog = this.dialog,
      resolve = this.resolve,
      anchor = this.anchor;
    this.dialog = null;
    this.resolve = null;
    this.anchor = null;
    if (emoji)
      this.recent = [
        emoji,
        ...this.recent.filter((item) => item !== emoji),
      ].slice(0, 32);
    dialog?.close();
    dialog?.remove();
    resolve?.(emoji);
    if (anchor?.isConnected) anchor.focus();
  }
  private bind(dialog: HTMLDialogElement): void {
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
      const result = catalog.search({
        query: query.value,
        category: searching ? 'all' : category,
        tone: tone.value,
        offset,
        recent: this.recent,
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
        ? 'Resultados'
        : (emojiCategories[Number(category)] ?? '');
      element(dialog, '[data-result]').textContent = total
        ? ''
        : 'Nenhum emoji encontrado.';
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
      if (emoji && validReaction(emoji)) this.finish(emoji);
    });
    render(true);
  }
  private renderRecent(
    dialog: HTMLDialogElement,
    searching: boolean,
    tone: string,
  ): void {
    const section = element(dialog, '[data-recent-section]');
    section.hidden = searching || !this.recent.length;
    if (section.hidden) return;
    const row = element(dialog, '[data-recent]');
    row.replaceChildren();
    this.appendGlyphs(
      row,
      catalog.search({
        query: '',
        category: 'recent',
        tone,
        offset: 0,
        recent: this.recent,
      }).entries,
    );
  }
  private appendGlyphs(host: HTMLElement, rows: readonly EmojiRow[]): void {
    for (const row of rows) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = row[1];
      button.setAttribute('aria-label', row[1]);
      button.append(artwork.glyph(row[0], catalog));
      button.addEventListener('click', () => this.finish(row[0]));
      host.append(button);
    }
  }
}
/** Opens beside the button that asked for it; phones get a bottom sheet (CSS). */
function place(dialog: HTMLDialogElement, anchor: HTMLElement): void {
  if (matchMedia('(max-width: 700px)').matches) return;
  const box = anchor.getBoundingClientRect(),
    width = dialog.offsetWidth,
    height = dialog.offsetHeight,
    left = Math.min(Math.max(8, box.left), innerWidth - width - 8),
    above = box.top - height - 8;
  dialog.style.margin = '0';
  dialog.style.left = `${left}px`;
  dialog.style.top = `${above >= 8 ? above : Math.min(box.bottom + 8, innerHeight - height - 8)}px`;
}
export async function emojiIntoComposer(
  picker: EmojiPicker,
  anchor: HTMLElement,
  input: HTMLTextAreaElement,
  gifPane?: (host: HTMLElement, close: () => void) => void,
): Promise<void> {
  const start = input.selectionStart,
    end = input.selectionEnd,
    original = input.value;
  const emoji = await picker.choose(anchor, gifPane);
  if (!emoji || !input.isConnected || input.value !== original) return;
  const inserted = insertEmoji(original, start, end, emoji);
  input.value = inserted.text;
  input.focus();
  input.setSelectionRange(inserted.caret, inserted.caret);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
