import { t } from '../../shared/i18n/index.ts';
import { viewOnceEnabled } from './view-once-mode.ts';

const started = new WeakSet<Document>();
const mounted = new WeakSet<HTMLElement>();

function close(host: Element): void {
  const menu = host.querySelector<HTMLElement>(
    '[data-compose-attachment-menu]',
  );
  if (menu) menu.hidden = true;
  host
    .querySelector('[data-chat-attachment]')
    ?.setAttribute('aria-expanded', 'false');
}

function start(root: Document): void {
  if (started.has(root)) return;
  started.add(root);
  root.addEventListener('click', (event) => {
    for (const host of root.querySelectorAll('.compose-attachment'))
      if (event.target instanceof Node && !host.contains(event.target))
        close(host);
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const menu = root.querySelector<HTMLElement>(
      '[data-compose-attachment-menu]:not([hidden])',
    );
    if (!menu) return;
    const host = menu.closest('.compose-attachment');
    if (!host) return;
    close(host);
    host.querySelector<HTMLElement>('[data-chat-attachment]')?.focus();
    event.preventDefault();
  });
}

function fileInput(form: HTMLElement): HTMLInputElement | null {
  const file = form.querySelector<HTMLInputElement>('[data-attachment-file]');
  return file && !file.disabled ? file : null;
}

/** The installed apps' camera button: the same file input, asking the system
 * for the rear camera. The photo then follows the normal attachment path. */
function bindCamera(form: HTMLElement): void {
  form.querySelector('[data-compose-camera]')?.addEventListener('click', () => {
    const file = fileInput(form);
    if (!file) return;
    file.accept = 'image/*';
    file.setAttribute('capture', 'environment');
    file.click();
  });
}

/** The menu routes to the existing emoji and file handlers. */
export function bindComposerMenu(form: HTMLElement): void {
  if (mounted.has(form)) return;
  mounted.add(form);
  bindCamera(form);
  const anchor = form.querySelector<HTMLButtonElement>(
    '[data-chat-attachment]',
  );
  const menu = form.querySelector<HTMLElement>(
    '[data-compose-attachment-menu]',
  );
  const host = anchor?.closest('.compose-attachment');
  if (!anchor || !menu || !host) return;
  start(form.ownerDocument);
  anchor.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    const media = menu.querySelector('[data-attachment-kind="image"] span');
    if (media)
      media.textContent = t(
        viewOnceEnabled(form) || !form.hasAttribute('data-public-compose')
          ? 'Media'
          : 'Image',
      );
    anchor.setAttribute('aria-expanded', String(!menu.hidden));
  });
  menu.addEventListener('click', () => close(host));
  for (const button of menu.querySelectorAll<HTMLButtonElement>(
    '[data-attachment-kind]',
  ))
    button.addEventListener('click', () => {
      const file = fileInput(form);
      if (!file) return;
      file.removeAttribute('capture');
      file.accept =
        button.dataset['attachmentKind'] === 'image'
          ? viewOnceEnabled(form) || !form.hasAttribute('data-public-compose')
            ? 'image/*,video/mp4,video/quicktime,.mp4,.mov,.m4v'
            : 'image/*'
          : '';
      file.click();
    });
}

export type ComposerPanelStart = 'emoji' | 'sticker' | 'gif';
/**
 * Emoji, Stickers and GIF in the clip menu open the same panel on their own
 * tab (owner, 25/11/2026). `open` receives the tab the chosen item names.
 */
export function bindEmojiMenu(
  host: ParentNode,
  selector: string,
  open: (start: ComposerPanelStart) => void,
  signal: AbortSignal,
): void {
  for (const button of host.querySelectorAll<HTMLElement>(selector)) {
    const start = button.dataset['emojiStart'];
    button.addEventListener(
      'click',
      () => open(start === 'sticker' || start === 'gif' ? start : 'emoji'),
      { signal },
    );
  }
}
