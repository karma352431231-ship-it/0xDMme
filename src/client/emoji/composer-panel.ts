import { t } from '../../shared/i18n/index.ts';
import { insertEmoji } from './catalog.ts';
import { EmojiPanel } from './panel.ts';
import { holdKeyboardSpace } from './keyboard-handoff.ts';

interface ComposerOptions {
  anchor: HTMLElement;
  input: HTMLTextAreaElement;
  pane?: (host: HTMLElement, close: () => void) => void;
  start?: 'emoji' | 'gif';
}
/** Owns one phone conversation dock, caret insertion and keyboard handoff. */
export class ComposerEmojiPanel {
  private static active: ComposerEmojiPanel | null = null;
  private host: HTMLElement | null = null;
  private form: HTMLElement | null = null;
  private input: HTMLTextAreaElement | null = null;
  private completed: (() => void) | null = null;
  private abort = new AbortController();
  private controls: MutationObserver | null = null;
  private keyboardHandoff: (() => void) | null = null;
  get isOpen(): boolean {
    return this.host !== null;
  }
  open(options: ComposerOptions): Promise<void> {
    ComposerEmojiPanel.active?.close();
    this.abort = new AbortController();
    const form = options.input.closest<HTMLElement>('.chat-composer');
    if (!form) throw new Error('Conversation composer is unavailable.');
    const host = document.createElement('section');
    host.className = 'emoji-panel emoji-composer-panel';
    host.setAttribute('aria-label', t('Choose emoji'));
    this.host = host;
    this.form = form;
    this.input = options.input;
    ComposerEmojiPanel.active = this;
    const history = form
      .closest('.chat-panel')
      ?.querySelector<HTMLElement>('.chat-history');
    const atEnd =
      history &&
      history.scrollHeight - history.scrollTop - history.clientHeight < 80;
    options.input.blur();
    form.dataset['emojiOpen'] = 'true';
    form.after(host);
    const promise = new Promise<void>((resolve) => {
      this.completed = resolve;
    });
    try {
      this.mountContent(host, options);
    } catch (error: unknown) {
      this.close();
      throw error;
    }
    options.input.addEventListener('focus', () => this.close(), {
      signal: this.abort.signal,
    });
    const phone = matchMedia('(max-width: 700px)');
    phone.addEventListener(
      'change',
      () => {
        if (!phone.matches) this.close();
      },
      { signal: this.abort.signal },
    );
    this.controls = new MutationObserver(() => {
      if (!this.usable()) this.close();
    });
    this.controls.observe(form, {
      attributes: true,
      attributeFilter: ['hidden'],
    });
    this.controls.observe(options.input, {
      attributes: true,
      attributeFilter: ['disabled', 'readonly'],
    });
    if (atEnd && history) history.scrollTop = history.scrollHeight;
    return promise;
  }
  private mountContent(host: HTMLElement, options: ComposerOptions): void {
    new EmojiPanel(host, {
      selected: (emoji) => this.insert(emoji),
      close: () => this.returnToTyping(),
      ...(options.pane ? { gifPane: options.pane } : {}),
      ...(options.start ? { start: options.start } : {}),
    });
    const back = host.querySelector<HTMLButtonElement>('[data-close]');
    if (back) {
      back.setAttribute('aria-label', t('Return to typing'));
      back.title = t('Return to typing');
      // Preserve an already open search keyboard while switching to the composer.
      back.addEventListener('pointerdown', (event) => event.preventDefault(), {
        signal: this.abort.signal,
      });
      back.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    }
  }
  private usable(): boolean {
    return (
      !!this.input?.isConnected &&
      !this.input.disabled &&
      !this.input.readOnly &&
      !this.form?.hidden
    );
  }
  private insert(emoji: string): void {
    const input = this.input;
    if (!input || !this.usable()) {
      this.close();
      return;
    }
    const inserted = insertEmoji(
      input.value,
      input.selectionStart,
      input.selectionEnd,
      emoji,
    );
    input.value = inserted.text;
    input.setSelectionRange(inserted.caret, inserted.caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  returnToTyping(): void {
    const input = this.input;
    const release =
      this.host && input?.isConnected ? holdKeyboardSpace(this.host) : null;
    this.close();
    this.keyboardHandoff = release;
    if (input?.isConnected) input.focus({ preventScroll: true });
  }
  close(): void {
    this.keyboardHandoff?.();
    this.keyboardHandoff = null;
    this.abort.abort();
    this.controls?.disconnect();
    this.controls = null;
    this.host?.remove();
    if (this.form) delete this.form.dataset['emojiOpen'];
    this.host = null;
    this.form = null;
    this.input = null;
    const done = this.completed;
    this.completed = null;
    done?.();
    if (ComposerEmojiPanel.active === this) ComposerEmojiPanel.active = null;
  }
}
