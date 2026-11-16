import { withDraftVault } from '../vault-authority/index.ts';
import type { VaultAccess, VaultLocator } from '../vault-authority/index.ts';
import { base64, encode } from '../../shared/account/index.ts';
import { readReopen, writeReopen } from '../reopen-cache/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import type { PrivateFile } from '../../shared/attachments/index.ts';
import { localDelete } from '../message-storage/index.ts';
export interface PreviewIdentity {
  scope: string;
  message: string;
  file: PrivateFile;
  maximum?: number;
  context?: unknown;
}
export const previewByteLimit = 64 * 1024;
function location(input: PreviewIdentity) {
  return {
    scope: input.scope,
    name: `preview:${input.message}`,
    family: 'preview:' as const,
    binding: [input.file, input.context ?? null],
    ...(input.maximum === undefined ? {} : { maximum: input.maximum }),
  };
}
/** Callers must authorize the exact row before reading and again before
 * presentation. Only vault-encrypted JPEG derivatives enter persistent storage. */
export async function readMediaPreview(
  authority: VaultAuthority,
  input: PreviewIdentity,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const value = await readReopen<{ bytes: string }>(authority, location(input));
  if (!value) return null;
  try {
    return Uint8Array.from(base64(value.bytes, previewByteLimit));
  } catch {
    return null;
  }
}
export async function saveMediaPreview(
  authority: VaultAuthority,
  input: PreviewIdentity,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<void> {
  if (!bytes.length || bytes.length > previewByteLimit) return;
  await writeReopen(authority, location(input), { bytes: encode(bytes) });
}
export function forgetMediaPreview(
  scope: string,
  message: string,
): Promise<void> {
  return localDelete(scope, `preview:${message}`);
}
/** Generate only from a source already decoded for the visible ordinary row. */
export async function captureMediaPreview(
  source: CanvasImageSource,
  size: { width: number; height: number },
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer> | null> {
  signal?.throwIfAborted();
  if (!size.width || !size.height) return null;
  const scale = Math.min(1, 320 / Math.max(size.width, size.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(size.width * scale));
  canvas.height = Math.max(1, Math.round(size.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  try {
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await encodePreview(canvas, signal);
    return blob && blob.size <= previewByteLimit
      ? new Uint8Array(await blob.arrayBuffer())
      : null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
export interface MediaPreviews {
  read: () => Promise<Uint8Array<ArrayBuffer> | null>;
  save: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>;
}

function encodePreview(
  canvas: HTMLCanvasElement,
  signal?: AbortSignal,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(null), 4000);
    const cancel = () => finish(null);
    function finish(blob: Blob | null): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      resolve(blob);
    }
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) {
      finish(null);
      return;
    }
    try {
      canvas.toBlob(finish, 'image/jpeg', 0.7);
    } catch {
      finish(null);
    }
  });
}

/** Read and save an optional accelerator for a row the caller has already
 * verified. Only ciphertext enters the existing bounded preview cache. */
export function localMediaPreview(input: {
  access: VaultAccess;
  session: VaultLocator;
  identity: PreviewIdentity;
  signal: AbortSignal;
}): MediaPreviews {
  const { access, session, identity, signal } = input;
  return {
    read: async () => {
      signal.throwIfAborted();
      try {
        return await withDraftVault(access, session, (authority) => {
          signal.throwIfAborted();
          return readMediaPreview(authority, identity);
        });
      } catch (error: unknown) {
        if (signal.aborted) throw error;
        // The accelerator can be absent, evicted or inaccessible.
        return null;
      }
    },
    save: async (bytes) => {
      signal.throwIfAborted();
      try {
        await withDraftVault(access, session, (authority) => {
          signal.throwIfAborted();
          return saveMediaPreview(authority, identity, bytes);
        });
      } catch (error: unknown) {
        if (signal.aborted) throw error;
        // An optional cache write cannot invalidate a verified picture.
      }
    },
  };
}

/** Decode a local image into a separate small JPEG without modifying the
 * selected original. The browser never receives a remote URL here. */
export async function imageFilePicture(
  file: Blob,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof document === 'undefined') return null;
  const url = URL.createObjectURL(file);
  const image = document.createElement('img');
  const timeout = AbortSignal.timeout(8_000);
  const lifetime = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const events = new AbortController();
  try {
    lifetime.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      lifetime.addEventListener(
        'abort',
        () => reject(new DOMException('Preview unavailable.', 'AbortError')),
        {
          once: true,
          signal: events.signal,
        },
      );
      image.addEventListener('load', () => resolve(), {
        once: true,
        signal: events.signal,
      });
      image.addEventListener(
        'error',
        () => reject(new Error('Preview unavailable.')),
        { once: true, signal: events.signal },
      );
      image.src = url;
    });
    return await captureMediaPreview(
      image,
      { width: image.naturalWidth, height: image.naturalHeight },
      lifetime,
    );
  } catch {
    return null;
  } finally {
    events.abort();
    image.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}
