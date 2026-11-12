/**
 * Chrome shows the focus ring of a clicked element as soon as any key is
 * pressed, modifiers included, so Shift alone outlined the last area used
 * (12/11/2026). The page marks a pointer press and keeps rings hidden until a
 * key that moves or acts on focus (Tab, arrows, Enter…) is pressed without
 * Control, Alt or Meta. Keyboard users keep their rings.
 */
const modifierKeys = new Set([
  'Shift',
  'Control',
  'Alt',
  'AltGraph',
  'Meta',
  'CapsLock',
  'Fn',
  'OS',
  // Keys the browser cannot name never move focus.
  '',
  'Unidentified',
]);
export const pointerFocusAttribute = 'data-pointer-focus';

/** True when a keydown should bring keyboard focus rings back. */
export function keyboardNavigation(event: {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): boolean {
  return (
    !modifierKeys.has(event.key) &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey
  );
}

export function startFocusModality(
  root: HTMLElement = document.documentElement,
): void {
  document.addEventListener(
    'pointerdown',
    () => root.setAttribute(pointerFocusAttribute, ''),
    { capture: true, passive: true },
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (keyboardNavigation(event))
        root.removeAttribute(pointerFocusAttribute);
    },
    { capture: true },
  );
}
