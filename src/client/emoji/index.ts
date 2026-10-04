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
export class EmojiPicker {
  private recent: string[] = [];
  private dialog: HTMLDialogElement | null = null;
  private resolve: ((emoji: string | null) => void) | null = null;
  private anchor: HTMLElement | null = null;

  choose(anchor: HTMLElement): Promise<string | null> {
    this.finish(null);
    this.anchor = anchor;
    const dialog = document.createElement('dialog');
    dialog.className = 'emoji-picker';
    dialog.setAttribute('aria-label', 'Escolher emoji');
    dialog.innerHTML = `<div class="emoji-heading"><h2>Emojis</h2><button type="button" data-close aria-label="Fechar painel de emojis">Fechar</button></div><label>Buscar emoji<input type="search" maxlength="128" autocomplete="off" data-query placeholder="coração, gato, bandeira…"></label><div class="emoji-filters"><label>Categoria<select data-category><option value="all">Todas</option><option value="recent">Recentes nesta sessão</option></select></label><label>Tom de pele<select data-tone><option value="all">Todos e combinações</option><option value="none">Sem modificador</option></select></label></div><p data-result role="status"></p><div data-grid class="emoji-grid"></div><button type="button" data-custom hidden>Usar emoji digitado</button><div class="emoji-pagination"><button type="button" data-prev>Anterior</button><button type="button" data-next>Próximos</button></div><p data-art role="status">Carregando desenhos…</p><small>Alguns emojis novos podem usar o desenho do aparelho. Recentes ficam apenas nesta sessão.</small>`;
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
    element<HTMLInputElement>(dialog, '[data-query]').focus();
    void artwork
      .ready()
      .then(() => {
        if (dialog.isConnected)
          element(dialog, '[data-art]').textContent =
            'Desenhos Twemoji · CC-BY-4.0';
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
      category = element<HTMLSelectElement>(dialog, '[data-category]'),
      tone = element<HTMLSelectElement>(dialog, '[data-tone]');
    emojiCategories.forEach((label, i) => option(category, String(i), label));
    ['🏻', '🏼', '🏽', '🏾', '🏿'].forEach((modifier, i) =>
      option(
        tone,
        modifier,
        ['Clara', 'Média clara', 'Média', 'Média escura', 'Escura'][i] ??
          modifier,
      ),
    );
    let offset = 0;
    const render = () => {
      const result = catalog.search({
        query: query.value,
        category: category.value,
        tone: tone.value,
        offset,
        recent: this.recent,
      });
      this.renderPage(dialog, result, offset);
    };
    for (const control of [query, category, tone])
      control.addEventListener('input', () => {
        offset = 0;
        render();
      });
    element(dialog, '[data-prev]').addEventListener('click', () => {
      offset = Math.max(0, offset - emojiPageSize);
      render();
    });
    element(dialog, '[data-next]').addEventListener('click', () => {
      offset += emojiPageSize;
      render();
    });
    element(dialog, '[data-custom]').addEventListener('click', () => {
      const emoji = query.value.trim();
      if (emoji && validReaction(emoji)) this.finish(emoji);
    });
    render();
  }
  private renderPage(
    dialog: HTMLDialogElement,
    result: { entries: readonly EmojiRow[]; total: number },
    offset: number,
  ): void {
    const grid = element(dialog, '[data-grid]');
    grid.replaceChildren();
    for (const row of result.entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = row[1];
      button.setAttribute('aria-label', row[1]);
      button.append(artwork.glyph(row[0], catalog));
      button.addEventListener('click', () => this.finish(row[0]));
      grid.append(button);
    }
    element(dialog, '[data-result]').textContent = result.total
      ? `${offset + 1}–${Math.min(offset + emojiPageSize, result.total)} de ${result.total}`
      : 'Nenhum emoji encontrado.';
    element<HTMLButtonElement>(dialog, '[data-prev]').disabled = offset === 0;
    element<HTMLButtonElement>(dialog, '[data-next]').disabled =
      offset + emojiPageSize >= result.total;
    const query = element<HTMLInputElement>(
      dialog,
      '[data-query]',
    ).value.trim();
    element<HTMLButtonElement>(dialog, '[data-custom]').hidden =
      !query || !validReaction(query) || !!catalog.find(query);
  }
}
export async function emojiIntoComposer(
  picker: EmojiPicker,
  anchor: HTMLElement,
  input: HTMLTextAreaElement,
): Promise<void> {
  const start = input.selectionStart,
    end = input.selectionEnd,
    original = input.value;
  const emoji = await picker.choose(anchor);
  if (!emoji || !input.isConnected || input.value !== original) return;
  const inserted = insertEmoji(original, start, end, emoji);
  input.value = inserted.text;
  input.focus();
  input.setSelectionRange(inserted.caret, inserted.caret);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
