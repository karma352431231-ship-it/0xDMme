// SPDX-License-Identifier: GPL-3.0-only
import {
  publicAvatar,
  publicPostMedia,
  publicPostMediaPath,
} from '../../shared/public-media/index.ts';
import type { PublicAvatarKind } from '../../shared/public-media/index.ts';
import { publicAvatarLimit } from '../../shared/public-avatar/index.ts';
import type { PublicPostMedia } from '../../shared/public-media/index.ts';
import { withPublicRead } from './reads.ts';

function blobEnvelope(
  response: Response,
  maximum: number,
  acceptedTypes: readonly string[] = ['image/png', 'image/jpeg'],
): { type: string; size: number } {
  const type = response.headers.get('content-type');
  if (!type || !acceptedTypes.includes(type)) {
    throw new Error('Formato da mídia pública inválido.');
  }
  const size = Number(response.headers.get('content-length'));
  if (
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > maximum ||
    !response.body
  ) {
    throw new Error('Tamanho da mídia pública inválido.');
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
      if (received > size) throw new Error('Mídia pública excedida.');
      chunks.push(Uint8Array.from(next.value));
    }
    if (received !== size) throw new Error('Mídia pública incompleta.');
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
    const response = await fetch(publicPostMediaPath(checked, thumbnail), {
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('Mídia pública indisponível.');
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
  const urls = new Set<string>(),
    pending = new AbortController(),
    lifetime = AbortSignal.any([signal, pending.signal]);
  const field = document.createElement('div');
  field.className = 'community-public-media';
  container.append(field);
  const cleanup = () => {
    pending.abort();
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
    field.remove();
    signal.removeEventListener('abort', cleanup);
  };
  signal.addEventListener('abort', cleanup, { once: true });
  for (const item of checked) {
    const button = document.createElement('button'),
      caption = document.createElement('span');
    button.type = 'button';
    button.textContent =
      item.result.kind === 'video'
        ? 'Abrir vídeo'
        : item.result.kind === 'gif'
          ? 'Abrir GIF'
          : 'Abrir foto';
    const slot = document.createElement('figure');
    slot.append(button, caption);
    field.append(slot);
    void picture(item, true, button).catch(() => {
      if (!lifetime.aborted) caption.textContent = 'Miniatura indisponível.';
    });
    button.addEventListener('click', () => {
      button.disabled = true;
      void picture(item, false, slot)
        .then(() => {
          button.remove();
          caption.textContent = '';
        })
        .catch(() => {
          if (!lifetime.aborted) {
            button.disabled = false;
            caption.textContent = 'Mídia indisponível.';
          }
        });
    });
  }
  async function picture(
    item: PublicPostMedia,
    thumbnail: boolean,
    target: HTMLElement,
  ): Promise<void> {
    const blob = await publicPostMediaBlob(item, thumbnail, lifetime);
    if (lifetime.aborted || !field.isConnected) return;
    const url = URL.createObjectURL(blob);
    urls.add(url);
    const node =
      !thumbnail && item.result.kind === 'video'
        ? document.createElement('video')
        : document.createElement('img');
    node.className = 'community-media-preview';
    if (node instanceof HTMLVideoElement) {
      node.controls = true;
      node.preload = 'metadata';
    } else
      node.alt = thumbnail
        ? 'Miniatura pública aprovada'
        : 'Mídia pública aprovada';
    node.src = url;
    target.append(node);
    if (!thumbnail) {
      const download = document.createElement('a');
      download.href = url;
      const extension =
        {
          'video/mp4': 'mp4',
          'image/gif': 'gif',
          'image/png': 'png',
          'image/jpeg': 'jpg',
        }[blob.type] ?? 'bin';
      download.download = `0xdmme-${item.id}.${extension}`;
      download.textContent = 'Baixar mídia';
      target.append(download);
    }
  }
  return cleanup;
}
export async function publicAvatarBlob(input: {
  kind: PublicAvatarKind;
  target: string;
  reference: string;
  signal: AbortSignal;
}): Promise<Blob> {
  const reference = publicAvatar(input.reference, input.kind, input.target);
  if (!reference) throw new Error('Foto pública indisponível.');
  return withPublicRead(input.signal, async () => {
    const response = await fetch(reference, {
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.any([input.signal, AbortSignal.timeout(8000)]),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error('Foto pública indisponível.');
    }
    return boundedBlob(response, publicAvatarLimit);
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
  },
): () => void {
  if (input.signal.aborted) return () => undefined;
  const image = document.createElement('img'),
    status = document.createElement('span');
  image.className = 'public-avatar-preview';
  image.alt = 'Foto pública aprovada';
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
    })
    .catch(() => {
      if (!stopped && !input.signal.aborted)
        status.textContent = 'Foto indisponível.';
    });
  return stop;
}
