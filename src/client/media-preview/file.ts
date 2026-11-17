import { attachmentVideoType } from '../../shared/attachments/index.ts';
import { captureMediaPreview } from './capture.ts';

type PictureSource = HTMLImageElement | HTMLVideoElement;

/** Uses only the verified local selection. The resulting JPEG is a separate file. */
export function attachmentFilePicture(
  file: { image: boolean; type: string; bytes: Uint8Array<ArrayBuffer> },
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const video = attachmentVideoType(file.type);
  if (!file.image && !video) return Promise.resolve(null);
  return filePicture(
    new Blob([file.bytes], { type: file.type }),
    video,
    signal,
  );
}

export function imageFilePicture(
  file: Blob,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer> | null> {
  return filePicture(file, false, signal);
}

async function filePicture(
  file: Blob,
  video: boolean,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof document === 'undefined' || signal?.aborted) return null;
  const url = URL.createObjectURL(file);
  const source = video ? createPreviewVideo() : document.createElement('img');
  const timeout = AbortSignal.timeout(8_000);
  const lifetime = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    await loadPictureSource(source, url, lifetime);
    return await captureMediaPreview(source, pictureSize(source), lifetime);
  } catch {
    // A missing browser decoder or cancelled preview leaves the original usable.
    return null;
  } finally {
    source.removeAttribute('src');
    if (source instanceof HTMLVideoElement) source.load();
    URL.revokeObjectURL(url);
  }
}

function createPreviewVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  return video;
}

function pictureSize(source: PictureSource) {
  return source instanceof HTMLVideoElement
    ? { width: source.videoWidth, height: source.videoHeight }
    : { width: source.naturalWidth, height: source.naturalHeight };
}

async function loadPictureSource(
  source: PictureSource,
  url: string,
  signal: AbortSignal,
): Promise<void> {
  if (!(source instanceof HTMLVideoElement))
    return waitForPicture(source, 'load', signal, () => {
      source.src = url;
    });

  await waitForPicture(source, 'loadeddata', signal, () => {
    source.src = url;
  });
  if (!Number.isFinite(source.duration) || source.duration <= 0) return;
  // A completed seek supplies an actual frame on WebKit, where drawing
  // immediately after loadeddata can still copy an empty video surface.
  const time = Math.min(0.1, source.duration / 2);
  if (source.currentTime !== time)
    await waitForPicture(source, 'seeked', signal, () => {
      source.currentTime = time;
    });
}

async function waitForPicture(
  source: PictureSource,
  event: string,
  signal: AbortSignal,
  start: () => void,
): Promise<void> {
  const events = new AbortController();
  const listen = { once: true, signal: events.signal };
  try {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => reject(new DOMException('Preview interrupted.', 'AbortError')),
        listen,
      );
      source.addEventListener(event, () => resolve(), listen);
      source.addEventListener(
        'error',
        () => reject(new Error('Preview unavailable.')),
        listen,
      );
      start();
    });
  } finally {
    events.abort();
  }
}
