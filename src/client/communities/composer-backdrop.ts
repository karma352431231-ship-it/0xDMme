function outsideDialog(event: MouseEvent, dialog: HTMLDialogElement): boolean {
  if (event.target !== dialog) return false;
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

/** A backdrop gesture belongs to the composer, never to the feed behind it. */
export function bindComposerBackdrop(
  dialog: HTMLDialogElement,
  options: { signal: AbortSignal; requestClose: () => void },
): void {
  let startedOutside = false;
  const listener = { signal: options.signal };
  dialog.addEventListener(
    'pointerdown',
    (event) => {
      startedOutside = event.button === 0 && outsideDialog(event, dialog);
    },
    listener,
  );
  dialog.addEventListener(
    'pointercancel',
    () => {
      startedOutside = false;
    },
    listener,
  );
  dialog.addEventListener(
    'click',
    (event) => {
      const close =
        startedOutside && event.button === 0 && outsideDialog(event, dialog);
      startedOutside = false;
      if (!close || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      options.requestClose();
    },
    listener,
  );
}
