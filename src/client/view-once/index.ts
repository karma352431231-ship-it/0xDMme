import { base64, encode, object } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import { bytesHash } from '../../shared/vault/index.ts';
import { encodeDailyText } from '../../shared/daily/index.ts';
import type { DailyText } from '../../shared/daily/index.ts';
import {
  viewOnceChunkBytes,
  viewOnceCipherBytes,
  viewOnceContent,
  viewOnceHeader,
  viewOnceHeaderBody,
} from '../../shared/view-once/index.ts';
import type {
  ViewOnceContent,
  ViewOnceHeader,
  ViewOnceScope,
} from '../../shared/view-once/index.ts';
import type { RecoveryKey } from '../../shared/messages/index.ts';
import {
  archiveRoomKey,
  openRecoveryKey,
  openRoomKey,
} from '../message-recovery/index.ts';
import { originalImageType } from '../attachment-images/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { openLocal, sealLocal } from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';

export interface PreparedViewOnce {
  header: ViewOnceHeader;
  bytes: Uint8Array<ArrayBuffer>;
}
export type ViewOnceApi = (
  operation: string,
  data: Record<string, unknown>,
) => Promise<unknown>;
export type ViewOnceMetadata = NonNullable<DailyText['viewOnce']>;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function makeViewOnceContents(
  text: string,
  file: AttachmentSelection | null,
  maximum: number,
): ViewOnceContent[] {
  if (file && file.bytes.length > maximum)
    throw new Error('File exceeds this conversation’s limit.');
  const content = viewOnceContent({
    text,
    ...(file
      ? {
          file: {
            name: file.name,
            mime:
              originalImageType(file.bytes) ??
              (file.type || 'application/octet-stream'),
            data: encode(file.bytes),
          },
        }
      : {}),
  });
  if (policy(content) === 'file' && text.trim())
    return [viewOnceContent({ text }), { ...content, text: '' }];
  return [content];
}

function policy(content: ViewOnceContent): ViewOnceHeader['policy'] {
  if (!content.file) return 'mobile';
  const bytes = base64(content.file.data, 10_000_000);
  return content.file.mime.startsWith('image/') || originalImageType(bytes)
    ? 'mobile'
    : 'file';
}
function associatedData(
  header: Pick<
    ViewOnceHeader,
    'id' | 'scope' | 'policy' | 'sender' | 'recipient'
  >,
): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    canonical([
      '0xdmme-view-once-content',
      1,
      header.id,
      header.scope,
      header.policy,
      header.sender,
      header.recipient,
    ]),
  );
}

/** Raw content is kept only in the sender's encrypted outbox until publication. */
export async function sealViewOnceDraft(
  authority: VaultAuthority,
  content: ViewOnceContent,
): Promise<LocalCipher[]> {
  const bytes = encoder.encode(JSON.stringify(viewOnceContent(content)));
  if (bytes.length + 16 > viewOnceCipherBytes)
    throw new Error('View-once content exceeds the limit.');
  const result: LocalCipher[] = [];
  try {
    for (let offset = 0; offset < bytes.length; offset += 64 * 1024)
      result.push(
        await sealLocal(
          authority,
          crypto.randomUUID(),
          encode(bytes.subarray(offset, offset + 64 * 1024)),
        ),
      );
    return result;
  } finally {
    bytes.fill(0);
  }
}

export async function openViewOnceDraft(
  authority: VaultAuthority,
  chunks: readonly LocalCipher[],
): Promise<ViewOnceContent> {
  const parts = [];
  let length = 0;
  for (const chunk of chunks) {
    const bytes = base64(await openLocal(authority, chunk), 64 * 1024);
    length += bytes.length;
    if (length + 16 > viewOnceCipherBytes)
      throw new Error('View-once draft exceeds the limit.');
    parts.push(bytes);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  try {
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    return viewOnceContent(JSON.parse(decoder.decode(bytes)) as unknown);
  } finally {
    bytes.fill(0);
    for (const part of parts) part.fill(0);
  }
}

export async function prepareViewOnce(input: {
  id: string;
  scope: ViewOnceScope;
  sender: string;
  recipient: RecoveryKey;
  content: ViewOnceContent;
}): Promise<PreparedViewOnce> {
  const content = viewOnceContent(input.content);
  const identity = {
    id: input.id,
    scope: input.scope,
    policy: policy(content),
    sender: input.sender,
    recipient: input.recipient.accountId,
  };
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = encoder.encode(JSON.stringify(content));
  try {
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, [
      'encrypt',
    ]);
    const bytes = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: associatedData(identity),
        },
        key,
        plain,
      ),
    );
    if (bytes.length > viewOnceCipherBytes)
      throw new Error('View-once content exceeds the limit.');
    return {
      header: viewOnceHeader({
        version: 1,
        ...identity,
        bytes: bytes.length,
        hash: await bytesHash(bytes),
        iv: encode(iv),
        key: await archiveRoomKey(input.recipient, encode(rawKey)),
      }),
      bytes,
    };
  } finally {
    rawKey.fill(0);
    plain.fill(0);
  }
}

export async function viewOnceDescriptor(
  prepared: PreparedViewOnce,
  content: ViewOnceContent,
): Promise<{ reference: { hash: string }; text: string }> {
  const metadata: ViewOnceMetadata = {
    hash: await digest(viewOnceHeaderBody(prepared.header)),
    policy: prepared.header.policy,
    ...(content.file && prepared.header.policy === 'mobile'
      ? {
          file: {
            name: content.file.name,
            mime: content.file.mime,
            bytes: base64(content.file.data, 10_000_000).length,
          },
        }
      : {}),
  };
  return {
    reference: { hash: metadata.hash },
    text: encodeDailyText({
      text: '',
      reply: null,
      forwarded: false,
      viewOnce: metadata,
    }),
  };
}

export async function uploadViewOnce(
  prepared: PreparedViewOnce,
  api: ViewOnceApi,
): Promise<void> {
  const header = viewOnceHeader(prepared.header);
  if (
    prepared.bytes.length !== header.bytes ||
    (await bytesHash(prepared.bytes)) !== header.hash
  )
    throw new Error('View-once ciphertext differs from its header.');
  const common = { scope: header.scope, peer: header.recipient };
  const state = object(await api('view-once-create', { ...common, header }));
  let offset = state['offset'];
  if (
    !Number.isSafeInteger(offset) ||
    typeof offset !== 'number' ||
    offset < 0 ||
    offset > header.bytes
  )
    throw new Error('Invalid view-once upload offset.');
  const hash = await digest(viewOnceHeaderBody(header));
  while (offset < header.bytes) {
    const bytes = prepared.bytes.subarray(offset, offset + viewOnceChunkBytes);
    const next = object(
      await api('view-once-part', {
        ...common,
        id: header.id,
        hash,
        offset,
        bytes: encode(bytes),
      }),
    );
    if (next['offset'] !== offset + bytes.length)
      throw new Error('View-once upload offset differs.');
    offset += bytes.length;
  }
}

function assertDeliveryContent(
  content: ViewOnceContent,
  input: ViewOnceDelivery,
): void {
  if (policy(content) !== input.metadata.policy)
    throw new Error('View-once display policy differs.');
  if (input.metadata.policy === 'file' && content.text !== '')
    throw new Error('Download-only files cannot contain a message preview.');
  assertFileMetadata(content.file, input.metadata.file);
}
function assertFileMetadata(
  contentFile: ViewOnceContent['file'],
  file: ViewOnceMetadata['file'],
): void {
  if (
    (file && !contentFile) ||
    (file &&
      contentFile &&
      (file.name !== contentFile.name ||
        file.mime !== contentFile.mime ||
        file.bytes !== base64(contentFile.data, 10_000_000).length))
  )
    throw new Error('View-once file metadata differs.');
}

async function assertDeliveryHeader(
  header: ViewOnceHeader,
  input: ViewOnceDelivery,
): Promise<void> {
  if (
    header.id !== input.id ||
    header.scope !== input.scope ||
    header.sender !== input.peer ||
    header.recipient !== input.authority.session.accountId ||
    header.key.keyId !== input.recovery.id ||
    header.policy !== input.metadata.policy ||
    (await digest(viewOnceHeaderBody(header))) !== input.metadata.hash
  )
    throw new Error(
      'View-once delivery differs from its authenticated message.',
    );
}

/** Called only after the server atomically grants this single delivery. */
type ViewOnceDelivery = {
  authority: VaultAuthority;
  recovery: RecoveryKey;
  id: string;
  scope: ViewOnceScope;
  peer: string;
  metadata: ViewOnceMetadata;
  response: unknown;
};

export async function decryptViewOnce(
  input: ViewOnceDelivery,
): Promise<ViewOnceContent> {
  const raw = object(input.response);
  const header = viewOnceHeader(raw['header']);
  await assertDeliveryHeader(header, input);
  const ciphertext = base64(raw['bytes'], viewOnceCipherBytes);
  if (
    ciphertext.length !== header.bytes ||
    (await bytesHash(ciphertext)) !== header.hash
  )
    throw new Error('View-once ciphertext differs.');
  const secret = await openRecoveryKey(input.recovery, input.authority);
  let rawKey: Uint8Array<ArrayBuffer> | undefined;
  let plain: Uint8Array<ArrayBuffer> | undefined;
  try {
    rawKey = Uint8Array.from(base64(openRoomKey(secret, header.key), 32));
    if (rawKey.length !== 32) throw new Error('Invalid view-once content key.');
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, [
      'decrypt',
    ]);
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: base64(header.iv, 12),
          additionalData: associatedData(header),
        },
        key,
        ciphertext,
      ),
    );
    const content = viewOnceContent(
      JSON.parse(decoder.decode(plain)) as unknown,
    );
    assertDeliveryContent(content, input);
    return content;
  } finally {
    secret.free();
    ciphertext.fill(0);
    rawKey?.fill(0);
    plain?.fill(0);
  }
}
