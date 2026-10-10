/**
 * Files dragged onto `zone` reach `input` as if chosen with its picker, so the
 * same validation, preparation and limits apply. A disabled input refuses them.
 */
export function dropFilesInto(
  zone: HTMLElement,
  input: HTMLInputElement,
): void {
  let depth = 0;
  const files = (event: DragEvent): boolean =>
    !!event.dataTransfer && [...event.dataTransfer.types].includes('Files');
  const reset = (): void => {
    depth = 0;
    delete zone.dataset['dropping'];
  };
  zone.addEventListener('dragenter', (event) => {
    if (!files(event) || input.disabled) return;
    event.preventDefault();
    depth++;
    zone.dataset['dropping'] = 'true';
  });
  zone.addEventListener('dragover', (event) => {
    if (!files(event) || input.disabled || !event.dataTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  zone.addEventListener('dragleave', (event) => {
    if (!files(event)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) delete zone.dataset['dropping'];
  });
  zone.addEventListener('drop', (event) => {
    if (!files(event) || !event.dataTransfer) return;
    event.preventDefault();
    event.stopPropagation();
    reset();
    if (input.disabled) return;
    const dropped = [...event.dataTransfer.files];
    if (!dropped.length) return;
    const transfer = new DataTransfer();
    for (const file of input.multiple ? dropped : dropped.slice(0, 1))
      transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/** Outside drop zones a dropped file must not replace the app page. */
export function keepPageOnStrayDrop(): void {
  for (const type of ['dragover', 'drop'] as const)
    window.addEventListener(type, (event) => {
      if (event.dataTransfer && [...event.dataTransfer.types].includes('Files'))
        event.preventDefault();
    });
}
