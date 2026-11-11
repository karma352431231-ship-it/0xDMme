import type {
  CryptoReporter,
  CryptoStage,
} from '../../shared/chat-sync-diagnostics/crypto.ts';
import {
  Attachment,
  EncryptedAttachment,
  initAsync,
} from '@matrix-org/matrix-sdk-crypto-wasm';
import {
  attachmentRef,
  chatFileLimit,
  fileLimit,
  fileLimitMessage,
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
    throw new Error(fileLimitMessage(maximum));
  await initAsync('/matrix-crypto-18.9.0.wasm');
  const sealed = Attachment.encrypt(bytes);
  try {
    const ciphertext = Uint8Array.from(sealed.encryptedData),
      encryption = sealed.mediaEncryptionInfo;
    if (!encryption) throw new Error('Cryptographic information missing.');
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
  maximum = chatFileLimit,
  report?: CryptoReporter,
): Promise<Uint8Array<ArrayBuffer>> {
  const ref = attachmentRef(file.ref, maximum);
  await cryptoStep(
    'decrypt-integrity',
    async () => {
      if (bytes.length !== ref.bytes || (await bytesHash(bytes)) !== ref.hash)
        throw new Error('Attachment incomplete or tampered with.');
    },
    report,
  );
  await cryptoStep(
    'decrypt-runtime',
    () => initAsync('/matrix-crypto-18.9.0.wasm'),
    report,
  );
  const sealed = new EncryptedAttachment(bytes, file.encryption);
  try {
    return await cryptoStep(
      'decrypt-sdk',
      () => Uint8Array.from(Attachment.decrypt(sealed)),
      report,
    );
  } finally {
    sealed.free();
  }
}

async function cryptoStep<T>(
  stage: CryptoStage,
  work: () => T | Promise<T>,
  report?: CryptoReporter,
): Promise<T> {
  const started = report ? performance.now() : 0;
  try {
    return await work();
  } finally {
    report?.(stage, Math.round(performance.now() - started));
  }
}
