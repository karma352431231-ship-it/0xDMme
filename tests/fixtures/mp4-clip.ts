/**
 * Synthetic MP4 sticker clips for tests: real box layout, no frames.
 */
/** A box: 32-bit size, four-character type, then its body. */
function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const length = 8 + parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  new DataView(out.buffer).setUint32(0, length);
  out.set(
    [...type].map((c) => c.charCodeAt(0)),
    4,
  );
  let at = 8;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
function words(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  values.forEach((value, i) =>
    new DataView(out.buffer).setUint32(i * 4, value),
  );
  return out;
}
const zeros = (n: number) => new Uint8Array(n);
const text = (value: string) =>
  new Uint8Array([...value].map((c) => c.charCodeAt(0)));

/** One version-0 track: tkhd with its 16.16 size, hdlr, one stsd entry. */
export function track(
  handler: string,
  codec: string,
  width = 320,
  height = 240,
) {
  const tkhd = box('tkhd', zeros(76), words(width * 65536, height * 65536));
  const hdlr = box('hdlr', zeros(8), text(handler), zeros(12));
  const stsd = box('stsd', words(0, 1), box(codec, zeros(8)));
  return box('trak', tkhd, box('mdia', hdlr, box('minf', box('stbl', stsd))));
}
/** A clip like KLIPY's: ftyp, moov (mvhd, tracks, udta), free, mdat. */
export function clip(
  input: {
    tracks?: Uint8Array[];
    seconds?: number;
    metadata?: boolean;
  } = {},
): Uint8Array<ArrayBuffer> {
  const mvhd = box('mvhd', zeros(12), words(1000, (input.seconds ?? 2) * 1000));
  const udta = box('udta', box('meta', text('Lavf58.20.100')));
  const moov = box(
    'moov',
    mvhd,
    ...(input.tracks ?? [track('vide', 'avc1')]),
    ...(input.metadata === false ? [] : [udta]),
  );
  const parts = [
    box('ftyp', text('isom'), zeros(4)),
    moov,
    box('free'),
    box('mdat', zeros(32)),
  ];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
