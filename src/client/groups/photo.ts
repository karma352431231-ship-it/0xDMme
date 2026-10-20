import { base64, encode } from '../../shared/account/index.ts';
import {
  groupPhoto,
  groupPhotoEdge,
  groupPhotoLimit,
  groupProfilePhoto,
} from '../../shared/group-messages/index.ts';
import type { GroupPhoto } from '../../shared/group-messages/index.ts';
import {
  imageShape,
  stripEncodedMetadata,
} from '../attachment-images/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { groupProfileHistory } from '../local-history/index.ts';
import { GroupCache } from './cache.ts';

export async function prepareGroupPhoto(file: File): Promise<GroupPhoto> {
  if (!file.size || file.size > 3_000_000)
    throw new Error('Choose a PNG, JPEG or WebP photo no larger than 3 MB.');
  const source = new Uint8Array(await file.arrayBuffer());
  try {
    imageShape(source);
  } finally {
    source.fill(0);
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = new OffscreenCanvas(groupPhotoEdge, groupPhotoEdge),
      context = canvas.getContext('2d');
    if (!context)
      throw new Error('Could not prepare the photo on this device.');
    const edge = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - edge) / 2,
      (bitmap.height - edge) / 2,
      edge,
      edge,
      0,
      0,
      groupPhotoEdge,
      groupPhotoEdge,
    );
    for (const quality of [0.82, 0.65, 0.45]) {
      const photo = await encodeGroupPhoto(canvas, quality);
      if (photo) return photo;
    }
    throw new Error(
      'This photo could not fit the avatar. Choose another image.',
    );
  } finally {
    bitmap.close();
  }
}
export function groupPhotoBlob(photo: GroupPhoto): Blob {
  const bytes = Uint8Array.from(
    base64(groupPhoto(photo)!.base64, groupPhotoLimit),
  );
  try {
    return new Blob([bytes], { type: photo.type });
  } finally {
    bytes.fill(0);
  }
}
export async function cachedGroupPhoto(
  authority: VaultAuthority,
  group: {
    state: { groupId: string };
    localOnly?: boolean;
    profileSequence?: number;
  },
): Promise<GroupPhoto | null> {
  const raw = await new GroupCache(authority, group.state.groupId).get(
    'profile',
  );
  if (raw !== null) return groupProfilePhoto(raw) ?? null;
  if (!group.localOnly || !group.profileSequence) return null;
  const restored = await groupProfileHistory(
    authority,
    group.state.groupId,
    group.profileSequence,
  );
  return restored
    ? (groupProfilePhoto(JSON.parse(restored.text) as unknown) ?? null)
    : null;
}

async function encodeGroupPhoto(
  canvas: OffscreenCanvas,
  quality: number,
): Promise<GroupPhoto | null> {
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  const bytes = stripEncodedMetadata(
    new Uint8Array(await blob.arrayBuffer()),
    'image/jpeg',
  );
  try {
    return bytes.length <= groupPhotoLimit
      ? groupPhoto({ type: 'image/jpeg', base64: encode(bytes) })
      : null;
  } finally {
    bytes.fill(0);
  }
}
