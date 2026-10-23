import { t } from '../../shared/i18n/index.ts';

const svgNs = 'http://www.w3.org/2000/svg';
function closeIcon(): SVGSVGElement {
  const icon = document.createElementNS(svgNs, 'svg'),
    path = document.createElementNS(svgNs, 'path');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  path.setAttribute('d', 'M6 6l12 12M18 6L6 18');
  icon.append(path);
  return icon;
}

/** Only the enlarged image over the page: tapping it toggles zoom, tapping
 * anywhere else or the X closes it and returns to where the user was.
 * Reuses the caller's image URL and lifetime; viewing never fetches bytes. */
export function openImageViewer(input: {
  url: string;
  alt: string;
  trigger: HTMLButtonElement;
  signal: AbortSignal;
}): () => void {
  const dialog = document.createElement('dialog'),
    frame = document.createElement('div'),
    image = document.createElement('img'),
    close = document.createElement('button');
  dialog.className = 'public-image-viewer';
  dialog.setAttribute('aria-label', t('Enlarged image'));
  frame.className = 'public-image-frame';
  image.src = input.url;
  image.alt = input.alt;
  close.type = 'button';
  close.className = 'public-image-close';
  close.setAttribute('aria-label', t('Close'));
  close.append(closeIcon());
  let expanded = false;
  const toggle = (event: Event): void => {
    event.stopPropagation();
    expanded = !expanded;
    dialog.classList.toggle('zoomed', expanded);
    image.style.width = expanded
      ? `${Math.max(image.naturalWidth, frame.clientWidth * 2)}px`
      : '';
  };
  const stop = (): void => {
    input.signal.removeEventListener('abort', stop);
    dialog.remove();
    if (!input.signal.aborted && input.trigger.isConnected)
      input.trigger.focus({ preventScroll: true });
  };
  image.addEventListener('click', toggle);
  close.addEventListener('click', stop);
  dialog.addEventListener('close', stop);
  dialog.addEventListener('cancel', stop);
  // Any tap outside the image itself closes, including around a zoomed one.
  dialog.addEventListener('click', (event) => {
    if (event.target !== image) stop();
  });
  input.signal.addEventListener('abort', stop, { once: true });
  frame.append(image);
  dialog.append(frame, close);
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
