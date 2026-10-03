import {
  Attachment,
  EncryptedAttachment,
  initAsync,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import {
  attachmentRef,
  fileLimit,
  partLimit,
} from '../../shared/attachments/index.ts';
import type {
  AttachmentRef,
  PrivateFile,
} from '../../shared/attachments/index.ts';
import { bytesHash } from '../../shared/vault/index.ts';
export interface SealedFile {
  file: PrivateFile;
  bytes: Uint8Array<ArrayBuffer>;
}
export async function sealFile(
  bytes: Uint8Array,
  maximum = fileLimit,
): Promise<SealedFile> {
  if (!bytes.length || bytes.length > maximum)
    throw new Error('Arquivo deve ter até 3 MB.');
  await initAsync('/matrix-crypto-18.9.0.wasm');
  const sealed = Attachment.encrypt(bytes);
  try {
    const ciphertext = Uint8Array.from(sealed.encryptedData),
      encryption = sealed.mediaEncryptionInfo;
    if (!encryption) throw new Error('Informação criptográfica ausente.');
    const parts: AttachmentRef['parts'] = [];
    for (let offset = 0; offset < ciphertext.length; offset += partLimit) {
      const part = ciphertext.subarray(offset, offset + partLimit);
      parts.push({ hash: await bytesHash(part), bytes: part.length });
    }
    return {
      file: {
        ref: {
          id: crypto.randomUUID(),
          hash: await bytesHash(ciphertext),
          bytes: ciphertext.length,
          parts,
        },
        encryption,
      },
      bytes: ciphertext,
    };
  } finally {
    sealed.free();
  }
}
export async function openFile(
  file: PrivateFile,
  bytes: Uint8Array,
  maximum = fileLimit,
): Promise<Uint8Array<ArrayBuffer>> {
  const ref = attachmentRef(file.ref, maximum);
  if (bytes.length !== ref.bytes || (await bytesHash(bytes)) !== ref.hash)
    throw new Error('Anexo incompleto ou adulterado.');
  await initAsync('/matrix-crypto-18.9.0.wasm');
  const sealed = new EncryptedAttachment(bytes, file.encryption);
  try {
    return Uint8Array.from(Attachment.decrypt(sealed));
  } finally {
    sealed.free();
  }
}
