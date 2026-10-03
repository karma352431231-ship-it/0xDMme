import {
  AccountError,
  boundedText,
  keys,
  object,
  uuid,
} from '../account/index.ts';
import { fingerprint } from '../devices/index.ts';
import { integer } from '../vault/index.ts';
export const fileLimit = 3_000_000;
export const thumbnailLimit = 96_000;
export const partLimit = 262_144;
export interface AttachmentRef {
  id: string;
  hash: string;
  bytes: number;
  parts: { hash: string; bytes: number }[];
}
export interface PrivateFile {
  ref: AttachmentRef;
  // SDK's complete media encryption info, transported only inside Megolm.
  encryption: string;
}
export interface AttachmentContent {
  version: 1;
  name: string;
  type: string;
  caption: string;
  image: boolean;
  file: PrivateFile;
  thumbnail: PrivateFile | null;
}
export function attachmentRef(
  input: unknown,
  maximum = fileLimit,
): AttachmentRef {
  const row = object(input);
  keys(row, ['id', 'hash', 'bytes', 'parts']);
  const bytes = integer(row['bytes'], maximum);
  if (
    !bytes ||
    !Array.isArray(row['parts']) ||
    row['parts'].length !== Math.ceil(bytes / partLimit)
  )
    throw new AccountError(400, 'Partes de anexo inválidas.');
  const parts = row['parts'].map((raw, index) => {
    const part = object(raw);
    keys(part, ['hash', 'bytes']);
    const length = integer(part['bytes'], partLimit);
    if (length !== Math.min(partLimit, bytes - index * partLimit))
      throw new AccountError(400, 'Tamanho de parte divergente.');
    return { hash: fingerprint(part['hash']), bytes: length };
  });
  return { id: uuid(row['id']), hash: fingerprint(row['hash']), bytes, parts };
}
export function attachmentRefs(input: unknown): AttachmentRef[] {
  if (!Array.isArray(input) || !input.length || input.length > 2)
    throw new AccountError(400, 'Referências de anexo inválidas.');
  const refs = input.map((row, index) =>
    attachmentRef(row, index ? thumbnailLimit : fileLimit),
  );
  if (new Set(refs.map((r) => r.id)).size !== refs.length)
    throw new AccountError(400, 'Referência repetida.');
  return refs;
}
function privateFile(input: unknown, maximum: number): PrivateFile {
  const row = object(input);
  keys(row, ['ref', 'encryption']);
  const encryption = boundedText(row['encryption'], 2048);
  // Actual key/IV/hash validation and decryption are delegated to the maintained SDK.
  object(JSON.parse(encryption) as unknown);
  return { ref: attachmentRef(row['ref'], maximum), encryption };
}
export function attachmentContent(input: unknown): AttachmentContent {
  const row = object(input);
  keys(row, [
    'version',
    'name',
    'type',
    'caption',
    'image',
    'file',
    'thumbnail',
  ]);
  if (row['version'] !== 1 || typeof row['image'] !== 'boolean')
    throw new Error('Conteúdo de anexo inválido.');
  const file = privateFile(row['file'], fileLimit),
    thumbnail =
      row['thumbnail'] === null
        ? null
        : privateFile(row['thumbnail'], thumbnailLimit);
  if ((!row['image'] && thumbnail) || thumbnail?.ref.id === file.ref.id)
    throw new Error('Miniatura inválida.');
  const type = boundedText(row['type'], 100);
  if (row['image'] && !['image/png', 'image/jpeg', 'image/webp'].includes(type))
    throw new Error('Formato de imagem não permitido.');
  return {
    version: 1,
    name: safeFilename(boundedText(row['name'], 160)),
    type,
    caption: caption(row['caption']),
    image: row['image'],
    file,
    thumbnail,
  };
}
export function contentRefs(content: AttachmentContent): AttachmentRef[] {
  return [
    content.file.ref,
    ...(content.thumbnail ? [content.thumbnail.ref] : []),
  ];
}
export function safeFilename(value: string): string {
  return (
    value
      .replace(/[\p{Cc}\p{Cf}/\\:]/gu, '_')
      .replace(/^\.+/u, '_')
      .slice(0, 160) || 'arquivo'
  );
}

function caption(value: unknown): string {
  return value === '' ? '' : boundedText(value, 4000);
}
