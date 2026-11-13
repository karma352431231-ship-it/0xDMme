import { captureMediaPreview } from '../media-preview/index.ts';
import type { MediaPreviews } from '../media-preview/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import type { AttachmentContent } from '../../shared/attachments/index.ts';
import type { VoiceMetadata } from '../../shared/voice/index.ts';
import { decodeDailyText } from '../../shared/daily/index.ts';
import {
  originalImageType,
  originalVideoType,
} from '../attachment-images/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import { startLoad } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import { mountInlineVideo } from '../inline-video/index.ts';
import { chatVideoStage } from '../chat-video/index.ts';

export interface MediaView {
  archived?: boolean;
  id: string;
  text: string;
  peer: string;
}
interface MediaInput<V extends MediaView> {
  signal: AbortSignal;
  content?: AttachmentContent;
  previews?: MediaPreviews | undefined;
  /** Whether the media owner already holds this variant from earlier in the
   * session; such media shows at full quality at once. */
  ready?: ((variant: 'original' | 'thumbnail') => boolean) | undefined;
  /** Visible caption already interpreted by the conversation format owner. */
  caption?: string;
  imageOverlay?: HTMLElement;
  saveNotice?: string;
  article: HTMLElement;
  view: V;
  load: (
    view: V,
    thumbnail: boolean,
    diagnostic?: LoadTrace,
  ) => Promise<Uint8Array<ArrayBuffer>>;
  run: (work: () => Promise<void>) => Promise<void>;
  current: () => boolean;
  retain: (url: string) => void;
  enqueue: <T>(work: () => Promise<T>) => Promise<T>;
  playback: VoicePlayback;
}
function imageCandidate(content: AttachmentContent): boolean {
  return (
    content.image ||
    ['image/png', 'image/jpeg', 'image/webp'].includes(content.type) ||
    /\.(?:png|jpe?g|webp)$/iu.test(content.name)
  );
}
function displayType(bytes: Uint8Array, content: AttachmentContent): string {
  if (!imageCandidate(content))
    return originalVideoType(bytes) ?? 'application/octet-stream';
  if (content.image && content.type === 'image/gif') return 'image/gif';
  return originalImageType(bytes) ?? 'application/octet-stream';
}
function readyMedia(
  preview: HTMLElement,
  diagnostic: LoadTrace | undefined,
  current: () => boolean,
): void {
  if (!diagnostic) return;
  const image = preview.querySelector('img');
  if (image) {
    void image.decode().then(
      () => {
        diagnostic?.point('decode');
        diagnostic?.frame(preview, current);
      },
      () => diagnostic?.point('failed', { loadOutcome: 'failed' }),
    );
    return;
  }
  diagnostic.point('complete', { loadOutcome: 'complete' });
}
function attachmentLoadKind(content: AttachmentContent): 'image' | 'file' {
  return imageCandidate(content) ? 'image' : 'file';
}
async function loadMediaBytes<V extends MediaView>(
  input: MediaInput<V>,
  diagnostic: LoadTrace | undefined,
): Promise<Uint8Array<ArrayBuffer>> {
  diagnostic?.point('queue');
  try {
    const bytes = await input.load(input.view, false, diagnostic);
    if (!input.current())
      diagnostic?.point('cancelled', { loadOutcome: 'cancelled' });
    diagnostic?.point('decode', { loadBytes: bytes.length });
    return bytes;
  } catch (error: unknown) {
    diagnostic?.point('failed', { loadOutcome: 'failed' });
    throw error;
  }
}
const defaultSaveNotice = t(
  'The saved copy is outside the vault and bilateral deletion. Only open files from sources you trust.',
);
/** Images are only their content in the bubble; saving lives in the viewer. */
function showImage(
  preview: HTMLElement,
  url: string,
  input: {
    name: string;
    original?: (() => Promise<string>) | undefined;
    run?: ((work: () => Promise<void>) => Promise<void>) | undefined;
    current?: (() => boolean) | undefined;
    capture?: ((image: HTMLImageElement) => void) | undefined;
  },
): void {
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'chat-image-open';
  // A tap opens the viewer; a hold opens the message options.
  open.dataset['messageHold'] = 'true';
  open.setAttribute('aria-label', t('Zoom in on image {0}', [input.name]));
  const image = document.createElement('img');
  image.addEventListener('load', () => input.capture?.(image), { once: true });
  image.src = url;
  image.alt = input.name;
  image.loading = 'lazy';
  image.decoding = 'async';
  // iOS drag-and-drop would take over a held image and cancel the touch.
  image.draggable = false;
  image.addEventListener('error', () => {
    preview.textContent = t(
      'Could not display the image. You can save the original file.',
    );
  });
  open.append(image);
  open.addEventListener('click', () => {
    if (!input.original) {
      openImageViewer(url, input);
      return;
    }
    void input.run?.(async () => {
      const original = await input.original!();
      if (input.current?.()) openImageViewer(original, input);
    });
  });
  preview.replaceChildren(open);
}
/** Full-size view of a decrypted image; the Blob URL stays owned by the chat. */
function openImageViewer(url: string, input: { name: string }): void {
  const viewer = document.createElement('dialog');
  viewer.className = 'media-viewer';
  viewer.setAttribute('aria-label', input.name);
  const image = document.createElement('img');
  image.src = url;
  image.alt = input.name;
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
  // The viewer shows only the image and its two controls (owner, 12/11/2026).
  bar.append(save, close);
  viewer.append(image, bar);
  // A click on the backdrop or the image closes; the bar keeps its controls.
  viewer.addEventListener('click', (event) => {
    if (!bar.contains(event.target as Node)) viewer.close();
  });
  viewer.addEventListener('close', () => {
    viewer.remove();
  });
  document.body.append(viewer);
  viewer.showModal();
}
function saveLink(name: string): HTMLAnchorElement {
  const save = document.createElement('a');
  save.download = name;
  save.textContent = t('Save on device');
  return save;
}
function offerSave<V extends MediaView>(
  input: MediaInput<V>,
  url: string,
  name: string,
): void {
  const save = saveLink(name),
    warning = document.createElement('small');
  save.href = url;
  warning.textContent = input.saveNotice ?? defaultSaveNotice;
  input.article.append(save, warning);
}
/** Images show only their content and the sender's caption, if any. */
function mediaInfo(
  content: AttachmentContent,
  image: boolean,
  caption: string,
): string {
  if (image) return caption;
  const size = t('{0} MB', [(content.file.ref.bytes / 1_000_000).toFixed(2)]);
  return t('{0} · {1}{2}', [
    content.name,
    size,
    caption ? ` · ${caption}` : '',
  ]);
}
/** Keep the overlay outside the preview contents replaced by the media loader. */
function frameImagePreview(
  preview: HTMLElement,
  overlay?: HTMLElement,
): HTMLElement {
  if (!overlay) return preview;
  const frame = document.createElement('div');
  frame.className = 'chat-image-frame';
  frame.append(preview, overlay);
  return frame;
}
/** A voice is its player; decryption and download wait for the first play. */
function renderVoice<V extends MediaView>(
  input: MediaInput<V>,
  content: AttachmentContent,
  voice: VoiceMetadata,
): void {
  const { view } = input;
  const play = async (): Promise<void> => {
    if (!input.current()) return;
    const bytes = await input.load(view, false);
    try {
      if (!input.current()) return;
      input.playback.play({
        bytes,
        voice,
        id: view.id,
        peer: view.archived ? null : view.peer,
      });
    } finally {
      bytes.fill(0);
    }
  };
  input.article.append(
    input.playback.element({
      id: view.id,
      voice,
      load: () => input.run(() => input.enqueue(play)),
    }),
  );
  const caption = input.caption ?? decodeDailyText(content.caption).text;
  if (!caption) return;
  const text = document.createElement('p');
  text.textContent = caption;
  input.article.append(text);
}
function renderVideo<V extends MediaView>(
  input: MediaInput<V>,
  content: AttachmentContent,
): void {
  const slot = document.createElement('figure');
  slot.className = 'chat-attachment-video';
  const caption = input.caption ?? decodeDailyText(content.caption).text;
  input.article.append(slot);
  if (caption) {
    const text = document.createElement('p');
    text.textContent = caption;
    text.className = 'chat-video-caption';
    input.article.append(text);
  }
  let fallback: HTMLAnchorElement | undefined;
  mountInlineVideo(slot, {
    signal: input.signal,
    label: content.name,
    stage: (video, requestPlay) =>
      chatVideoStage({
        video,
        signal: input.signal,
        filename: content.name,
        requestPlay: input.previews ? requestPlay : undefined,
      }),
    play: () => input.playback.pause(),
    downloadFallback: (url) => {
      fallback?.remove();
      fallback = undefined;
      if (!url) return;
      fallback = saveLink(content.name);
      fallback.href = url;
      input.article.append(fallback);
    },
    load: (signal) => loadVideo(input, signal),
    ...(input.previews && !input.ready?.('original')
      ? {
          deferSource: true,
          poster: {
            bytes: 64 * 1024,
            load: async () => {
              const bytes = await input.previews!.read();
              try {
                return bytes && input.current()
                  ? new Blob([bytes], { type: 'image/jpeg' })
                  : null;
              } finally {
                bytes?.fill(0);
              }
            },
          },
          previewFrame: (video: HTMLVideoElement) =>
            persistPreview(input, video, {
              width: video.videoWidth,
              height: video.videoHeight,
            }),
        }
      : {}),
  });
}
async function loadVideo<V extends MediaView>(
  input: MediaInput<V>,
  signal: AbortSignal,
) {
  const diagnostic = startLoad('video', input.view.peer);
  const current = () => !signal.aborted && input.current();
  try {
    return await input.enqueue(async () => {
      requireVideoRow(current);
      const bytes = await loadMediaBytes(input, diagnostic);
      try {
        requireVideoRow(current);
        const type = originalVideoType(bytes);
        if (!type) diagnostic?.point('failed', { loadOutcome: 'failed' });
        const blob = new Blob([bytes], {
          type: type ?? 'application/octet-stream',
        });
        return {
          blob,
          decoded: (video: HTMLVideoElement) =>
            videoDecoded(video, diagnostic, current),
        };
      } finally {
        bytes.fill(0);
      }
    });
  } catch (error: unknown) {
    if (current()) diagnostic?.point('failed', { loadOutcome: 'failed' });
    else diagnostic?.point('cancelled', { loadOutcome: 'cancelled' });
    throw error;
  }
}
function requireVideoRow(current: () => boolean): void {
  if (!current()) throw new DOMException('Video row closed.', 'AbortError');
}
function videoDecoded(
  video: HTMLVideoElement,
  diagnostic: LoadTrace | undefined,
  current: () => boolean,
): void {
  if (!diagnostic || !current()) return;
  diagnostic.point('decode');
  diagnostic.frame(video, current);
}
/** The owner supplies generation checks, serial admission and Blob cleanup. */
export function renderMedia<V extends MediaView>(input: MediaInput<V>): void {
  const content =
    input.content ?? attachmentContent(JSON.parse(input.view.text) as unknown);
  if (content.voice) {
    renderVoice(input, content, content.voice);
    return;
  }
  if (content.type === 'video/mp4' || content.type === 'video/quicktime') {
    renderVideo(input, content);
    return;
  }
  const image = imageCandidate(content),
    info = document.createElement('p'),
    preview = document.createElement('div'),
    button = document.createElement('button');
  info.textContent = mediaInfo(
    content,
    image,
    input.caption ?? decodeDailyText(content.caption).text,
  );
  info.hidden = !info.textContent;
  preview.className = 'chat-attachment-preview';
  button.type = 'button';
  button.textContent = image ? t('Load image') : t('Download original file');
  input.article.append(
    ...(image
      ? [frameImagePreview(preview, input.imageOverlay), info]
      : [info, preview]),
    button,
  );
  button.hidden = image;
  let pending = false;
  // One original read per row, shared by the quality upgrade and the viewer.
  let original: Promise<string> | null = null;
  const openOriginal = (): Promise<string> => {
    original ??= originalPhoto(input, content).catch((error: unknown) => {
      original = null;
      throw error;
    });
    return original;
  };
  async function fetchMedia(): Promise<void> {
    if (!input.current()) return;
    const diagnostic = startLoad(attachmentLoadKind(content), input.view.peer);
    const loaded = await loadPhoto(input, content, diagnostic);
    const { bytes, previewOnly } = loaded;
    try {
      if (!input.current()) return;
      const type = displayType(bytes, content);
      const url = URL.createObjectURL(new Blob([bytes], { type }));
      input.retain(url);
      button.hidden = true;
      if (image && type !== 'application/octet-stream') {
        showImage(preview, url, {
          name: content.name,
          ...(previewOnly
            ? {
                original: openOriginal,
                run: input.run,
                current: input.current,
              }
            : {}),
          ...(input.previews && !previewOnly && content.type !== 'image/gif'
            ? {
                capture: (image: HTMLImageElement) => {
                  void persistPreview(input, image, {
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                  });
                },
              }
            : {}),
        });
        readyMedia(preview, diagnostic, input.current);
        upgradeToOriginal(preview, {
          content,
          previewOnly,
          original: openOriginal,
          current: input.current,
        });
        return;
      }
      if (image)
        preview.textContent = t(
          'Preview unavailable for this image. The original file is preserved.',
        );
      offerSave(input, url, content.name);
      readyMedia(preview, diagnostic, input.current);
    } finally {
      bytes.fill(0);
    }
  }
  async function request(): Promise<void> {
    if (pending || !input.current()) return;
    pending = true;
    button.disabled = true;
    try {
      await input.enqueue(fetchMedia);
    } finally {
      pending = false;
      if (input.current()) button.disabled = false;
    }
  }
  button.addEventListener('click', () => {
    void input.run(request);
  });
  if (image) {
    preview.textContent = t('Loading image…');
    // Rendering precedes DOM insertion; the serial queue starts after insertion.
    admitVisiblePreview(input, () =>
      Promise.resolve()
        .then(() => withAutomaticRetries(request, input.current))
        .catch(() => {
          if (!input.current()) return;
          preview.textContent = t(
            'Image unavailable. Connect or tap to try again.',
          );
          button.textContent = t('Try loading image');
          button.hidden = false;
        }),
    );
  }
}
/**
 * The small preview shows first; the original follows in the background and
 * replaces it once decoded, so the bubble ends at full quality (owner,
 * 13/11/2026). Failure keeps the preview; zoom still opens the original.
 */
function upgradeToOriginal(
  preview: HTMLElement,
  input: {
    content: AttachmentContent;
    previewOnly: boolean;
    original: () => Promise<string>;
    current: () => boolean;
  },
): void {
  // An original is already shown; an animated GIF plays from its original.
  if (!input.previewOnly || input.content.type === 'image/gif') return;
  const { original, current } = input;
  void original()
    .then(async (url) => {
      const full = new Image();
      full.src = url;
      await full.decode();
      const shown = preview.querySelector('img');
      if (current() && shown) shown.src = url;
    })
    .catch(() => {
      /* The preview stays; opening the image retries the original. */
    });
}
function admitVisiblePreview<V extends MediaView>(
  input: MediaInput<V>,
  work: () => Promise<void>,
): void {
  if (typeof IntersectionObserver === 'undefined') {
    void work();
    return;
  }
  const stop = () => observer.disconnect();
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      stop();
      input.signal.removeEventListener('abort', stop);
      if (input.current()) void work();
    },
    { rootMargin: '200px' },
  );
  observer.observe(input.article);
  input.signal.addEventListener('abort', stop, { once: true });
  if (input.signal.aborted) stop();
}
async function loadPhoto<V extends MediaView>(
  input: MediaInput<V>,
  content: AttachmentContent,
  diagnostic: LoadTrace | undefined,
) {
  if (!imageCandidate(content))
    return {
      bytes: await loadMediaBytes(input, diagnostic),
      previewOnly: false,
    };
  const animated = content.type === 'image/gif';
  if (input.ready?.('original'))
    return {
      bytes: await loadMediaBytes(input, diagnostic),
      previewOnly: false,
    };
  if (!animated && content.thumbnail)
    return {
      bytes: await input.load(input.view, true, diagnostic),
      previewOnly: true,
    };
  if (!animated && input.previews) {
    const bytes = await input.previews.read();
    if (bytes) return { bytes, previewOnly: true };
  }
  return { bytes: await loadMediaBytes(input, diagnostic), previewOnly: false };
}
async function originalPhoto<V extends MediaView>(
  input: MediaInput<V>,
  content: AttachmentContent,
): Promise<string> {
  return input.enqueue(async () => {
    const bytes = await input.load(input.view, false);
    try {
      if (!input.current())
        throw new DOMException('Image row closed.', 'AbortError');
      const url = URL.createObjectURL(
        new Blob([bytes], { type: displayType(bytes, content) }),
      );
      input.retain(url);
      return url;
    } finally {
      bytes.fill(0);
    }
  });
}
async function persistPreview<V extends MediaView>(
  input: MediaInput<V>,
  source: CanvasImageSource,
  size: { width: number; height: number },
): Promise<void> {
  if (!input.previews || !input.current()) return;
  let bytes: Uint8Array<ArrayBuffer> | null = null;
  try {
    bytes = await captureMediaPreview(source, size, input.signal);
    if (bytes && input.current()) await input.previews.save(bytes);
  } catch {
    // Unsupported canvas/codec or unavailable cache leaves the original usable.
  } finally {
    bytes?.fill(0);
  }
}
/** Waits before each automatic retry of a preview; then the person decides. */
const previewRetryDelays = [1000, 3000];
/**
 * A preview requested while a reopened conversation is still settling can
 * fail once and succeed moments later, so it is retried a bounded number of
 * times before asking for a tap. Leaving the conversation stops the retries.
 */
export async function withAutomaticRetries(
  work: () => Promise<void>,
  current: () => boolean,
  delays: readonly number[] = previewRetryDelays,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await work();
      return;
    } catch (error: unknown) {
      const delay = delays[attempt];
      if (delay === undefined || !current()) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (!current()) throw error;
    }
  }
}
