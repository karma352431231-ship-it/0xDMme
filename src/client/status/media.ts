import { base64, encode, object } from '../../shared/account/index.ts';
import {
  attachmentContent,
  contentRefs,
  partLimit,
  thumbnailLimit,
} from '../../shared/attachments/index.ts';
import type {
  AttachmentContent,
  PrivateFile,
} from '../../shared/attachments/index.ts';
import { bytesHash } from '../../shared/vault/index.ts';
import { sealFile } from '../attachment-crypto/index.ts';
import type { SealedFile } from '../attachment-crypto/index.ts';
import { openStoredAttachment } from '../attachments/index.ts';
import type {
  AttachmentApi,
  AttachmentSelection,
} from '../attachments/index.ts';
export interface StatusPhoto {
  content: AttachmentContent;
  files: SealedFile[];
}
/** Status media is transient; neither the local chat store nor backup sees these bytes or keys. */
export async function sealStatusPhoto(
  selection: AttachmentSelection,
  caption: string,
): Promise<StatusPhoto> {
  if (!selection.image || selection.voice)
    throw new Error('Escolha uma foto para o status.');
  const main = await sealFile(selection.bytes),
    files = [main];
  const thumbnail = selection.thumbnail
    ? await sealFile(selection.thumbnail, thumbnailLimit)
    : null;
  if (thumbnail) files.push(thumbnail);
  return {
    files,
    content: attachmentContent({
      version: 1,
      name: selection.name,
      type: selection.type,
      image: true,
      caption,
      file: main.file,
      thumbnail: thumbnail?.file ?? null,
    }),
  };
}
export async function uploadStatusPhoto(
  id: string,
  photo: StatusPhoto,
  api: AttachmentApi,
): Promise<void> {
  const state = await api('status-attachment-reserve', {
    statusId: id,
    refs: contentRefs(photo.content),
  });
  if (!Array.isArray(state) || state.length !== photo.files.length)
    throw new Error('Reservas de fotos divergentes.');
  for (const file of photo.files) {
    const row = object(state.find((r) => object(r)['id'] === file.file.ref.id));
    if (typeof row['ready'] !== 'boolean' || !Array.isArray(row['received']))
      throw new Error('Estado de upload inválido.');
    if (row['ready']) continue;
    for (let index = 0; index < file.file.ref.parts.length; index++) {
      if (row['received'].includes(index)) continue;
      await api('status-attachment-part', {
        statusId: id,
        id: file.file.ref.id,
        index,
        ciphertext: encode(
          file.bytes.subarray(index * partLimit, (index + 1) * partLimit),
        ),
      });
    }
    const result = object(
      await api('status-attachment-finish', {
        statusId: id,
        id: file.file.ref.id,
      }),
    );
    if (result['status'] !== 'ready')
      throw new Error('Foto ainda não preservada.');
  }
}
export async function downloadStatusPhoto(input: {
  id: string;
  file: PrivateFile;
  thumbnail: boolean;
  api: AttachmentApi;
  guard: () => void;
}): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = new Uint8Array(input.file.ref.bytes);
  try {
    for (let index = 0; index < input.file.ref.parts.length; index++) {
      const raw = object(
        await input.api('status-attachment-get', {
          statusId: input.id,
          id: input.file.ref.id,
          index,
        }),
      );
      const part = input.file.ref.parts[index]!,
        value = base64(raw['ciphertext'], partLimit);
      if (value.length !== part.bytes || (await bytesHash(value)) !== part.hash)
        throw new Error('Foto incompleta ou adulterada.');
      input.guard();
      bytes.set(value, index * partLimit);
    }
    const opened = await openStoredAttachment(
      input.file,
      bytes,
      input.thumbnail,
      true,
    );
    try {
      input.guard();
      return opened;
    } catch (error: unknown) {
      opened.fill(0);
      throw error;
    }
  } finally {
    bytes.fill(0);
  }
}
