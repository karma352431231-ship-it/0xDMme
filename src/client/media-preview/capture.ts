export const previewByteLimit = 64 * 1024;

/** Encode a small derivative from a decoded local image or video frame. */
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
