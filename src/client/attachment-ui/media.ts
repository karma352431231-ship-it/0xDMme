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
import type { NativeVideoInput } from '../native-video/index.ts';

export interface MediaView {
  archived?: boolean;
  id: string;
  text: string;
  peer: string;
}
interface MediaInput<V extends MediaView> {
  playVideo: (input: NativeVideoInput) => Promise<boolean>;
  signal?: AbortSignal;
  content?: AttachmentContent;
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
  enqueue: (work: () => Promise<void>) => Promise<void>;
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
function showVideo(preview: HTMLElement, url: string, name: string): void {
  const video = document.createElement('video');
  video.className = 'chat-video';
  video.controls = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = url;
  video.setAttribute('aria-label', name);
  preview.replaceChildren(video);
  void video.play().catch(() => undefined);
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
  const video = preview.querySelector('video');
  if (!video) {
    diagnostic.point('complete', { loadOutcome: 'complete' });
    return;
  }
  const ready = () => {
    diagnostic.point('decode');
    if ('requestVideoFrameCallback' in video)
      video.requestVideoFrameCallback(() => diagnostic.frame(preview, current));
    else diagnostic.frame(preview, current);
  };
  video.addEventListener('loadeddata', ready, { once: true });
}
function mediaLoadKind(content: AttachmentContent): 'image' | 'video' | 'file' {
  if (imageCandidate(content)) return 'image';
  return content.type.startsWith('video/') ? 'video' : 'file';
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
  input: { name: string; saveNotice: string },
): void {
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'chat-image-open';
  open.setAttribute('aria-label', t('Zoom in on image {0}', [input.name]));
  const image = document.createElement('img');
  image.src = url;
  image.alt = input.name;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => {
    preview.textContent = t(
      'Could not display the image. You can save the original file.',
    );
  });
  open.append(image);
  open.addEventListener('click', () => {
    openImageViewer(url, input);
  });
  preview.replaceChildren(open);
}
/** Full-size view of a decrypted image; the Blob URL stays owned by the chat. */
function openImageViewer(
  url: string,
  input: { name: string; saveNotice: string },
): void {
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
  const notice = document.createElement('small');
  notice.textContent = input.saveNotice;
  bar.append(save, notice, close);
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
function offerSave<V extends MediaView>(
  input: MediaInput<V>,
  url: string,
  name: string,
): void {
  const save = document.createElement('a');
  save.href = url;
  save.download = name;
  save.textContent = t('Save on device');
  const warning = document.createElement('small');
  warning.textContent = input.saveNotice ?? defaultSaveNotice;
  input.article.append(save, warning);
}
/** Images show only their content and the sender's caption, if any. */
function mediaInfo(content: AttachmentContent, image: boolean): string {
  const caption = decodeDailyText(content.caption).text;
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
  const caption = decodeDailyText(content.caption).text;
  if (!caption) return;
  const text = document.createElement('p');
  text.textContent = caption;
  input.article.append(text);
}
/** The owner supplies generation checks, serial admission and Blob cleanup. */
export function renderMedia<V extends MediaView>(input: MediaInput<V>): void {
  const content =
    input.content ?? attachmentContent(JSON.parse(input.view.text) as unknown);
  if (content.voice) {
    renderVoice(input, content, content.voice);
    return;
  }
  const image = imageCandidate(content),
    video = content.type === 'video/mp4' || content.type === 'video/quicktime',
    info = document.createElement('p'),
    preview = document.createElement('div'),
    button = document.createElement('button');
  info.textContent = mediaInfo(content, image);
  info.hidden = !info.textContent;
  preview.className = 'chat-attachment-preview';
  button.type = 'button';
  button.textContent = image
    ? t('Load image')
    : video
      ? t('Play video')
      : t('Download original file');
  input.article.append(
    ...(image
      ? [frameImagePreview(preview, input.imageOverlay), info]
      : [info, preview]),
    button,
  );
  button.hidden = image;
  let pending = false;
  let savedVideoUrl: string | null = null;
  async function presentVideo(value: {
    bytes: Uint8Array<ArrayBuffer>;
    type: string;
    url: string;
    diagnostic: LoadTrace | undefined;
  }): Promise<void> {
    const { bytes, type, url, diagnostic } = value;
    if (!savedVideoUrl) {
      savedVideoUrl = url;
      offerSave(input, url, content.name);
    }
    input.playback.pause();
    if (
      await input.playVideo({
        bytes,
        mime: type,
        signal: input.signal,
        current: input.current,
        diagnostic,
      })
    )
      return;
    if (!input.current()) return;
    button.hidden = true;
    showVideo(preview, url, content.name);
    readyMedia(preview, diagnostic, input.current);
  }
  function keepBlob(bytes: Uint8Array<ArrayBuffer>, type: string): string {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    input.retain(url);
    return url;
  }
  async function fetchMedia(): Promise<void> {
    if (!input.current()) return;
    const diagnostic = startLoad(mediaLoadKind(content), input.view.peer);
    const bytes = await loadMediaBytes(input, diagnostic);
    try {
      if (!input.current()) return;
      const type = displayType(bytes, content);
      if (video && type.startsWith('video/')) {
        const url = savedVideoUrl ?? keepBlob(bytes, type);
        await presentVideo({ bytes, type, url, diagnostic });
        return;
      }
      const url = keepBlob(bytes, type);
      button.hidden = true;
      if (image && type !== 'application/octet-stream') {
        showImage(preview, url, {
          name: content.name,
          saveNotice: input.saveNotice ?? defaultSaveNotice,
        });
        readyMedia(preview, diagnostic, input.current);
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
    void Promise.resolve()
      .then(() => withAutomaticRetries(request, input.current))
      .catch(() => {
        if (!input.current()) return;
        preview.textContent = t(
          'Image unavailable. Connect or tap to try again.',
        );
        button.textContent = t('Try loading image');
        button.hidden = false;
      });
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
