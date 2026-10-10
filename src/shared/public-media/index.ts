// SPDX-License-Identifier: GPL-3.0-only
import { AccountError, uuid, object, keys } from '../account/index.ts';
import {
  communityMediaResult,
  communityMediaKindsSet,
} from '../community-media/index.ts';
import type { CommunityMediaResult } from '../community-media/index.ts';

export type PublicAvatarKind = 'avatar' | 'profile-banner' | 'community-photo';
export function publicMediaPath(
  kind: PublicAvatarKind | 'post-media',
  target: string,
  review: string,
  thumbnail = false,
): string {
  return `/api/public-media/${kind}/${uuid(target)}/${uuid(review)}${thumbnail ? '/thumbnail' : ''}`;
}
export interface PublicPostMedia {
  id: string;
  review: string;
  result: CommunityMediaResult;
}
export function publicPostMedia(value: unknown): PublicPostMedia[] {
  if (!Array.isArray(value) || value.length > 4)
    throw new AccountError(400, 'Mídia pública inválida.');
  const result = value.map((item: unknown) => {
    const data = object(item);
    keys(data, ['id', 'review', 'result']);
    return {
      id: uuid(data['id']),
      review: uuid(data['review']),
      result: communityMediaResult(data['result']),
    };
  });
  if (new Set(result.map((item) => item.id)).size !== result.length)
    throw new AccountError(400, 'Mídia pública repetida.');
  communityMediaKindsSet(result.map((item) => item.result.kind));
  return result;
}
export function publicPostMediaPath(
  media: PublicPostMedia,
  thumbnail = false,
): string {
  return publicMediaPath('post-media', media.id, media.review, thumbnail);
}
/** These references contain only public target/review IDs and never an account or device ID. */
export function publicAvatarPath(
  kind: PublicAvatarKind,
  target: string,
  review: string,
): string {
  return publicMediaPath(kind, target, review);
}
export function publicAvatar(
  value: unknown,
  kind: PublicAvatarKind,
  target: string,
): string | null {
  if (value === null) return null;
  if (typeof value !== 'string')
    throw new AccountError(400, 'Avatar público inválido.');
  const parts = value.split('/');
  if (
    parts.length !== 6 ||
    parts[1] !== 'api' ||
    parts[2] !== 'public-media' ||
    parts[3] !== kind ||
    parts[4] !== target ||
    value !== publicAvatarPath(kind, target, parts[5] ?? '')
  )
    throw new AccountError(400, 'Referência de avatar inválida.');
  return value;
}
