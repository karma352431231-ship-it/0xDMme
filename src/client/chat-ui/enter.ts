/**
 * Physical keyboards: Enter sends and Shift+Enter breaks the line. Touch
 * keyboards keep Enter as a new line (the send button is beside the field);
 * Ctrl/Cmd+Enter still sends there. Never sends mid IME composition.
 */
export function sendOnEnter(field: HTMLElement, send: () => void): void {
  field.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    const shortcut = event.ctrlKey || event.metaKey;
    if (!shortcut && touchKeyboard()) return;
    event.preventDefault();
    send();
  });
}
function touchKeyboard(): boolean {
  return matchMedia('(hover: none) and (pointer: coarse)').matches;
}
