import { AccountError } from '../account/index.ts';
import { animatedAttachmentContent } from '../attachments/index.ts';
import type { AttachmentContent } from '../attachments/index.ts';
import { imageShape, metadataFree } from '../image-inspection/index.ts';
import { prepareGif } from '../gif-inspection/index.ts';
import { validateVoice } from '../voice/index.ts';
export type SocialMedia = 'photo' | 'gif' | 'voice';
export function socialMedia(value: unknown): SocialMedia {
  if (value !== 'photo' && value !== 'gif' && value !== 'voice')
    throw new AccountError(400, 'Use foto, GIF ou voz nesta DM.');
  return value;
}
export function socialAttachment(
  input: unknown,
  declared: SocialMedia,
): AttachmentContent {
  const content = animatedAttachmentContent(input);
  if (declared === 'voice') {
    if (!content.voice) throw new Error('Voz sem descritor autenticado.');
    return content;
  }
  if (!content.image || content.voice)
    throw new Error('Imagem de DM inválida.');
  if (
    declared === 'gif' &&
    (content.type !== 'image/gif' || content.thumbnail !== null)
  )
    throw new Error('GIF de DM inválido.');
  if (
    declared === 'photo' &&
    !['image/png', 'image/jpeg', 'image/webp'].includes(content.type)
  )
    throw new Error('Foto de DM inválida.');
  return content;
}
export function checkSocialBytes(
  content: AttachmentContent,
  declared: SocialMedia,
  bytes: Uint8Array<ArrayBuffer>,
): void {
  if (bytes.length !== content.file.ref.bytes)
    throw new Error('Tamanho de mídia divergente.');
  if (declared === 'voice') {
    if (!content.voice) throw new Error('Voz inválida.');
    validateVoice(bytes, content.voice);
    return;
  }
  if (declared === 'gif') {
    const clean = prepareGif(bytes);
    if (clean.length !== bytes.length)
      throw new Error('GIF recebido conserva metadados.');
    return;
  }
  if (
    imageShape(bytes).type !== content.type ||
    !metadataFree(bytes, content.type)
  )
    throw new Error('Foto recebida inválida ou com metadados.');
}
