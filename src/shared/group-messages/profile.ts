import { base64, keys, object } from '../account/index.ts';
import { imageShape, metadataFree } from '../image-inspection/index.ts';
export const groupPhotoLimit = 16_384;
export const groupPhotoEdge = 192;
export interface GroupPhoto {
  type: 'image/jpeg';
  base64: string;
}
/** Optional addition to the existing encrypted profile payload; legacy titles stay readable. */
export function groupPhoto(input: unknown): GroupPhoto | null {
  if (input === null) return null;
  const data = object(input);
  keys(data, ['type', 'base64']);
  if (data['type'] !== 'image/jpeg') throw new Error('Foto do grupo inválida.');
  const bytes = Uint8Array.from(base64(data['base64'], groupPhotoLimit));
  try {
    const shape = imageShape(bytes, groupPhotoEdge * groupPhotoEdge);
    if (
      shape.type !== 'image/jpeg' ||
      Math.max(shape.width, shape.height) > groupPhotoEdge ||
      !metadataFree(bytes, shape.type)
    )
      throw new Error('Foto do grupo deve ser reduzida e sem metadados.');
    return { type: 'image/jpeg', base64: data['base64'] as string };
  } finally {
    bytes.fill(0);
  }
}
export function groupProfilePhoto(
  input: unknown,
): GroupPhoto | null | undefined {
  const data = object(input);
  return Object.hasOwn(data, 'photo') ? groupPhoto(data['photo']) : undefined;
}
/** Name-only clients must not erase an avatar received by a newer client. */
export function profilePhotoUpdate(
  input: unknown,
  previous: unknown,
): { photo?: GroupPhoto | null } {
  const incoming = groupProfilePhoto(input);
  const photo =
    incoming === undefined && previous !== null
      ? groupProfilePhoto(previous)
      : incoming;
  return photo === undefined ? {} : { photo };
}
