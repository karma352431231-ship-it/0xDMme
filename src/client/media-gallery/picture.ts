import {
  captureMediaPreview,
  previewByteLimit,
} from '../media-preview/index.ts';

/** Retain only small pictures, including a video's opening frame. */
export async function prepareGalleryPicture(
  bytes: Uint8Array<ArrayBuffer>,
  videoType: string | null,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!videoType && bytes.length <= previewByteLimit) return bytes;
  const url = URL.createObjectURL(
    new Blob([bytes], videoType ? { type: videoType } : {}),
  );
  const media = videoType
    ? document.createElement('video')
    : document.createElement('img');
  if (media instanceof HTMLVideoElement) {
    media.muted = true;
    media.playsInline = true;
    media.preload = 'auto';
  }
  try {
    await mediaFrame(media, videoType ? url + '#t=0.1' : url, signal);
    const result = await captureMediaPreview(
      media,
      mediaDimensions(media),
      signal,
    );
    if (!result) throw new Error('Preview unavailable.');
    return result;
  } finally {
    media.removeAttribute('src');
    if (media instanceof HTMLVideoElement) media.load();
    URL.revokeObjectURL(url);
    bytes.fill(0);
  }
}

function mediaDimensions(media: HTMLVideoElement | HTMLImageElement) {
  return media instanceof HTMLVideoElement
    ? { width: media.videoWidth, height: media.videoHeight }
    : { width: media.naturalWidth, height: media.naturalHeight };
}

function mediaFrame(
  media: HTMLVideoElement | HTMLImageElement,
  url: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(failed, 8000);
    const events = new AbortController();
    function finish(error?: Error) {
      clearTimeout(timer);
      events.abort();
      signal.removeEventListener('abort', failed);
      if (error) reject(error);
      else resolve();
    }
    function failed() {
      finish(new Error('Preview unavailable.'));
    }
    media.addEventListener(
      media instanceof HTMLVideoElement ? 'loadeddata' : 'load',
      () => finish(),
      {
        signal: events.signal,
      },
    );
    media.addEventListener('error', failed, { signal: events.signal });
    signal.addEventListener('abort', failed, { once: true });
    if (signal.aborted) return failed();
    media.src = url;
  });
}
