import { t } from '../../shared/i18n/index.ts';
import { displayName, paintAvatar } from '../appearance/index.ts';
import type { ConversationEntry } from './directory-types.ts';

interface StatusEntry {
  key: string;
  href: string;
  label: string;
  seed: string | null;
  active: boolean;
}
class StatusTile {
  readonly element = document.createElement('a');
  private readonly ring = document.createElement('span');
  private readonly face = document.createElement('span');
  private readonly name = document.createElement('span');
  private appearance = '';
  constructor() {
    this.element.className = 'status-tile';
    this.ring.setAttribute('aria-hidden', 'true');
    this.face.className = 'conversation-avatar';
    this.name.className = 'status-tile-name';
    this.ring.append(this.face);
    this.element.append(this.ring, this.name);
  }
  update(entry: StatusEntry): void {
    if (this.element.getAttribute('href') !== entry.href)
      this.element.setAttribute('href', entry.href);
    const classes = `status-ring${entry.seed === null ? ' own' : ''}${entry.active ? ' active' : ''}`;
    if (this.ring.className !== classes) this.ring.className = classes;
    if (this.name.textContent !== entry.label)
      this.name.textContent = entry.label;
    const label =
      entry.seed === null
        ? t('Seu status: publicar ou ver')
        : t('Ver status de {0}', [entry.label]);
    if (this.element.getAttribute('aria-label') !== label)
      this.element.setAttribute('aria-label', label);
    const appearance = JSON.stringify([entry.label, entry.seed]);
    if (this.appearance === appearance) return;
    this.appearance = appearance;
    if (entry.seed === null) this.face.textContent = '+';
    else paintAvatar(this.face, { label: entry.label, seed: entry.seed });
  }
}
const strips = new WeakMap<HTMLElement, Map<string, StatusTile>>();

/** The status strip shares no contact data beyond the currently projected authors. */
export function renderStatusStrip(
  host: HTMLElement,
  input: {
    ownActive: string | null;
    authors: readonly ConversationEntry[];
  },
): void {
  let tiles = strips.get(host);
  if (!tiles) {
    host.replaceChildren();
    tiles = new Map();
    strips.set(host, tiles);
  }
  const entries: StatusEntry[] = [
    {
      key: 'own',
      href: input.ownActive
        ? `#status?autor=${encodeURIComponent(input.ownActive)}`
        : '#status',
      label: t('Seu status'),
      seed: null,
      active: !!input.ownActive,
    },
    ...input.authors.map((entry) => ({
      key: entry.id,
      href: `#status?autor=${encodeURIComponent(entry.id)}`,
      label: displayName(entry.title),
      seed: entry.seed ?? entry.id,
      active: true,
    })),
  ];
  const keys = new Set(entries.map((entry) => entry.key));
  for (const [key, tile] of tiles)
    if (!keys.has(key)) {
      tile.element.remove();
      tiles.delete(key);
    }
  entries.forEach((entry, index) => {
    const tile = tiles.get(entry.key) ?? new StatusTile();
    tiles.set(entry.key, tile);
    tile.update(entry);
    const before = host.children[index];
    if (before === tile.element) return;
    if (before) host.insertBefore(tile.element, before);
    else host.append(tile.element);
  });
}
