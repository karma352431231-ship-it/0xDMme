import { canMakeStickers, makeSticker } from '../stickers/index.ts';
import { showToast } from '../toast/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import {
  bindSwipe,
  viewerStepControls,
  zoomableImage,
} from '../image-viewer/index.ts';
import type { ViewerStep } from '../image-viewer/index.ts';

/** Every picture of the open conversation, in the order of the history. */
const chatPictures = '.chat-image-open';

function stickerButton(
  url: string,
  sticker: boolean,
  viewer: HTMLDialogElement,
): HTMLButtonElement | null {
  if (!canMakeStickers()) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = sticker ? t('Save sticker') : t('Make sticker');
  button.addEventListener('click', () => {
    viewer.close();
    // A received sticker is saved as it is; any other picture is framed first.
    void fetch(url)
      .then((response) => response.blob())
      .then((picture) => makeSticker(picture, !sticker))
      .catch((error: unknown) => {
        showToast(
          error instanceof Error
            ? translatedError(error.message)
            : t('Could not save the sticker.'),
        );
      });
  });
  return button;
}

/**
 * The other pictures of the same chat (owner, 25/11/2026: swipe between them
 * on phones). Moving closes this view and opens the next picture through its
 * own button, so it loads and owns its original as a tap would.
 */
function chatSteps(
  trigger: HTMLElement,
  viewer: HTMLDialogElement,
): ViewerStep | undefined {
  const root = trigger.closest('.chat-panel');
  if (!root) return undefined;
  const pictures = [...root.querySelectorAll<HTMLElement>(chatPictures)];
  const index = pictures.indexOf(trigger);
  if (index < 0 || pictures.length < 2) return undefined;
  const go = (target: HTMLElement | undefined) =>
    target
      ? () => {
          viewer.close();
          target.click();
        }
      : undefined;
  return {
    position: `${index + 1} / ${pictures.length}`,
    previous: go(pictures[index - 1]),
    next: go(pictures[index + 1]),
  };
}

/**
 * Full-size view of a decrypted chat image: fingers zoom and move it, a tap on
 * it toggles zoom, sideways swipes and arrows move between the chat's
 * pictures, and the bar saves it. The Blob URL stays owned by the chat.
 */
export function openChatImage(
  url: string,
  input: { name: string; sticker?: boolean | undefined; trigger: HTMLElement },
): void {
  const viewer = document.createElement('dialog');
  viewer.className = 'media-viewer';
  viewer.setAttribute('aria-label', input.name);
  const frame = document.createElement('div');
  frame.className = 'media-viewer-frame';
  const image = document.createElement('img');
  image.src = url;
  image.alt = input.name;
  image.draggable = false;
  frame.append(image);
  const bar = document.createElement('div');
  bar.className = 'media-viewer-bar';
  const save = document.createElement('a');
  save.href = url;
  save.download = input.name;
  save.textContent = t('Save on device');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = t('Close');
  close.addEventListener('click', () => {
    viewer.close();
  });
  // The viewer shows only the image and its controls (owner, 12/11/2026);
  // stickers added "Make sticker" (24/11/2026).
  const sticker = stickerButton(url, input.sticker === true, viewer);
  bar.append(save, ...(sticker ? [sticker] : []), close);
  const step = chatSteps(input.trigger, viewer);
  const zoom = zoomableImage({ dialog: viewer, frame, image });
  const swipe = bindSwipe(frame, image, {
    previous: step?.previous,
    next: step?.next,
    zoomed: zoom.zoomed,
  });
  image.addEventListener('click', (event) => {
    if (swipe.takeSwiped()) event.stopPropagation();
    else zoom.tap(event);
  });
  viewer.append(frame, bar, ...(step ? viewerStepControls(viewer, step) : []));
  // A tap around the image closes; the bar keeps its controls (the arrows
  // stop their own clicks).
  viewer.addEventListener('click', (event) => {
    if (zoom.takeMoved() || swipe.takeSwiped()) return;
    const target = event.target as Node;
    if (target !== image && !bar.contains(target)) viewer.close();
  });
  viewer.addEventListener('close', () => {
    viewer.remove();
  });
  document.body.append(viewer);
  viewer.showModal();
}
