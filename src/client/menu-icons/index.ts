/**
 * Authored 24×24 line glyphs for action menus outside communities (contacts,
 * chats, groups and message actions). Static paths only: no files, fonts or
 * third-party icon sets; color comes from `currentColor`. The static "+"
 * menu in app/index.html carries the same line style inline.
 */
const slash = 'M3 3l18 18';
const bell = ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'];
const heart = [
  'M12 20s-7.5-4.5-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.5 12 20 12 20z',
];
const pin = ['M9 3.5h6l-1 6.5 4 4H6l4-4z', 'M12 14v7'];
const box = ['M3.5 4h17v4h-17z', 'M5 8v11.5h14V8'];
const person = [
  'M9 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5',
  'M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1',
];
const circle = 'M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19';
const paths = {
  close: ['M6 6l12 12', 'M18 6 6 18'],
  back: ['m15 5-7 7 7 7'],
  chevron: ['m6 9 6 6 6-6'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'm13.5 6.5 4 4'],
  archive: [...box, 'M12 10.5v6', 'm9 13.5 3 3 3-3'],
  unarchive: [...box, 'M12 16.5v-6', 'm9 13.5 3-3 3 3'],
  pin,
  unpin: [...pin, slash],
  favorite: heart,
  unfavorite: [...heart, slash],
  mute: [...bell, slash],
  unmute: bell,
  clock: [circle, 'M12 7v5l3.5 2'],
  block: [circle, 'm5.3 5.3 13.4 13.4'],
  unblock: [circle, 'm8 12.5 3 3 5-6'],
  member: person,
  remove: [...person, 'M16 9.5h6'],
  shield: ['M12 3 4.5 6v6c0 4.7 3.2 7.8 7.5 9 4.3-1.2 7.5-4.3 7.5-9V6z'],
  settings: ['M4 7h9', 'M17 7h3', 'M15 5v4', 'M4 17h3', 'M11 17h9', 'M9 15v4'],
  refresh: ['M20 7a9 9 0 1 0 1 6.5', 'M20.5 2.5V7H16'],
  reply: ['m9 14-5-5 5-5', 'M4 9h10a6 6 0 0 1 6 6v5'],
  forward: ['m15 14 5-5-5-5', 'M20 9H10a6 6 0 0 0-6 6v5'],
  react: [circle, 'M8 14a4 4 0 0 0 8 0', 'M9 9.5h.01', 'M15 9.5h.01'],
  copy: ['M8.5 8.5h11v11h-11z', 'M15.5 8.5V4.5h-11v11h4'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  profile: [
    circle,
    'M12 12.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5',
    'M6.5 18.5a6.5 6.5 0 0 1 11 0',
  ],
  leave: ['M14 4h5v16h-5', 'M10 8l-4 4 4 4', 'M6 12h10'],
  admin: [
    'm12 3 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z',
  ],
} as const;
export type MenuIconName = keyof typeof paths;

const namespace = 'http://www.w3.org/2000/svg';
/**
 * Presentation attributes instead of a stylesheet: a menu's own CSS may still
 * resize or recolor the glyph, and no extra file joins the source bundle.
 */
const attributes = {
  class: 'menu-item-icon',
  viewBox: '0 0 24 24',
  width: '20',
  height: '20',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.8',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
} as const;

export function menuIcon(name: MenuIconName): SVGSVGElement {
  const svg = document.createElementNS(namespace, 'svg');
  for (const [key, value] of Object.entries(attributes))
    svg.setAttribute(key, value);
  for (const d of paths[name]) {
    const path = document.createElementNS(namespace, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Same glyph as markup, for authored templates that are filled by placeholders. */
export function menuIconMarkup(name: MenuIconName): string {
  const attrs = Object.entries(attributes)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');
  const body = paths[name].map((d) => `<path d="${d}"/>`).join('');
  return `<svg ${attrs}>${body}</svg>`;
}

/** Leading glyph before the label; the item keeps its text, role and handlers. */
export function withMenuIcon<T extends Element>(
  item: T,
  name: MenuIconName,
): T {
  item.prepend(menuIcon(name));
  return item;
}
