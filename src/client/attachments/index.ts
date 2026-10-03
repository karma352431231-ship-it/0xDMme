import { base64, encode, object } from '../../shared/account/index.ts';
import {
  attachmentContent,
  contentRefs,
  fileLimit,
  partLimit,
  thumbnailLimit,
} from '../../shared/attachments/index.ts';
import type {
  AttachmentContent,
  PrivateFile,
  AttachmentRef,
} from '../../shared/attachments/index.ts';
import { bytesHash } from '../../shared/vault/index.ts';
import {
  localDelete,
  localGet,
  localPage,
  localPut,
} from '../message-storage/index.ts';
import { attachmentWork } from './worker-client.ts';
import type { SealedFile } from '../attachment-crypto/index.ts';
import type { PreparedPhoto } from '../attachment-images/index.ts';
export interface AttachmentSelection {
  name: string;
  type: string;
  image: boolean;
  bytes: Uint8Array<ArrayBuffer>;
  thumbnail: Uint8Array<ArrayBuffer> | null;
}
export type AttachmentApi = (
  operation: string,
  data: Record<string, unknown>,
) => Promise<unknown>;
export async function prepareAttachment(
  file: File,
  photo: boolean,
): Promise<AttachmentSelection> {
  if (photo) {
    const prepared = await attachmentWork<PreparedPhoto>({
      operation: 'photo',
      file,
    });
    return { ...prepared, image: true };
  }
  if (!file.size || file.size > fileLimit)
    throw new Error('Arquivo original deve ter até 3 MB.');
  const result = await attachmentWork<{ bytes: Uint8Array<ArrayBuffer> }>({
    operation: 'original',
    file,
  });
  return {
    ...result,
    name: file.name.slice(0, 160),
    type: file.type || 'application/octet-stream',
    image: false,
    thumbnail: null,
  };
}
function name(message: string, id: string, index: number): string {
  return `attachment:${message}:${id}:${index}`;
}
export async function stageAttachment(input: {
  account: string;
  id: string;
  selection: AttachmentSelection;
  caption: string;
}): Promise<AttachmentContent> {
  const main = await attachmentWork<SealedFile>({
    operation: 'seal',
    bytes: input.selection.bytes,
    maximum: fileLimit,
  });
  await saveParts(input.account, input.id, main);
  let thumbnail: SealedFile | null = null;
  if (input.selection.thumbnail) {
    thumbnail = await attachmentWork<SealedFile>({
      operation: 'seal',
      bytes: input.selection.thumbnail,
      maximum: thumbnailLimit,
    });
    await saveParts(input.account, input.id, thumbnail);
  }
  return attachmentContent({
    version: 1,
    name: input.selection.name,
    type: input.selection.type,
    caption: input.caption,
    image: input.selection.image,
    file: main.file,
    thumbnail: thumbnail?.file ?? null,
  });
}
async function saveParts(
  account: string,
  message: string,
  sealed: SealedFile,
): Promise<void> {
  for (let index = 0; index < sealed.file.ref.parts.length; index++) {
    const bytes = sealed.bytes.slice(
      index * partLimit,
      (index + 1) * partLimit,
    );
    await localPut(
      account,
      name(message, sealed.file.ref.id, index),
      bytes,
      bytes.length + 128,
    );
  }
}
export async function forgetAttachment(
  account: string,
  message: string,
): Promise<void> {
  let after: string | null = null;
  for (let page = 0; page < 2; page++) {
    const rows: { items: { name: string }[]; next: string | null } =
      await localPage(account, `attachment:${message}:`, after);
    for (const row of rows.items) await localDelete(account, row.name);
    after = rows.next;
    if (after === null) break;
  }
  await localDelete(account, `attachment-cache:${message}`);
}
export async function uploadAttachments(input: {
  account: string;
  message: string;
  peer: string;
  content: AttachmentContent;
  api: AttachmentApi;
}): Promise<void> {
  const refs = contentRefs(input.content),
    raw = await input.api('attachment-reserve', {
      message: input.message,
      peer: input.peer,
      refs,
    });
  if (!Array.isArray(raw) || raw.length !== refs.length)
    throw new Error('Reservas de anexos divergentes.');
  for (const ref of refs) {
    const row = object(raw.find((r) => object(r)['id'] === ref.id));
    if (typeof row['ready'] !== 'boolean' || !Array.isArray(row['received']))
      throw new Error('Estado de transferência inválido.');
    if (row['ready']) continue;
    await uploadParts({ ...input, ref, received: row['received'] });
    const result = object(await input.api('attachment-finish', { id: ref.id }));
    if (result['status'] !== 'ready')
      throw new Error('Preservação do anexo não confirmada.');
  }
}
async function uploadParts(input: {
  account: string;
  message: string;
  ref: AttachmentRef;
  received: unknown[];
  api: AttachmentApi;
}): Promise<void> {
  for (let index = 0; index < input.ref.parts.length; index++) {
    if (input.received.includes(index)) continue;
    const bytes = await storedPart(
      input.account,
      name(input.message, input.ref.id, index),
      input.ref.parts[index]!,
    );
    if (!bytes)
      throw new Error(
        'Parte local ausente ou corrompida; o envio não foi confirmado.',
      );
    const result = object(
      await input.api('attachment-part', {
        id: input.ref.id,
        index,
        ciphertext: encode(bytes),
      }),
    );
    if (result['status'] !== 'stored')
      throw new Error('Gravação de parte não confirmada.');
    window.dispatchEvent(
      new CustomEvent('0xdmme-attachment-progress', {
        detail: { done: index + 1, total: input.ref.parts.length },
      }),
    );
  }
}
async function storedPart(
  account: string,
  key: string,
  part: { bytes: number; hash: string },
): Promise<Uint8Array<ArrayBuffer> | null> {
  const cached = await localGet<Uint8Array<ArrayBuffer>>(account, key);
  if (!cached) return null;
  if (cached.length === part.bytes && (await bytesHash(cached)) === part.hash)
    return cached;
  await localDelete(account, key);
  return null;
}
interface DownloadInput {
  account: string;
  message: string;
  file: PrivateFile;
  thumbnail: boolean;
  image: boolean;
  api: AttachmentApi | null;
  snapshot: unknown;
  guard: () => void;
}
async function fetchPart(
  input: DownloadInput,
  index: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = name(input.message, input.file.ref.id, index),
    part = input.file.ref.parts[index];
  if (!part) throw new Error('Referência incompleta.');
  const cached = await storedPart(input.account, key, part);
  if (cached) return cached;
  if (!input.api)
    throw new Error(
      'Anexo ainda não foi baixado neste aparelho. Conecte e toque para baixar.',
    );
  const raw = object(
    await input.api('attachment-get', {
      message: input.message,
      id: input.file.ref.id,
      index,
      snapshot: input.snapshot,
    }),
  );
  const bytes = Uint8Array.from(base64(raw['ciphertext'], partLimit));
  if (bytes.length !== part.bytes || (await bytesHash(bytes)) !== part.hash)
    throw new Error('Parte recebida adulterada.');
  input.guard();
  await localPut(input.account, key, bytes, bytes.length + 128);
  return bytes;
}
export async function downloadAttachment(
  input: DownloadInput,
): Promise<Uint8Array<ArrayBuffer>> {
  input.guard();
  await retainAttachment(input.account, input.message);
  const bytes = await downloadSealedAttachment(input);
  const result = await openStoredAttachment(
    input.file,
    bytes,
    input.thumbnail,
    input.image,
  );
  input.guard();
  return result;
}
export async function downloadSealedAttachment(
  input: DownloadInput,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = new Uint8Array(input.file.ref.bytes);
  for (let index = 0; index < input.file.ref.parts.length; index++) {
    input.guard();
    bytes.set(await fetchPart(input, index), index * partLimit);
  }
  input.guard();
  return bytes;
}
export async function openStoredAttachment(
  file: PrivateFile,
  bytes: Uint8Array<ArrayBuffer>,
  thumbnail: boolean,
  image: boolean,
): Promise<Uint8Array<ArrayBuffer>> {
  const result = await attachmentWork<{ bytes: Uint8Array<ArrayBuffer> }>({
    operation: 'open',
    file,
    bytes,
    maximum: thumbnail ? thumbnailLimit : fileLimit,
    image,
  });
  return result.bytes;
}
/** Cache eviction only removes downloaded ciphertext, never queued drafts or remote objects. */
export async function retainAttachment(
  account: string,
  message: string,
): Promise<void> {
  await localPut(
    account,
    `attachment-cache:${message}`,
    { id: message, time: Date.now() },
    128,
  );
  const page = await localPage<{ id: string; time: number }>(
    account,
    'attachment-cache:',
    null,
  );
  if (page.items.length <= 16 && page.next === null) return;
  for (const row of page.items.sort((a, b) => a.value.time - b.value.time)) {
    if (
      row.value.id === message ||
      (await localGet(account, `outbox:${row.value.id}`))
    )
      continue;
    await forgetAttachment(account, row.value.id);
    return;
  }
  throw new Error(
    'Cache ocupado por envios pendentes. Conclua ou cancele antes de baixar outros anexos.',
  );
}
