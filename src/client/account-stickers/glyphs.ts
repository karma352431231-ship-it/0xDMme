/** Shelf icons of the account's sticker sections (stroke drawing, like Recent). */
const paths = {
  heart:
    '<path d="M12 19.5s-7-4.3-7-9.3A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.2c0 5-7 9.3-7 9.3z"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
};

export function glyph(name: keyof typeof paths): Element {
  const holder = document.createElement('template');
  holder.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  return holder.content.firstElementChild!;
}

/** A pack's shelf icon: its first sticker, or its first letter. */
export function packIcon(name: string, image: HTMLElement | null): Element {
  if (image) return image;
  const letter = document.createElement('span');
  letter.className = 'sticker-shelf-text';
  letter.textContent = [...name][0]?.toUpperCase() ?? '?';
  return letter;
}
