import { base64, encode, object } from '../../shared/account/index.ts';
import {
  attachmentContent,
  animatedAttachmentContent,
  chatFileLimit,
  contentRefs,
  fileLimit,
  oversizedFileMessage,
  partLimit,
  thumbnailLimit,
} from '../../shared/attachments/index.ts';
import type {
  AttachmentContent,
  PrivateFile,
  AttachmentRef,
} from '../../shared/attachments/index.ts';
import { bytesHash, vaultQuota } from '../../shared/vault/index.ts';
import {
  localDelete,
  localGet,
  localPage,
  localPutWithin,
} from '../message-storage/index.ts';
import { attachmentWork } from './worker-client.ts';
import type { SealedFile } from '../attachment-crypto/index.ts';
import type { PreparedPhoto } from '../attachment-images/index.ts';
import { validateVoice } from '../../shared/voice/index.ts';
import type { VoiceMetadata } from '../../shared/voice/index.ts';
export interface AttachmentSelection {
  voice?: VoiceMetadata;
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
/** `maximum` is the conversation's product limit: 10 MB in private and group chats, 3 MB elsewhere. */
export async function prepareAttachment(
  file: File,
  photo: boolean,
  maximum = fileLimit,
): Promise<AttachmentSelection> {
  if (photo) {
    const prepared = await attachmentWork<PreparedPhoto>({
      operation: 'photo',
      file,
    });
    return { ...prepared, image: true };
  }
  if (!file.size || file.size > maximum)
    throw new Error(oversizedFileMessage(maximum));
  return attachmentWork<AttachmentSelection>({
    operation: 'original',
    file,
    maximum,
  });
}
function name(message: string, id: string, index: number): string {
  return `attachment:${message}:${id}:${index}`;
}
export async function stageAttachment(input: {
  account: string;
  id: string;
  selection: AttachmentSelection;
  caption: string;
  budget?: number;
  /** Product limit of the conversation; defaults to 3 MB. */
  maximum?: number;
}): Promise<AttachmentContent> {
  if (input.selection.voice)
    validateVoice(input.selection.bytes, input.selection.voice);
  const main = await attachmentWork<SealedFile>({
    operation: 'seal',
    bytes: input.selection.bytes,
    maximum: input.maximum ?? fileLimit,
  });
  await saveParts(input.account, input.id, main, input.budget);
  let thumbnail: SealedFile | null = null;
  if (input.selection.thumbnail) {
    thumbnail = await attachmentWork<SealedFile>({
      operation: 'seal',
      bytes: input.selection.thumbnail,
      maximum: thumbnailLimit,
    });
    await saveParts(input.account, input.id, thumbnail, input.budget);
  }
  const content =
    input.selection.image && input.selection.type === 'image/gif'
      ? animatedAttachmentContent
      : attachmentContent;
  return content({
    version: input.selection.voice ? 2 : 1,
    ...(input.selection.voice ? { voice: input.selection.voice } : {}),
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
  maximum = vaultQuota,
): Promise<void> {
  for (let index = 0; index < sealed.file.ref.parts.length; index++) {
    const bytes = sealed.bytes.slice(
      index * partLimit,
      (index + 1) * partLimit,
    );
    await localPutWithin({
      scope: account,
      name: name(message, sealed.file.ref.id, index),
      value: bytes,
      size: bytes.length + 128,
      maximum,
    });
  }
}
export async function forgetAttachment(
  account: string,
  message: string,
): Promise<void> {
  let after: string | null = null;
  // Every transaction is bounded to 16 records. Repeated group restaging can
  // leave more than the original 24 parts after an interrupted save.
  do {
    const rows: { items: { name: string }[]; next: string | null } =
      await localPage(account, `attachment:${message}:`, after);
    for (const row of rows.items) await localDelete(account, row.name);
    after = rows.next;
  } while (after !== null);
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
    throw new Error('Attachment reservations do not match.');
  for (const ref of refs) {
    const row = object(raw.find((r) => object(r)['id'] === ref.id));
    if (typeof row['ready'] !== 'boolean' || !Array.isArray(row['received']))
      throw new Error('Invalid transfer state.');
    if (row['ready']) continue;
    await uploadParts({ ...input, ref, received: row['received'] });
    const result = object(await input.api('attachment-finish', { id: ref.id }));
    if (result['status'] !== 'ready')
      throw new Error('Attachment preservation not confirmed.');
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
        'Local part missing or corrupted; sending was not confirmed.',
      );
    const result = object(
      await input.api('attachment-part', {
        id: input.ref.id,
        index,
        ciphertext: encode(bytes),
      }),
    );
    if (result['status'] !== 'stored')
      throw new Error('Part storage not confirmed.');
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
  budget?: number;
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
  if (!part) throw new Error('Reference incomplete.');
  const cached = await storedPart(input.account, key, part);
  if (cached) return cached;
  if (!input.api)
    throw new Error(
      'This attachment has not been downloaded on this device. Connect and tap to download.',
    );
  const raw = object(
    await input.api('attachment-get', {
      message: input.message,
      id: input.file.ref.id,
      index,
      ...(input.snapshot === undefined ? {} : { snapshot: input.snapshot }),
    }),
  );
  const bytes = Uint8Array.from(base64(raw['ciphertext'], partLimit));
  if (bytes.length !== part.bytes || (await bytesHash(bytes)) !== part.hash)
    throw new Error('Received part tampered with.');
  input.guard();
  await localPutWithin({
    scope: input.account,
    name: key,
    value: bytes,
    size: bytes.length + 128,
    maximum: input.budget ?? vaultQuota,
  });
  return bytes;
}
export async function downloadAttachment(
  input: DownloadInput,
): Promise<Uint8Array<ArrayBuffer>> {
  input.guard();
  await retainAttachment(input.account, input.message, input.budget);
  const bytes = await downloadSealedAttachment(input);
  const result = await openStoredAttachment(
    input.file,
    bytes,
    input.thumbnail,
    input.image,
  );
  try {
    input.guard();
    return result;
  } catch (error: unknown) {
    result.fill(0);
    throw error;
  }
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
    maximum: thumbnail ? thumbnailLimit : chatFileLimit,
    image,
  });
  return result.bytes;
}
/** Cache eviction only removes downloaded ciphertext, never queued drafts or remote objects. */
export async function retainAttachment(
  account: string,
  message: string,
  maximum = vaultQuota,
): Promise<void> {
  await localPutWithin({
    scope: account,
    name: `attachment-cache:${message}`,
    value: { id: message, time: Date.now() },
    size: 128,
    maximum,
  });
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
    'Cache occupied by pending sends. Complete or cancel them before downloading other attachments.',
  );
}

/** Retrying an unaccepted group upload in a new participation period uses new opaque reservations. */
export async function restageAttachments(input: {
  account: string;
  message: string;
  content: AttachmentContent;
  budget: number;
}): Promise<AttachmentContent> {
  const file = await restageFile(input, input.content.file),
    thumbnail = input.content.thumbnail
      ? await restageFile(input, input.content.thumbnail)
      : null;
  return attachmentContent({ ...input.content, file, thumbnail });
}
async function restageFile(
  input: { account: string; message: string; budget: number },
  file: PrivateFile,
): Promise<PrivateFile> {
  const ref = { ...file.ref, id: crypto.randomUUID() };
  for (let index = 0; index < ref.parts.length; index++) {
    const bytes = await storedPart(
      input.account,
      name(input.message, file.ref.id, index),
      ref.parts[index]!,
    );
    if (!bytes)
      throw new Error('Draft part missing. Resending was not confirmed.');
    await localPutWithin({
      scope: input.account,
      name: name(input.message, ref.id, index),
      value: bytes,
      size: bytes.length + 128,
      maximum: input.budget,
    });
  }
  return { ...file, ref };
}
