import { t } from '../../shared/i18n/index.ts';
import { stickerReference } from '../../shared/stickers/index.ts';
import { pingStickerMarkup } from '../ping/index.ts';
import { stickerFigure } from './display.ts';
import { pingPackLinks } from './ping-pack.ts';
import { recentStickers } from './recents.ts';

/**
 * The Stickers tab of the emoji panel: a shelf of sections (recent, the Ping
 * pack, KLIPY, the person's own stickers and the packs they added) above one
 * grid. Sections only fill the grid; choosing is the composer's job.
 */
export interface StickerSection {
  id: string;
  label: string;
  /** Small shelf icon. */
  icon: () => Element;
  /** Fills the grid; returns a cleanup when it keeps work running. */
  draw: (view: SectionView) => (() => void) | void;
}
export interface SectionView {
  grid: HTMLElement;
  status: HTMLElement;
  tools: HTMLElement;
  signal: AbortSignal;
  tile: (link: string, label?: string) => HTMLButtonElement | null;
}
export interface StickerPaneOptions {
  chosen: (link: string) => void;
  /** Sections after Recent and Ping, in shelf order. */
  sections?: readonly StickerSection[];
  privacy?: Parameters<typeof stickerFigure>[1]['privacy'];
}

function shelfIcon(markup: string): Element {
  const holder = document.createElement('template');
  holder.innerHTML = markup;
  return holder.content.firstElementChild!;
}
const clock =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';

function recentSection(): StickerSection {
  return {
    id: 'recent',
    label: t('Recent'),
    icon: () => shelfIcon(clock),
    draw(view) {
      const links = recentStickers.values();
      for (const link of links) {
        const tile = view.tile(link);
        if (tile) view.grid.append(tile);
      }
      if (!links.length)
        view.status.textContent = t('Stickers you send appear here.');
    },
  };
}
function pingSection(): StickerSection {
  return {
    id: 'ping',
    label: 'Ping',
    icon: () => shelfIcon(pingStickerMarkup('hi')),
    draw(view) {
      for (const link of pingPackLinks()) {
        const tile = view.tile(link);
        if (tile) view.grid.append(tile);
      }
    },
  };
}

export function mountStickerPane(
  host: HTMLElement,
  options: StickerPaneOptions,
): () => void {
  const shelf = document.createElement('nav'),
    tools = document.createElement('div'),
    grid = document.createElement('div'),
    status = document.createElement('p');
  shelf.className = 'sticker-shelf';
  shelf.setAttribute('aria-label', t('Sticker packs'));
  tools.className = 'sticker-tools';
  grid.className = 'sticker-grid';
  status.className = 'emoji-empty';
  status.setAttribute('role', 'status');
  host.replaceChildren(shelf, tools, grid, status);
  const sections = [
    ...(recentStickers.values().length ? [recentSection()] : []),
    pingSection(),
    ...(options.sections ?? []),
  ];
  let current = new AbortController(),
    stop: (() => void) | void;
  const tile = (link: string, label?: string): HTMLButtonElement | null => {
    const sticker = stickerReference(link);
    if (!sticker) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sticker-tile';
    const figure = stickerFigure(sticker, {
      privacy: options.privacy,
      signal: current.signal,
    });
    button.setAttribute(
      'aria-label',
      label ?? figure.getAttribute('aria-label') ?? t('Sticker'),
    );
    figure.removeAttribute('role');
    figure.setAttribute('aria-hidden', 'true');
    button.append(figure);
    button.addEventListener('click', () => {
      recentStickers.choose(link);
      options.chosen(link);
    });
    return button;
  };
  const open = (section: StickerSection, button: HTMLButtonElement) => {
    stop?.();
    current.abort();
    current = new AbortController();
    for (const other of shelf.children)
      other.setAttribute('aria-pressed', String(other === button));
    grid.replaceChildren();
    tools.replaceChildren();
    status.textContent = '';
    grid.scrollTop = 0;
    host.dataset['section'] = section.id;
    stop = section.draw({ grid, status, tools, signal: current.signal, tile });
  };
  for (const section of sections) {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = section.label;
    button.setAttribute('aria-label', section.label);
    button.append(section.icon());
    button.addEventListener('click', () => open(section, button));
    shelf.append(button);
  }
  const first = shelf.firstElementChild;
  if (first instanceof HTMLButtonElement && sections[0])
    open(sections[0], first);
  return () => {
    stop?.();
    current.abort();
  };
}
