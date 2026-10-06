import {
  fileLimit,
  safeFilename,
  thumbnailLimit,
} from '../../shared/attachments/index.ts';
import {
  imageShape,
  metadataFree,
  safePngChunks,
} from '../../shared/image-inspection/index.ts';
export {
  imageShape,
  metadataFree,
} from '../../shared/image-inspection/index.ts';
export type { ImageShape } from '../../shared/image-inspection/index.ts';
const decoder = new TextDecoder();
const text = (b: Uint8Array, from: number, count: number) =>
  decoder.decode(b.subarray(from, from + count));
function view(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}
function startsBytes(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  return prefix.every((value, index) => bytes[offset + index] === value);
}
function videoSignature(bytes: Uint8Array): boolean {
  const head = text(bytes, 0, 16);
  return (
    (head.slice(4, 8) === 'ftyp' &&
      ![
        'heic',
        'heix',
        'hevc',
        'hevx',
        'mif1',
        'msf1',
        'avif',
        'avis',
        'M4A ',
      ].includes(head.slice(8, 12))) ||
    head.startsWith('FLV') ||
    (head.startsWith('RIFF') && head.slice(8, 12) === 'AVI ') ||
    startsBytes(bytes, [26, 69, 223, 163])
  );
}
/** Canvas encoders may generate EXIF/ICC/text chunks. Remove ancillary metadata
 * from the newly encoded image, then verify the output's allowlist. Originals never use this path. */
export function stripEncodedMetadata(
  bytes: Uint8Array<ArrayBuffer>,
  type: string,
): Uint8Array<ArrayBuffer> {
  const pieces = type === 'image/png' ? cleanPng(bytes) : cleanJpeg(bytes);
  const output = new Uint8Array(
    pieces.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of pieces) {
    output.set(part, offset);
    offset += part.length;
  }
  if (!metadataFree(output, type))
    throw new Error('Não foi possível confirmar a remoção de metadados.');
  return output;
}
function cleanPng(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>[] {
  const pieces = [bytes.subarray(0, 8)],
    v = view(bytes);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const size = v.getUint32(offset),
      type = text(bytes, offset + 4, 4);
    if (size > bytes.length - offset - 12)
      throw new Error('PNG gerado incompleto.');
    if (safePngChunks.includes(type))
      pieces.push(bytes.subarray(offset, offset + size + 12));
    offset += size + 12;
    if (type === 'IEND') return pieces;
  }
  throw new Error('PNG gerado incompleto.');
}
function cleanJpeg(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>[] {
  const pieces = [bytes.subarray(0, 2)],
    v = view(bytes);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 255) throw new Error('JPEG gerado inválido.');
    const marker = v.getUint8(offset + 1),
      size = v.getUint16(offset + 2);
    if (marker === 218) {
      pieces.push(bytes.subarray(offset));
      return pieces;
    }
    if (size < 2 || size > bytes.length - offset - 2)
      throw new Error('JPEG gerado incompleto.');
    if (!(marker === 254 || (marker >= 225 && marker <= 239)))
      pieces.push(bytes.subarray(offset, offset + size + 2));
    offset += size + 2;
  }
  throw new Error('JPEG gerado incompleto.');
}
export function assertFileAllowed(
  name: string,
  type: string,
  bytes: Uint8Array,
): void {
  if (!bytes.length || bytes.length > fileLimit)
    throw new Error('Arquivo deve ter até 3 MB.');
  if (
    type.startsWith('video/') ||
    /\.(?:mp4|mov|m4v|webm|mkv|avi|mpeg|mpg|ogv|flv)$/iu.test(name) ||
    videoSignature(bytes)
  )
    throw new Error('Upload de vídeo ainda não está disponível.');
}
export interface PreparedPhoto {
  bytes: Uint8Array<ArrayBuffer>;
  thumbnail: Uint8Array<ArrayBuffer>;
  type: string;
  name: string;
}
function dimensions(
  width: number,
  height: number,
  maximum: number,
): { width: number; height: number } {
  const scale = Math.min(1, maximum / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
async function encodeCanvas(
  bitmap: ImageBitmap,
  input: { edge: number; type: string; quality: number },
): Promise<Uint8Array<ArrayBuffer>> {
  const size = dimensions(bitmap.width, bitmap.height, input.edge),
    canvas = new OffscreenCanvas(size.width, size.height),
    context = canvas.getContext('2d');
  if (!context) throw new Error('Processamento local de imagem indisponível.');
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  const blob = await canvas.convertToBlob({
    type: input.type,
    quality: input.quality,
  });
  if (blob.type !== input.type)
    throw new Error('Encoder de imagem não compatível.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return stripEncodedMetadata(bytes, input.type);
}
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.size || file.size > 20_000_000)
    throw new Error(
      'Foto de origem deve ter até 20 MB para processamento local.',
    );
  const source = new Uint8Array(await file.arrayBuffer()),
    shape = imageShape(source);
  const bitmap = await createImageBitmap(
    new Blob([source], { type: shape.type }),
    { imageOrientation: 'from-image' },
  );
  try {
    const type = shape.type === 'image/png' ? 'image/png' : 'image/jpeg';
    let bytes = await encodeCanvas(bitmap, { edge: 2048, type, quality: 0.85 });
    for (const edge of [1536, 1024, 768]) {
      if (bytes.length <= fileLimit) break;
      bytes = await encodeCanvas(bitmap, { edge, type, quality: 0.75 });
    }
    if (bytes.length > fileLimit)
      throw new Error('Não foi possível otimizar a foto para 3 MB.');
    let thumbnail = await encodeCanvas(bitmap, {
      edge: 240,
      type: 'image/png',
      quality: 1,
    });
    if (thumbnail.length > thumbnailLimit)
      thumbnail = await encodeCanvas(bitmap, {
        edge: 144,
        type: 'image/png',
        quality: 1,
      });
    if (thumbnail.length > thumbnailLimit)
      throw new Error('Miniatura excede o limite seguro.');
    const stem = safeFilename(file.name)
      .replace(/\.[^.]+$/u, '')
      .slice(0, 150);
    return {
      bytes,
      thumbnail,
      type,
      name: `${stem}.${type === 'image/png' ? 'png' : 'jpg'}`,
    };
  } finally {
    bitmap.close();
    source.fill(0);
  }
}
