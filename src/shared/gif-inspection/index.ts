// Independent GIF87a/GIF89a structural reader. The browser remains the LZW
// decoder; this scanner bounds allocation and strips non-rendering metadata.
const pixelBudget = 24_000_000;
const decoder = new TextDecoder();
function fail(): never {
  throw new Error(
    'GIF incompleto, inválido ou acima do orçamento de processamento.',
  );
}
function u16(bytes: Uint8Array, at: number): number {
  if (at + 2 > bytes.length) fail();
  return bytes[at]! | (bytes[at + 1]! << 8);
}
function blocks(bytes: Uint8Array, at: number): number {
  while (at < bytes.length) {
    const size = bytes[at++]!;
    if (!size) return at;
    if (at + size > bytes.length) fail();
    at += size;
  }
  return fail();
}
function table(flags: number): number {
  return flags & 128 ? 3 * (2 << (flags & 7)) : 0;
}
class GifReader {
  private readonly bytes: Uint8Array<ArrayBuffer>;
  private readonly width: number;
  private readonly height: number;
  private readonly pieces: Uint8Array[] = [];
  private at: number;
  private frames = 0;
  constructor(bytes: Uint8Array<ArrayBuffer>) {
    const header = decoder.decode(bytes.subarray(0, 6));
    if (
      !['GIF87a', 'GIF89a'].includes(header) ||
      bytes.length > 3_000_000 ||
      bytes.length < 14
    )
      fail();
    this.bytes = bytes;
    this.width = u16(bytes, 6);
    this.height = u16(bytes, 8);
    if (
      !this.width ||
      !this.height ||
      Math.max(this.width, this.height) > 16384 ||
      this.width * this.height > pixelBudget
    )
      fail();
    this.at = 13 + table(bytes[10]!);
    if (this.at > bytes.length) fail();
    this.pieces.push(bytes.subarray(0, this.at));
  }
  read(): Uint8Array<ArrayBuffer> {
    while (this.at < this.bytes.length) {
      const start = this.at,
        marker = this.bytes[this.at++];
      if (marker === 59) {
        if (this.at !== this.bytes.length || !this.frames) fail();
        this.keep(start);
        return this.join();
      }
      if (marker === 44) {
        this.image(start);
        continue;
      }
      if (marker !== 33) fail();
      this.extension(start);
    }
    return fail();
  }
  private graphic(): void {
    this.frames++;
    if (this.frames * this.width * this.height > pixelBudget) fail();
  }
  private keep(start: number): void {
    this.pieces.push(this.bytes.subarray(start, this.at));
  }
  private image(start: number): void {
    const width = u16(this.bytes, start + 5),
      height = u16(this.bytes, start + 7);
    if (
      !width ||
      !height ||
      u16(this.bytes, start + 1) + width > this.width ||
      u16(this.bytes, start + 3) + height > this.height ||
      start + 10 > this.bytes.length
    )
      fail();
    const at = start + 10 + table(this.bytes[start + 9]!);
    if (at >= this.bytes.length || this.bytes[at]! < 2 || this.bytes[at]! > 8)
      fail();
    this.at = blocks(this.bytes, at + 1);
    this.graphic();
    this.keep(start);
  }
  private extension(start: number): void {
    const label = this.bytes[this.at++];
    this.at = blocks(this.bytes, this.at);
    if (label === 249) {
      this.control(start);
      return;
    }
    if (label === 255) {
      this.application(start);
      return;
    }
    if (label === 1) {
      if (this.bytes[start + 2] !== 12) fail();
      this.graphic();
      this.keep(start);
      return;
    }
    if (label !== 254) fail();
  }
  private control(start: number): void {
    const flags = this.bytes[start + 3] ?? 0;
    if (
      this.bytes[start + 2] !== 4 ||
      this.at - start !== 8 ||
      flags & 224 ||
      ((flags >> 2) & 7) > 3
    )
      fail();
    this.keep(start);
  }
  private application(start: number): void {
    const app = decoder.decode(this.bytes.subarray(start + 3, start + 14));
    if (
      this.bytes[start + 2] === 11 &&
      ['NETSCAPE2.0', 'ANIMEXTS1.0'].includes(app) &&
      this.at - start === 19 &&
      this.bytes[start + 14] === 3 &&
      this.bytes[start + 15] === 1
    )
      this.keep(start);
  }
  private join(): Uint8Array<ArrayBuffer> {
    const result = new Uint8Array(
      this.pieces.reduce((sum, part) => sum + part.length, 0),
    );
    let offset = 0;
    for (const part of this.pieces) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }
}
/** Compressed frames, delays, disposal, transparency and loop count are preserved. */
export function prepareGif(
  bytes: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  return new GifReader(bytes).read();
}
