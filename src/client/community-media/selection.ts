// SPDX-License-Identifier: GPL-3.0-only
import { communityMediaLimits } from '../../shared/community-media/index.ts';
import type { CommunityMediaKind } from '../../shared/community-media/index.ts';
import {
  postMediaLimits,
  postMediaSet,
} from '../../shared/post-media/index.ts';

/** Which picked files a post or reply accepts, before anything is sent. */
export function selectedMediaKind(file: File): CommunityMediaKind {
  if (file.type === 'image/gif' || /\.gif$/iu.test(file.name)) return 'gif';
  if (file.type.startsWith('video/') || /\.(mp4|mov|webm)$/iu.test(file.name))
    return 'video';
  return 'photo';
}
/**
 * Adds newly picked files to a draft without refusing the whole pick (owner,
 * 25/11/2026: a video among photos emptied the selection). The draft keeps
 * one kind: the kind already chosen, otherwise photos when any were picked,
 * otherwise the first file's kind. Files of another kind and files past that
 * kind's limit are left out, and `left` says why.
 */
export function fitMediaSelection(
  chosen: readonly File[],
  picked: readonly File[],
): { files: File[]; left: 'mixed' | 'limit' | null } {
  const all = [...chosen, ...picked];
  if (!all.length) return { files: [], left: null };
  const kinds = all.map(selectedMediaKind);
  const kind = chosen.length
    ? kinds[0]!
    : kinds.includes('photo')
      ? 'photo'
      : kinds[0]!;
  const same = all.filter((_, index) => kinds[index] === kind);
  const files = same.slice(0, postMediaLimits[kind]);
  const left =
    same.length < all.length
      ? 'mixed'
      : files.length < same.length
        ? 'limit'
        : null;
  return { files, left };
}
export function validateMediaSelection(files: File[]): void {
  postMediaSet(
    files.map((file) => ({
      id: '',
      hash: '',
      bytes: file.size,
      kind: selectedMediaKind(file),
    })),
  );
  for (const file of files) {
    const kind = selectedMediaKind(file),
      limit = kind === 'photo' ? 20_000_000 : communityMediaLimits[kind].source;
    if (!file.size || file.size > limit)
      throw new Error(`File exceeds ${limit / 1_000_000} MB.`);
  }
}
