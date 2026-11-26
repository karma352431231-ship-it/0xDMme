import { t, translatedError } from '../../shared/i18n/index.ts';
import type { PersonalSticker } from '../sticker-library/index.ts';
import { stickerArt } from '../stickers/index.ts';
import type { SectionView, StickerSection } from '../stickers/index.ts';
import { glyph } from './glyphs.ts';

/** What the Mine section needs from the account sticker owner. */
export interface MinePort {
  ids: () => Promise<string[]>;
  open: (ids: readonly string[]) => Promise<PersonalSticker[]>;
  image: (sticker: PersonalSticker) => string;
  /** Asks for a picture on the device and saves it; false when cancelled. */
  addFromDevice: () => Promise<boolean>;
  remove: (ids: readonly string[]) => Promise<void>;
  /** Publishes the chosen stickers as a new public pack. */
  publishPack: (stickers: readonly PersonalSticker[]) => Promise<void>;
  /** Sends or inserts one personal sticker where the panel was opened. */
  use: (sticker: PersonalSticker) => Promise<void>;
}
const page = 16;

function failure(error: unknown): string {
  return error instanceof Error
    ? translatedError(error.message)
    : t('Could not complete the operation.');
}

/** The person's own stickers: send, add from the device, delete, publish. */
export function mineSection(port: MinePort): StickerSection {
  return {
    id: 'mine',
    label: t('My stickers'),
    icon: () => glyph('heart'),
    draw: (view) => new MineView(port, view).start(),
  };
}

class MineView {
  private readonly port: MinePort;
  private readonly view: SectionView;
  private readonly selected = new Set<string>();
  private stickers: PersonalSticker[] = [];
  private selecting = false;
  private busy = false;
  constructor(port: MinePort, view: SectionView) {
    this.port = port;
    this.view = view;
  }
  start(): void {
    void this.load();
  }
  private async work(task: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await task();
    } catch (error: unknown) {
      if (!this.view.signal.aborted)
        this.view.status.textContent = failure(error);
    } finally {
      this.busy = false;
    }
  }
  private async load(): Promise<void> {
    this.view.status.textContent = t('Loading your stickers…');
    this.drawTools();
    await this.work(async () => {
      const ids = await this.port.ids();
      this.stickers = [];
      for (let start = 0; start < ids.length; start += page) {
        const opened = await this.port.open(ids.slice(start, start + page));
        if (this.view.signal.aborted) return;
        this.stickers.push(...opened);
        this.drawGrid();
      }
      this.drawGrid();
    });
  }
  private button(label: string, run: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sticker-tool';
    button.textContent = label;
    button.addEventListener('click', run);
    return button;
  }
  private drawTools(): void {
    const tools = this.selecting
      ? [
          this.button(t('Done'), () => this.select(false)),
          this.button(t('New pack'), () => void this.pack()),
          this.button(t('Delete'), () => void this.delete()),
        ]
      : [
          this.button(t('New sticker'), () => void this.add()),
          this.button(t('Select'), () => this.select(true)),
        ];
    if (this.selecting)
      tools.slice(1).forEach((tool) => (tool.disabled = !this.selected.size));
    this.view.tools.replaceChildren(...tools);
  }
  private drawGrid(): void {
    this.view.grid.replaceChildren(
      ...this.stickers.map((sticker) => this.tile(sticker)),
    );
    this.view.status.textContent = this.stickers.length
      ? ''
      : t(
          'Make a sticker from any picture: tap New sticker, or open a picture and choose Make sticker.',
        );
  }
  private tile(sticker: PersonalSticker): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sticker-tile';
    button.setAttribute('aria-label', t('Sticker'));
    if (this.selecting)
      button.setAttribute(
        'aria-pressed',
        String(this.selected.has(sticker.id)),
      );
    button.append(
      stickerArt(this.port.image(sticker), sticker.file.type === 'video/mp4'),
    );
    button.addEventListener('click', () => this.chosen(sticker, button));
    return button;
  }
  private chosen(sticker: PersonalSticker, button: HTMLButtonElement): void {
    if (!this.selecting) {
      this.view.status.textContent = t('Sending…');
      void this.work(() => this.port.use(sticker));
      return;
    }
    if (this.selected.has(sticker.id)) this.selected.delete(sticker.id);
    else this.selected.add(sticker.id);
    button.setAttribute('aria-pressed', String(this.selected.has(sticker.id)));
    this.drawTools();
  }
  private select(on: boolean): void {
    this.selecting = on;
    this.selected.clear();
    this.drawTools();
    this.drawGrid();
  }
  private async add(): Promise<void> {
    let added = false;
    await this.work(async () => {
      added = await this.port.addFromDevice();
    });
    if (added && !this.view.signal.aborted) await this.load();
  }
  private chosenStickers(): PersonalSticker[] {
    return this.stickers.filter((sticker) => this.selected.has(sticker.id));
  }
  /** Runs a change of the selection; leaves selection only when it worked. */
  private async change(task: () => Promise<void>): Promise<boolean> {
    let done = false;
    await this.work(async () => {
      await task();
      done = true;
    });
    if (!done || this.view.signal.aborted) return false;
    this.select(false);
    return true;
  }
  private async delete(): Promise<void> {
    const chosen = this.chosenStickers();
    if (
      !chosen.length ||
      !window.confirm(
        t('Delete {0} stickers from your library?', [String(chosen.length)]),
      )
    )
      return;
    if (
      await this.change(() => this.port.remove(chosen.map((item) => item.id)))
    )
      await this.load();
  }
  private async pack(): Promise<void> {
    const chosen = this.chosenStickers();
    if (!chosen.length) return;
    this.view.status.textContent = t('Publishing…');
    await this.change(() => this.port.publishPack(chosen));
  }
}
