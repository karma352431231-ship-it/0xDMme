import { t } from '../../shared/i18n/index.ts';
// SPDX-License-Identifier: GPL-3.0-only
import { requestApi } from '../api-transport/index.ts';
import {
  publicAvatar,
  publicPostMedia,
  publicPostMediaPath,
} from '../../shared/public-media/index.ts';
import type { PublicAvatarKind } from '../../shared/public-media/index.ts';
import { publicAvatarLimit } from '../../shared/public-avatar/index.ts';
import {
  publicStickerBytes,
  publicStickerPath,
} from '../../shared/stickers/index.ts';
import type { PublicPostMedia } from '../../shared/public-media/index.ts';
import { withPublicRead } from './reads.ts';
import { mountInlineVideo } from '../inline-video/index.ts';
import { mountPublicPicture } from './picture.ts';
import type { GalleryItem } from '../image-viewer/index.ts';

function blobEnvelope(
  response: Response,
  maximum: number,
  acceptedTypes: readonly string[] = ['image/png', 'image/jpeg'],
): { type: string; size: number } {
  const type = response.headers.get('content-type');
  if (!type || !acceptedTypes.includes(type)) {
    throw new Error('Invalid public media format.');
  }
  const size = Number(response.headers.get('content-length'));
  if (
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > maximum ||
    !response.body
  ) {
    throw new Error('Invalid public media size.');
  }
  return { type, size };
}
async function boundedBlob(
  response: Response,
  maximum: number,
  acceptedTypes: readonly string[] = ['image/png', 'image/jpeg'],
): Promise<Blob> {
  let envelope: { type: string; size: number };
  try {
    envelope = blobEnvelope(response, maximum, acceptedTypes);
  } catch (error: unknown) {
    await response.body?.cancel().catch(() => undefined);
    throw error;
  }
  const { type, size } = envelope;
  const reader = response.body!.getReader(),
    chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      received += next.value.length;
      if (received > size) throw new Error('Public media exceeds the limit.');
      chunks.push(Uint8Array.from(next.value));
    }
    if (received !== size) throw new Error('Public media incomplete.');
    return new Blob(chunks, { type });
  } catch (error: unknown) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
export async function publicPostMediaBlob(
  media: PublicPostMedia,
  thumbnail: boolean,
  signal: AbortSignal,
): Promise<Blob> {
  const checked = publicPostMedia([media])[0]!;
  return withPublicRead(signal, async () => {
    const response = await requestApi(publicPostMediaPath(checked, thumbnail), {
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('Public media unavailable.');
    }
    return boundedBlob(
      response,
      thumbnail ? checked.result.thumbnailBytes : checked.result.bytes,
      [thumbnail ? 'image/png' : checked.result.type],
    );
  });
}
export function showPublicPostMedia(
  container: HTMLElement,
  media: PublicPostMedia[],
  signal: AbortSignal,
): () => void {
  const checked = publicPostMedia(media);
  if (signal.aborted) return () => undefined;
  const mediaCleanup: Array<() => void> = [];
  const pending = new AbortController(),
    lifetime = AbortSignal.any([signal, pending.signal]);
  const field = document.createElement('div');
  field.className = 'community-public-media';
  container.append(field);
  const cleanup = () => {
    pending.abort();
    for (const stop of mediaCleanup) stop();
    field.remove();
    signal.removeEventListener('abort', cleanup);
  };
  signal.addEventListener('abort', cleanup, { once: true });
  const gallery = postGallery(lifetime);
  for (const item of checked) {
    if (item.result.kind === 'video') {
      const slot = document.createElement('figure');
      field.append(slot);
      mediaCleanup.push(
        mountInlineVideo(slot, {
          signal: lifetime,
          size: item.result,
          load: async (signal) => ({
            blob: await publicPostMediaBlob(item, false, signal),
          }),
          poster: {
            bytes: item.result.thumbnailBytes,
            load: (signal) => publicPostMediaBlob(item, true, signal),
          },
        }),
      );
      continue;
    }
    const slot = document.createElement('figure');
    field.append(slot);
    const index = gallery.items.length;
    gallery.items.push(gallery.item(item, index));
    mediaCleanup.push(
      mountPublicPicture(slot, item, {
        signal: lifetime,
        load: (signal) => publicPostMediaBlob(item, false, signal),
        gallery: { items: gallery.items, index },
        shown: (url) => gallery.shown(index, url),
      }),
    );
  }
  return cleanup;
}
/**
 * The pictures of one post as gallery items (owner, 25/11/2026: swipe
 * between them). A picture already on screen is reused; any other is read
 * when reached and kept until the post's media go away.
 */
function postGallery(lifetime: AbortSignal): {
  items: GalleryItem[];
  item: (media: PublicPostMedia, index: number) => GalleryItem;
  shown: (index: number, url: string | null) => void;
} {
  const onScreen = new Map<number, string>(),
    read = new Map<number, Promise<string>>();
  return {
    items: [],
    shown: (index, url) => {
      if (url) onScreen.set(index, url);
      else onScreen.delete(index);
    },
    item: (media, index) => ({
      alt:
        media.result.kind === 'gif'
          ? t('Approved public GIF')
          : t('Approved public photo'),
      load: () => {
        const visible = onScreen.get(index);
        if (visible) return Promise.resolve({ url: visible });
        let copy = read.get(index);
        if (!copy) {
          copy = publicPostMediaBlob(media, false, lifetime).then((blob) => {
            const url = URL.createObjectURL(blob);
            lifetime.addEventListener('abort', () => URL.revokeObjectURL(url), {
              once: true,
            });
            return url;
          });
          read.set(index, copy);
          copy.catch(() => read.delete(index));
        }
        return copy.then((url) => ({ url }));
      },
    }),
  };
}
export async function publicAvatarBlob(input: {
  kind: PublicAvatarKind;
  target: string;
  reference: string;
  signal: AbortSignal;
}): Promise<Blob> {
  const reference = publicAvatar(input.reference, input.kind, input.target);
  if (!reference) throw new Error('Public photo unavailable.');
  return withPublicRead(input.signal, async () => {
    const response = await requestApi(reference, {
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.any([input.signal, AbortSignal.timeout(8000)]),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('Public photo unavailable.');
    }
    return boundedBlob(response, publicAvatarLimit);
  });
}
/** A public sticker's approved file, read anonymously like public photos. */
export function publicStickerBlob(
  id: string,
  signal: AbortSignal,
): Promise<Blob> {
  const path = publicStickerPath(id);
  return withPublicRead(signal, async () => {
    const response = await requestApi(path, {
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('Sticker unavailable.');
    }
    return boundedBlob(response, publicStickerBytes);
  });
}
/** Anonymous fetch avoids attaching the viewer's login cookie to public photo requests. */
export function showPublicAvatar(
  container: HTMLElement,
  input: {
    kind: PublicAvatarKind;
    target: string;
    reference: string;
    signal: AbortSignal;
    ready?: (url: string | null) => void;
  },
): () => void {
  if (input.signal.aborted) return () => undefined;
  const image = document.createElement('img'),
    status = document.createElement('span');
  image.className = 'public-avatar-preview';
  image.alt = t('Approved public photo');
  image.hidden = true;
  status.setAttribute('role', 'status');
  container.append(image, status);
  let url: string | null = null,
    stopped = false;
  const pending = new AbortController(),
    lifetime = AbortSignal.any([input.signal, pending.signal]);
  const stop = () => {
    stopped = true;
    pending.abort();
    input.ready?.(null);
    if (url) URL.revokeObjectURL(url);
    image.remove();
    status.remove();
    input.signal.removeEventListener('abort', stop);
  };
  input.signal.addEventListener('abort', stop, { once: true });
  void publicAvatarBlob({ ...input, signal: lifetime })
    .then((blob) => {
      if (stopped || input.signal.aborted || !container.isConnected) return;
      url = URL.createObjectURL(blob);
      image.src = url;
      image.hidden = false;
      input.ready?.(url);
    })
    .catch(() => {
      if (!stopped && !input.signal.aborted)
        status.textContent = t('Photo unavailable.');
    });
  return stop;
}
