// SPDX-License-Identifier: GPL-3.0-only
import { AccountError, keys, object, uuid } from '../account/index.ts';
import { fingerprint } from '../devices/index.ts';
import { integer } from '../vault/index.ts';

export type CommunityMediaKind = 'photo' | 'gif' | 'video';
export const communityMediaPartBytes = 262_144;
export const communityMediaLimits = {
  photo: { count: 4, source: 3_000_000, result: 3_000_000, seconds: 0 },
  gif: { count: 3, source: 10_000_000, result: 10_000_000, seconds: 20 },
  video: { count: 1, source: 100_000_000, result: 100_000_000, seconds: 120 },
} as const;
/** Maximum normalized video frames, including the 0.1 s mux tolerance. */
export const communityMediaVideoFrameBudget =
  communityMediaLimits.video.seconds * 30 + 4;
export interface CommunityMediaSource {
  id: string;
  kind: CommunityMediaKind;
  bytes: number;
  hash: string;
}
export interface CommunityMediaResult {
  kind: CommunityMediaKind;
  type: string;
  bytes: number;
  width: number;
  height: number;
  seconds: number;
  fps: number;
  thumbnailBytes: number;
  normalized: boolean;
}
export interface CommunityMediaState {
  source: CommunityMediaSource;
  received: number;
  status: 'uploading' | 'processing' | 'ready' | 'attached';
  result: CommunityMediaResult | null;
  error: string | null;
}
export function communityMediaKind(value: unknown): CommunityMediaKind {
  if (value !== 'photo' && value !== 'gif' && value !== 'video')
    throw new AccountError(400, 'Invalid media type.');
  return value;
}
export function communityMediaSource(value: unknown): CommunityMediaSource {
  const data = object(value);
  keys(data, ['id', 'kind', 'bytes', 'hash']);
  const kind = communityMediaKind(data['kind']);
  const bytes = integer(data['bytes'], communityMediaLimits[kind].source);
  if (!bytes) throw new AccountError(400, 'Empty file.');
  return { id: uuid(data['id']), kind, bytes, hash: fingerprint(data['hash']) };
}
export function communityMediaIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 4)
    throw new AccountError(400, 'Invalid media quantity.');
  const ids = value.map(uuid);
  if (new Set(ids).size !== ids.length)
    throw new AccountError(400, 'Duplicate media.');
  return ids;
}
export function communityMediaSet(sources: CommunityMediaSource[]): void {
  communityMediaKindsSet(sources.map((source) => source.kind));
}
export function communityMediaKindsSet(kinds: CommunityMediaKind[]): void {
  if (!kinds.length) return;
  const kind = kinds[0]!;
  if (kinds.some((item) => item !== kind))
    throw new AccountError(
      400,
      'Use photos, GIFs or one video, without mixing.',
    );
  if (kinds.length > communityMediaLimits[kind].count)
    throw new AccountError(400, 'Use up to 4 photos, 3 GIFs or 1 video.');
}
export function communityMediaResult(value: unknown): CommunityMediaResult {
  const d = object(value);
  keys(d, [
    'kind',
    'type',
    'bytes',
    'width',
    'height',
    'seconds',
    'fps',
    'thumbnailBytes',
    'normalized',
  ]);
  const kind = communityMediaKind(d['kind']);
  const type =
    kind === 'photo'
      ? String(d['type'])
      : kind === 'gif'
        ? 'image/gif'
        : 'video/mp4';
  if (kind === 'photo' && !['image/png', 'image/jpeg'].includes(type))
    throw new AccountError(400, 'Invalid prepared photo format.');
  const bytes = integer(d['bytes'], communityMediaLimits[kind].result);
  const width = integer(d['width'], 65_535),
    height = integer(d['height'], 65_535);
  const seconds = d['seconds'],
    fps = d['fps'];
  if (invalidResultFields(d, { type, bytes, width, height }))
    throw new AccountError(400, 'Invalid media result.');
  validateTiming({ kind, seconds, fps });
  const thumbnailBytes = integer(d['thumbnailBytes'], 96_000);
  if (!thumbnailBytes) throw new AccountError(400, 'Invalid thumbnail.');
  return {
    kind,
    type,
    bytes,
    width,
    height,
    seconds: Number(seconds),
    fps: Number(fps),
    thumbnailBytes,
    normalized: Boolean(d['normalized']),
  };
}
function invalidResultFields(
  d: Record<string, unknown>,
  expected: { type: string; bytes: number; width: number; height: number },
): boolean {
  return (
    d['type'] !== expected.type ||
    !expected.bytes ||
    !expected.width ||
    !expected.height ||
    typeof d['normalized'] !== 'boolean'
  );
}
function validateTiming(value: {
  kind: CommunityMediaKind;
  seconds: unknown;
  fps: unknown;
}): void {
  validRange(
    value.seconds,
    communityMediaLimits[value.kind].seconds +
      (value.kind === 'video' ? 0.1 : 0),
    'Duração de mídia inválida.',
  );
  validRange(
    value.fps,
    value.kind === 'video' ? 30 : 20,
    'FPS de mídia inválido.',
  );
}
function validRange(value: unknown, maximum: number, error: string): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  )
    throw new AccountError(400, error);
}
export function communityMediaState(value: unknown): CommunityMediaState {
  const d = object(value);
  keys(d, ['source', 'received', 'status', 'result', 'error']);
  const source = communityMediaSource(d['source']);
  const received = integer(
    d['received'],
    Math.ceil(source.bytes / communityMediaPartBytes),
  );
  const status = d['status'];
  if (
    !['uploading', 'processing', 'ready', 'attached'].includes(String(status))
  )
    throw new AccountError(400, 'Invalid media state.');
  if (
    d['error'] !== null &&
    (typeof d['error'] !== 'string' || d['error'].length > 240)
  )
    throw new AccountError(400, 'Invalid media error.');
  const result =
    d['result'] === null ? null : communityMediaResult(d['result']);
  if ((status === 'ready' || status === 'attached') && !result)
    throw new AccountError(400, 'Media incomplete.');
  return {
    source,
    received,
    status: status as CommunityMediaState['status'],
    result,
    error: d['error'],
  };
}
