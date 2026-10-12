/** Uses the already approved image URL: opening/zooming makes no new network request. */
export function openImageViewer(input: {
  url: string;
  alt: string;
  trigger: HTMLButtonElement;
  signal: AbortSignal;
}): () => void {
  const dialog = document.createElement('dialog'),
    toolbar = document.createElement('div'),
    frame = document.createElement('div'),
    image = document.createElement('img'),
    zoom = document.createElement('button'),
    close = document.createElement('button');
  dialog.className = 'public-image-viewer';
  dialog.setAttribute('aria-label', 'Imagem ampliada');
  toolbar.className = 'public-image-toolbar';
  frame.className = 'public-image-frame';
  image.src = input.url;
  image.alt = input.alt;
  zoom.type = close.type = 'button';
  zoom.textContent = 'Ampliar';
  zoom.setAttribute('aria-pressed', 'false');
  close.textContent = 'Fechar';
  let expanded = false;
  const toggle = (): void => {
    expanded = !expanded;
    dialog.classList.toggle('zoomed', expanded);
    image.style.width = expanded
      ? `${Math.max(image.naturalWidth, frame.clientWidth * 2)}px`
      : '';
    image.style.height = '';
    zoom.textContent = expanded ? 'Ajustar à tela' : 'Ampliar';
    zoom.setAttribute('aria-pressed', String(expanded));
  };
  const stop = (): void => {
    input.signal.removeEventListener('abort', stop);
    dialog.remove();
    if (input.trigger.isConnected) input.trigger.focus({ preventScroll: true });
  };
  zoom.addEventListener('click', toggle);
  image.addEventListener('click', toggle);
  close.addEventListener('click', stop);
  dialog.addEventListener('close', stop);
  dialog.addEventListener('cancel', stop);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) stop();
  });
  input.signal.addEventListener('abort', stop, { once: true });
  toolbar.append(zoom, close);
  frame.append(image);
  dialog.append(toolbar, frame);
  document.body.append(dialog);
  try {
    input.signal.throwIfAborted();
    dialog.showModal();
  } catch (error: unknown) {
    stop();
    throw error;
  }
  return stop;
}
