import { AccountError, uuid } from '../account/index.ts';
import type { CommunityMediaKind } from '../community-media/index.ts';

/**
 * How many media items one post or reply holds (owner, 25/11/2026: up to 10
 * photos; GIFs stay at 3 and video at 1, without mixing kinds). Per-file
 * limits stay in shared/community-media. The count rules there (4 photos)
 * are part of the approved moderation pipeline identity, so that file can
 * only change with a reviewed pipeline revision; posts use these rules.
 */
export const postMediaLimits: Readonly<Record<CommunityMediaKind, number>> = {
  photo: 10,
  gif: 3,
  video: 1,
};
export const postMediaMaximum = postMediaLimits.photo;

export function postMediaIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > postMediaMaximum)
    throw new AccountError(400, 'Invalid media quantity.');
  const ids = value.map(uuid);
  if (new Set(ids).size !== ids.length)
    throw new AccountError(400, 'Duplicate media.');
  return ids;
}
export function postMediaKindsSet(kinds: readonly CommunityMediaKind[]): void {
  if (!kinds.length) return;
  const kind = kinds[0]!;
  if (kinds.some((item) => item !== kind))
    throw new AccountError(
      400,
      'Use photos, GIFs or one video, without mixing.',
    );
  if (kinds.length > postMediaLimits[kind])
    throw new AccountError(400, 'Use up to 10 photos, 3 GIFs or 1 video.');
}
export function postMediaSet(
  sources: readonly { kind: CommunityMediaKind }[],
): void {
  postMediaKindsSet(sources.map((source) => source.kind));
}
