import { t, translatedError } from '../../shared/i18n/index.ts';
import { stickerLink, stickerReference } from '../../shared/stickers/index.ts';
import { stickerDisplay, stickerFigure } from '../stickers/index.ts';
import type { SectionView, StickerSection } from '../stickers/index.ts';
import { glyph, packIcon } from './glyphs.ts';
import type { StickerPack } from './public-api.ts';

/** What pack sections need from the account sticker owner. */
export interface PackPort {
  browse: (after: number) => Promise<{
    packs: StickerPack[];
    next: number | null;
  }>;
  /** Adds or drops another profile's pack, or deletes an own pack. */
  add: (pack: StickerPack, added: boolean) => Promise<void>;
  removeOwn: (pack: StickerPack) => Promise<void>;
}

function failure(error: unknown): string {
  return error instanceof Error
    ? translatedError(error.message)
    : t('Could not complete the operation.');
}
function link(id: string): string {
  return stickerLink('public', id);
}
function firstSticker(pack: StickerPack): HTMLElement | null {
  const first = pack.stickers[0];
  const reference = first ? stickerReference(link(first)) : null;
  if (!reference) return null;
  // A shelf icon sits inside its button, so it is never a button itself.
  const figure = stickerFigure(reference, {
    ...stickerDisplay(),
    open: undefined,
  });
  figure.setAttribute('aria-hidden', 'true');
  return figure;
}
function toolButton(label: string, run: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sticker-tool';
  button.textContent = label;
  button.addEventListener('click', run);
  return button;
}

/** One shelf section per own or added pack. */
export function packSection(pack: StickerPack, port: PackPort): StickerSection {
  return {
    id: `pack-${pack.id}`,
    label: pack.name,
    icon: () => packIcon(pack.name, firstSticker(pack)),
    draw(view) {
      const title = document.createElement('span');
      title.className = 'sticker-pack-title';
      title.textContent = pack.own
        ? pack.name
        : t('{0} by @{1}', [pack.name, pack.owner.handle]);
      const leave = toolButton(
        pack.own ? t('Delete pack') : t('Remove pack'),
        () => void leavePack(pack, port, view),
      );
      view.tools.replaceChildren(title, leave);
      for (const id of pack.stickers) {
        const tile = view.tile(link(id));
        if (tile) view.grid.append(tile);
      }
      if (!pack.stickers.length)
        view.status.textContent = t('This pack has no stickers to show.');
    },
  };
}
async function leavePack(
  pack: StickerPack,
  port: PackPort,
  view: SectionView,
): Promise<void> {
  const question = pack.own
    ? t('Delete the pack {0}? Its stickers stay in your library.', [pack.name])
    : t('Remove the pack {0} from your stickers?', [pack.name]);
  if (!window.confirm(question)) return;
  try {
    if (pack.own) await port.removeOwn(pack);
    else await port.add(pack, false);
    view.grid.replaceChildren();
    view.tools.replaceChildren();
    view.status.textContent = pack.own
      ? t('Pack deleted.')
      : t('Pack removed. It leaves the panel the next time you open it.');
  } catch (error: unknown) {
    view.status.textContent = failure(error);
  }
}

/** Public packs by how many people added them, newest first among equals. */
export function browseSection(port: PackPort): StickerSection {
  return {
    id: 'browse',
    label: t('Find packs'),
    icon: () => glyph('search'),
    draw: (view) => {
      view.grid.classList.add('sticker-pack-list');
      void browsePage(port, view, 0);
      return () => view.grid.classList.remove('sticker-pack-list');
    },
  };
}
async function browsePage(
  port: PackPort,
  view: SectionView,
  after: number,
): Promise<void> {
  view.status.textContent = t('Loading packs…');
  try {
    const page = await port.browse(after);
    if (view.signal.aborted) return;
    view.status.textContent =
      page.packs.length || after ? '' : t('No public packs yet.');
    for (const pack of page.packs) view.grid.append(packCard(pack, port, view));
    if (page.next !== null) {
      const more = toolButton(t('More packs'), () => {
        more.remove();
        void browsePage(port, view, page.next!);
      });
      more.classList.add('sticker-pack-more');
      view.grid.append(more);
    }
  } catch (error: unknown) {
    if (!view.signal.aborted) view.status.textContent = failure(error);
  }
}
function packCard(
  pack: StickerPack,
  port: PackPort,
  view: SectionView,
): HTMLElement {
  const card = document.createElement('article'),
    head = document.createElement('div'),
    name = document.createElement('strong'),
    owner = document.createElement('small'),
    row = document.createElement('div');
  card.className = 'sticker-pack-card';
  name.textContent = pack.name;
  owner.textContent = t('@{0} · added by {1}', [
    pack.owner.handle,
    String(pack.adds),
  ]);
  head.append(name, owner);
  row.className = 'sticker-pack-row';
  for (const id of pack.stickers.slice(0, 4)) {
    const tile = view.tile(link(id));
    if (tile) row.append(tile);
  }
  card.append(head, row);
  if (!pack.own) card.append(addButton(pack, port));
  return card;
}
function addButton(pack: StickerPack, port: PackPort): HTMLButtonElement {
  let added = pack.added;
  const button = toolButton('', () => {
    button.disabled = true;
    port.add(pack, !added).then(
      () => {
        added = !added;
        label();
        button.disabled = false;
      },
      (error: unknown) => {
        button.disabled = false;
        button.title = failure(error);
      },
    );
  });
  const label = () => {
    button.textContent = added ? t('Added') : t('Add');
    button.setAttribute('aria-pressed', String(added));
  };
  label();
  return button;
}
