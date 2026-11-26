import { t, translatedError } from '../../shared/i18n/index.ts';
import {
  publicStickerLimits,
  stickerPackName,
} from '../../shared/public-stickers/index.ts';
import type { PublicStickerFile } from '../../shared/public-stickers/index.ts';
import { stickerArt } from '../stickers/index.ts';
import type { StickerPack } from './public-api.ts';

/**
 * Where a new sticker goes (owner approved the design, 26/11/2026): Favorites
 * keeps it private in the encrypted vault; one of the person's own packs, or
 * a new one, publishes it with that public pack.
 */
export interface SaveSheetPort {
  favorites: (file: PublicStickerFile) => Promise<void>;
  /** The person's own packs; empty without a public profile. */
  ownPacks: () => Promise<StickerPack[]>;
  toPack: (file: PublicStickerFile, pack: StickerPack) => Promise<void>;
  newPack: (file: PublicStickerFile, name: string) => Promise<void>;
}
type Choice =
  { kind: 'favorites' } | { kind: 'pack'; pack: StickerPack } | { kind: 'new' };

function failure(error: unknown): string {
  return error instanceof Error
    ? translatedError(error.message)
    : t('Could not save the sticker.');
}
function row(
  label: string,
  icon: string,
  options: { name: string; checked: boolean },
): { element: HTMLLabelElement; input: HTMLInputElement } {
  const element = document.createElement('label'),
    input = document.createElement('input'),
    mark = document.createElement('span'),
    text = document.createElement('span');
  element.className = 'sticker-save-row';
  input.type = 'radio';
  input.name = options.name;
  input.checked = options.checked;
  mark.className = 'sticker-save-icon';
  mark.textContent = icon;
  mark.setAttribute('aria-hidden', 'true');
  text.textContent = label;
  element.append(input, mark, text);
  return { element, input };
}

/** Shows the menu; resolves true once saved, false when closed without. */
export function openStickerSaveSheet(
  file: PublicStickerFile,
  port: SaveSheetPort,
): Promise<boolean> {
  const dialog = document.createElement('dialog'),
    preview = document.createElement('div'),
    choices = document.createElement('div'),
    packs = document.createElement('div'),
    name = document.createElement('input'),
    status = document.createElement('p'),
    save = document.createElement('button'),
    group = `sticker-save-${crypto.randomUUID()}`,
    url = URL.createObjectURL(new Blob([file.bytes], { type: file.type }));
  dialog.className = 'sticker-sheet sticker-save-sheet';
  dialog.setAttribute('aria-label', t('Save sticker'));
  preview.className = 'chat-sticker-art';
  preview.append(stickerArt(url, file.type === 'video/mp4'));
  const art = preview.firstElementChild;
  if (art instanceof HTMLImageElement) art.src = url;
  const heading = document.createElement('h2');
  heading.textContent = t('Save sticker');
  choices.className = 'sticker-save-choices';
  packs.className = 'sticker-save-packs';
  name.type = 'text';
  name.className = 'sticker-save-name';
  name.maxLength = publicStickerLimits.packName;
  name.placeholder = t('Name the new pack');
  name.hidden = true;
  status.setAttribute('role', 'status');
  save.type = 'button';
  save.className = 'sticker-save-button';
  save.textContent = t('Save');
  let choice: Choice = { kind: 'favorites' };
  const pick = (next: Choice) => () => {
    choice = next;
    name.hidden = next.kind !== 'new';
    if (!name.hidden) name.focus();
  };
  const favorites = row(t('Favorites'), '★', { name: group, checked: true });
  favorites.input.addEventListener('change', pick({ kind: 'favorites' }));
  const fresh = row(t('New pack'), '+', { name: group, checked: false });
  fresh.input.addEventListener('change', pick({ kind: 'new' }));
  choices.append(favorites.element, packs, fresh.element, name);
  dialog.append(preview, heading, choices, status, save);
  void port.ownPacks().then(
    (own) => {
      if (!own.length || !dialog.isConnected) return;
      const label = document.createElement('p');
      label.className = 'sticker-save-label';
      label.textContent = t('Your packs (public)');
      packs.append(label);
      for (const pack of own) {
        const item = row(pack.name, '▤', { name: group, checked: false });
        item.input.disabled =
          pack.stickers.length >= publicStickerLimits.perPack;
        item.input.addEventListener('change', pick({ kind: 'pack', pack }));
        packs.append(item.element);
      }
    },
    () => undefined,
  );
  return new Promise((resolve) => {
    let saved = false;
    const run = async (): Promise<void> => {
      if (choice.kind === 'favorites') return port.favorites(file);
      if (choice.kind === 'pack') return port.toPack(file, choice.pack);
      return port.newPack(file, stickerPackName(name.value));
    };
    save.addEventListener('click', () => {
      save.disabled = true;
      status.textContent = t('Saving…');
      run().then(
        () => {
          saved = true;
          dialog.close();
        },
        (error: unknown) => {
          save.disabled = false;
          status.textContent = failure(error);
        },
      );
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      URL.revokeObjectURL(url);
      dialog.remove();
      resolve(saved);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}
