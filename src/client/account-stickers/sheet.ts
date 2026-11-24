import { t, translatedError } from '../../shared/i18n/index.ts';
import type { StickerReference } from '../../shared/stickers/index.ts';
import { stickerDisplay, stickerFigure } from '../stickers/index.ts';
import type { StickerPack } from './public-api.ts';

/** What the sheet of a tapped public sticker can do. */
export interface SheetPort {
  save: (sticker: StickerReference) => Promise<void>;
  pack: (sticker: StickerReference) => Promise<StickerPack | null>;
  add: (pack: StickerPack, added: boolean) => Promise<void>;
}

function failure(error: unknown): string {
  return error instanceof Error
    ? translatedError(error.message)
    : t('Could not complete the operation.');
}
function action(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  return button;
}

/** A public sticker, larger, with saving it and the pack it comes from. */
export function openStickerSheet(
  sticker: StickerReference,
  port: SheetPort,
): void {
  const dialog = document.createElement('dialog'),
    lifetime = new AbortController(),
    status = document.createElement('p'),
    pack = document.createElement('div'),
    bar = document.createElement('div'),
    save = action(t('Save to my stickers')),
    close = action(t('Close'));
  dialog.className = 'sticker-sheet';
  dialog.setAttribute('aria-label', t('Sticker'));
  status.setAttribute('role', 'status');
  pack.className = 'sticker-sheet-pack';
  bar.className = 'sticker-sheet-bar';
  bar.append(save, close);
  dialog.append(
    stickerFigure(sticker, stickerDisplay(undefined, lifetime.signal)),
    pack,
    status,
    bar,
  );
  save.addEventListener('click', () => {
    save.disabled = true;
    status.textContent = t('Saving…');
    port.save(sticker).then(
      () => {
        status.textContent = t('Saved to your stickers.');
      },
      (error: unknown) => {
        save.disabled = false;
        status.textContent = failure(error);
      },
    );
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    lifetime.abort();
    dialog.remove();
  });
  document.body.append(dialog);
  dialog.showModal();
  void showPack(sticker, port, { host: pack, signal: lifetime.signal });
}

async function showPack(
  sticker: StickerReference,
  port: SheetPort,
  target: { host: HTMLElement; signal: AbortSignal },
): Promise<void> {
  const found = await port.pack(sticker).catch(() => null);
  if (!found || target.signal.aborted) return;
  const text = document.createElement('span');
  text.textContent = t('From the pack {0} by @{1}', [
    found.name,
    found.owner.handle,
  ]);
  target.host.append(text);
  if (found.own) return;
  let added = found.added;
  const button = action('');
  const label = () => {
    button.textContent = added ? t('Remove pack') : t('Add pack');
  };
  label();
  button.addEventListener('click', () => {
    button.disabled = true;
    port.add(found, !added).then(
      () => {
        added = !added;
        label();
        button.disabled = false;
      },
      (error: unknown) => {
        button.disabled = false;
        text.textContent = failure(error);
      },
    );
  });
  target.host.append(button);
}
