import { AccountError, base64, keys, object } from '../account/index.ts';
import { imageShape, metadataFree } from '../image-inspection/index.ts';

export const publicAvatarLimit = 3_000_000;
export interface PendingPublicAvatar {
  type: 'image/png' | 'image/jpeg';
  bytes: Uint8Array<ArrayBuffer>;
}

/** A prepared candidate, never permission to expose an image publicly. */
export function pendingPublicAvatar(
  value: unknown,
): PendingPublicAvatar | null {
  if (value === null) return null;
  const data = object(value);
  keys(data, ['type', 'bytes']);
  const type = data['type'];
  if (type !== 'image/png' && type !== 'image/jpeg')
    throw new AccountError(400, 'Prepare uma foto PNG ou JPEG.');
  const bytes = base64(data['bytes'], publicAvatarLimit);
  try {
    const shape = imageShape(bytes);
    if (
      shape.type !== type ||
      Math.max(shape.width, shape.height) > 2048 ||
      !metadataFree(bytes, type)
    )
      throw new Error('Foto não preparada.');
  } catch {
    throw new AccountError(
      400,
      'Foto inválida ou com metadados. Prepare novamente.',
    );
  }
  return { type, bytes };
}
