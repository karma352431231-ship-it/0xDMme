import { t } from '../../shared/i18n/index.ts';
import { EmojiCatalog, insertEmoji } from './catalog.ts';
import { EmojiPanel } from './panel.ts';
import { ComposerEmojiPanel } from './composer-panel.ts';
import { layoutBox, layoutViewport } from '../display-scale/index.ts';
export { EmojiCatalog, insertEmoji };
export { emojiText } from './panel.ts';
export type { EmojiRow } from './catalog.ts';

/** Modal selection owns one result; conversation composition has its own dock lifecycle. */
export class EmojiPicker {
  private dialog: HTMLDialogElement | null = null;
  private resolve: ((emoji: string | null) => void) | null = null;
  private anchor: HTMLElement | null = null;
  private composer: ComposerEmojiPanel | null = null;
  choose(
    anchor: HTMLElement,
    gifPane?: (host: HTMLElement, close: () => void) => void,
    start: 'emoji' | 'gif' = 'emoji',
  ): Promise<string | null> {
    this.close();
    this.anchor = anchor;
    const dialog = document.createElement('dialog');
    dialog.className = 'emoji-picker emoji-panel';
    dialog.setAttribute('aria-label', t('Choose emoji'));
    this.dialog = dialog;
    document.body.append(dialog);
    const promise = new Promise<string | null>((resolve) => {
      this.resolve = resolve;
    });
    try {
      new EmojiPanel(dialog, {
        selected: (emoji) => this.finish(emoji),
        close: () => this.finish(null),
        ...(gifPane ? { gifPane } : {}),
        start,
      });
      // A non-editable initial control avoids opening the keyboard. Some
      // browsers still delegate to search when autofocus is on the dialog.
      dialog.querySelector('[data-close]')?.setAttribute('autofocus', '');
    } catch (error: unknown) {
      this.finish(null);
      throw error;
    }
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.finish(null);
    });
    dialog.addEventListener('close', () => {
      if (this.dialog === dialog) this.finish(null);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.finish(null);
    });
    try {
      dialog.showModal();
    } catch (error: unknown) {
      this.finish(null);
      throw error;
    }
    place(dialog, anchor);
    return promise;
  }
  async compose(
    options: Parameters<ComposerEmojiPanel['open']>[0],
  ): Promise<void> {
    if (this.composer?.isOpen) {
      this.composer.returnToTyping();
      return;
    }
    this.close();
    const composer = new ComposerEmojiPanel();
    this.composer = composer;
    try {
      await composer.open(options);
    } finally {
      if (this.composer === composer) this.composer = null;
    }
  }
  close(): void {
    this.composer?.close();
    this.composer = null;
    this.finish(null);
  }
  reset(): void {
    this.close();
  }
  private finish(emoji: string | null): void {
    const dialog = this.dialog,
      resolve = this.resolve,
      anchor = this.anchor;
    this.dialog = null;
    this.resolve = null;
    this.anchor = null;
    dialog?.close();
    dialog?.remove();
    resolve?.(emoji);
    if (anchor?.isConnected) anchor.focus();
  }
}
/** Opens beside the button that asked for it; phones get a bottom sheet (CSS). */
function place(dialog: HTMLDialogElement, anchor: HTMLElement): void {
  if (matchMedia('(max-width: 700px)').matches) return;
  const box = layoutBox(anchor.getBoundingClientRect(), dialog),
    view = layoutViewport(dialog),
    width = dialog.offsetWidth,
    height = dialog.offsetHeight,
    left = Math.min(Math.max(8, box.left), view.width - width - 8),
    above = box.top - height - 8;
  dialog.style.margin = '0';
  dialog.style.left = `${left}px`;
  dialog.style.top = `${above >= 8 ? above : Math.min(box.bottom + 8, view.height - height - 8)}px`;
}
export async function emojiIntoComposer(
  picker: EmojiPicker,
  anchor: HTMLElement,
  input: HTMLTextAreaElement,
  gif: {
    pane?: (host: HTMLElement, close: () => void) => void;
    start?: 'emoji' | 'gif';
  } = {},
): Promise<void> {
  if (
    matchMedia('(max-width: 700px)').matches &&
    input.closest('.chat-composer')
  ) {
    await picker.compose({ anchor, input, ...gif });
    return;
  }
  const start = input.selectionStart,
    end = input.selectionEnd,
    original = input.value;
  const emoji = await picker.choose(anchor, gif.pane, gif.start);
  if (!emoji || !input.isConnected || input.value !== original) return;
  const inserted = insertEmoji(original, start, end, emoji);
  input.value = inserted.text;
  input.focus();
  input.setSelectionRange(inserted.caret, inserted.caret);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
