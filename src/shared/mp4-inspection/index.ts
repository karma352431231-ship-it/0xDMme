/**
 * Short silent MP4 clips as stickers (owner decision 26/11/2026: a GIF from
 * the chat becomes a sticker in its original video format, which is several
 * times smaller than an animated GIF). The same checks run on the device and
 * on the server. Only the ISO BMFF box structure is read; frames are never
 * decoded here.
 *
 * A sticker clip has one H.264 video track, no sound track, no metadata boxes
 * and lasts at most ten seconds. Metadata boxes (`udta`, `meta`) are removed
 * on the device by renaming them to `free` with zeroed content: the file
 * keeps its length, so the chunk offsets that point into `mdat` stay valid.
 */
export interface Mp4Shape {
  width: number;
  height: number;
  seconds: number;
}

interface Box {
  type: string;
  start: number;
  body: number;
  end: number;
}

const maximumBoxes = 4096;
const maximumSeconds = 10;
const topLevel = new Set(['ftyp', 'moov', 'mdat', 'free', 'skip']);
const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts']);
const metadata = new Set(['udta', 'meta']);

function invalid(): never {
  throw new Error('Invalid video sticker.');
}
function uint32(bytes: Uint8Array, at: number): number {
  if (at < 0 || at + 4 > bytes.length) invalid();
  return (
    ((bytes[at]! << 24) >>> 0) +
    (bytes[at + 1]! << 16) +
    (bytes[at + 2]! << 8) +
    bytes[at + 3]!
  );
}
function uint64(bytes: Uint8Array, at: number): number {
  const high = uint32(bytes, at),
    low = uint32(bytes, at + 4);
  // Files are at most a few megabytes; larger sizes are malformed.
  if (high > 0x1f_ffff) invalid();
  return high * 0x1_0000_0000 + low;
}
function fourCc(bytes: Uint8Array, at: number): string {
  if (at + 4 > bytes.length) invalid();
  return String.fromCharCode(...bytes.subarray(at, at + 4));
}

/** The boxes directly inside [start, end), each bounded by its parent. */
function boxes(
  bytes: Uint8Array,
  start: number,
  end: number,
  budget: { left: number },
): Box[] {
  const found: Box[] = [];
  let at = start;
  while (at < end) {
    if (--budget.left < 0 || end - at < 8) invalid();
    let size = uint32(bytes, at),
      body = at + 8;
    const type = fourCc(bytes, at + 4);
    if (size === 1) {
      size = uint64(bytes, at + 8);
      body = at + 16;
    } else if (size === 0) size = end - at;
    if (size < body - at || at + size > end) invalid();
    found.push({ type, start: at, body, end: at + size });
    at += size;
  }
  return found;
}

/** Every box under `parent`, depth first, opening only known containers. */
function nested(bytes: Uint8Array, parent: Box, budget: { left: number }) {
  const all: Box[] = [];
  for (const box of boxes(bytes, parent.body, parent.end, budget)) {
    all.push(box);
    if (containers.has(box.type)) all.push(...nested(bytes, box, budget));
  }
  return all;
}

function only(list: readonly Box[], type: string): Box {
  const matches = list.filter((box) => box.type === type);
  if (matches.length !== 1) invalid();
  return matches[0]!;
}

function seconds(bytes: Uint8Array, mvhd: Box): number {
  const version = bytes[mvhd.body] ?? invalid();
  const scaleAt = mvhd.body + (version === 1 ? 20 : 12);
  const timescale = uint32(bytes, scaleAt);
  const duration =
    version === 1 ? uint64(bytes, scaleAt + 4) : uint32(bytes, scaleAt + 4);
  if (!timescale) invalid();
  return duration / timescale;
}

function trackSize(
  bytes: Uint8Array,
  tkhd: Box,
): { width: number; height: number } {
  const version = bytes[tkhd.body] ?? invalid();
  // Width and height are 16.16 fixed-point after the matrix.
  const at = tkhd.body + (version === 1 ? 88 : 76);
  return {
    width: Math.round(uint32(bytes, at) / 65536),
    height: Math.round(uint32(bytes, at + 4) / 65536),
  };
}

function handler(bytes: Uint8Array, hdlr: Box): string {
  return fourCc(bytes, hdlr.body + 8);
}

function codec(bytes: Uint8Array, stsd: Box): string {
  // Version/flags, entry count, then the first sample entry's box header.
  if (uint32(bytes, stsd.body + 4) !== 1) invalid();
  return fourCc(bytes, stsd.body + 12);
}

/** The movie box of a file holding only known top-level boxes. */
function movie(bytes: Uint8Array, budget: { left: number }): Box[] {
  const top = boxes(bytes, 0, bytes.length, budget);
  if (top[0]?.type !== 'ftyp' || top.some((box) => !topLevel.has(box.type)))
    invalid();
  if (!top.some((box) => box.type === 'mdat')) invalid();
  const inside = nested(bytes, only(top, 'moov'), budget);
  if (inside.some((box) => metadata.has(box.type))) invalid();
  return inside;
}

/** The size of the single H.264 video track; no other track is allowed. */
function videoTrack(
  bytes: Uint8Array,
  inside: readonly Box[],
  budget: { left: number },
): { width: number; height: number } {
  const tracks = inside.filter((box) => box.type === 'trak');
  if (tracks.length !== 1) invalid();
  const track = nested(bytes, tracks[0]!, budget);
  if (handler(bytes, only(track, 'hdlr')) !== 'vide') invalid();
  if (codec(bytes, only(track, 'stsd')) !== 'avc1') invalid();
  return trackSize(bytes, only(track, 'tkhd'));
}

/** Reads a prepared sticker clip; throws when it is not one. */
export function mp4StickerShape(bytes: Uint8Array): Mp4Shape {
  const budget = { left: maximumBoxes };
  const inside = movie(bytes, budget);
  const { width, height } = videoTrack(bytes, inside, budget);
  const length = seconds(bytes, only(inside, 'mvhd'));
  if (!width || !height || !(length > 0) || length > maximumSeconds) invalid();
  return { width, height, seconds: length };
}

/**
 * A copy of the clip without metadata boxes: each `udta` or `meta` under
 * `moov` becomes a zeroed `free` box of the same length. Then checked.
 */
export function prepareMp4Sticker(input: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(input);
  const budget = { left: maximumBoxes };
  const top = boxes(bytes, 0, bytes.length, budget);
  const moov = top.find((box) => box.type === 'moov') ?? invalid();
  const parents = [moov, ...nested(bytes, moov, budget)].filter((box) =>
    containers.has(box.type),
  );
  for (const parent of parents)
    for (const child of boxes(bytes, parent.body, parent.end, budget))
      if (metadata.has(child.type)) {
        bytes.set([0x66, 0x72, 0x65, 0x65], child.start + 4);
        bytes.fill(0, child.body, child.end);
      }
  mp4StickerShape(bytes);
  return bytes;
}
