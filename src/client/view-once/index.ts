import {
  measureSend,
  measureSendSync,
  traceSend,
  timedLoad,
  timedLoadSync,
} from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import { base64, encode, object } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import { bytesHash } from '../../shared/vault/index.ts';
import { encodeDailyText } from '../../shared/daily/index.ts';
import type { DailyText } from '../../shared/daily/index.ts';
import {
  viewOnceChunkBytes,
  viewOnceCipherBytes,
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
import {
  validateViewOnce,
  selectionContents,
  draftChunks,
  openDraft,
  serializeViewOnce,
} from '../view-once-preparation/index.ts';
import type { ValidatedViewOnce } from '../view-once-preparation/index.ts';
import { attachmentPreparationWork as attachmentWork } from '../attachments/index.ts';
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

const validated = new WeakMap<object, ValidatedViewOnce>();
type Preparation = { id?: string; signal?: AbortSignal | undefined };
function remember(prepared: ValidatedViewOnce, id?: string): ViewOnceContent {
  if (prepared.content.file) Object.freeze(prepared.content.file);
  Object.freeze(prepared.content);
  validated.set(prepared.content, prepared);
  traceSend('content-validate', id, {
    sendPhase: 'end',
    sendMs: prepared.validationMs,
    sendSuccess: true,
  });
  traceSend('policy-detect', id, {
    sendPhase: 'end',
    sendMs: prepared.policyMs,
    sendSuccess: true,
  });
  return prepared.content;
}
function pureWork<T>(
  input: unknown,
  local: () => T,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  return typeof window === 'undefined'
    ? Promise.resolve().then(local)
    : attachmentWork<T>(input, signal);
}
async function prepareContent(
  content: ViewOnceContent,
  work: Preparation = {},
): Promise<ValidatedViewOnce> {
  work.signal?.throwIfAborted();
  const cached = validated.get(content);
  if (cached) return cached;
  const result = await pureWork(
    { operation: 'view-once-validate', content },
    () => validateViewOnce(content),
    work.signal,
  );
  remember(result, work.id);
  return result;
}
export async function prepareViewOnceContents(
  text: string,
  file: AttachmentSelection | null,
  maximum: number,
  work: Preparation = {},
): Promise<ViewOnceContent[]> {
  const input = {
    text,
    maximum,
    file: file ? { name: file.name, type: file.type, bytes: file.bytes } : null,
  };
  const result = await measureSend(
    'content-encode',
    () =>
      pureWork(
        { operation: 'view-once-selection', ...input },
        () => selectionContents(input),
        work.signal,
      ),
    work.id,
  );
  return result.map((prepared) => remember(prepared, work.id));
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
  work: Preparation = {},
): Promise<LocalCipher[]> {
  const prepared = await prepareContent(content, work);
  const chunks = await pureWork(
    { operation: 'view-once-seal-draft', prepared },
    () => draftChunks(prepared),
    work.signal,
  );
  const result: LocalCipher[] = [];
  try {
    for (let index = 0; index < chunks.length; index++) {
      work.signal?.throwIfAborted();
      result.push(
        await sealLocal(authority, crypto.randomUUID(), chunks[index]!),
      );
      chunks[index] = '';
    }
    return result;
  } finally {
    chunks.fill('');
  }
}

export async function openViewOnceDraft(
  authority: VaultAuthority,
  chunks: readonly LocalCipher[],
  work: Preparation = {},
): Promise<ViewOnceContent> {
  // Each sealed block still contains exactly the old canonical base64 string.
  const parts: string[] = [];
  try {
    for (const chunk of chunks) {
      work.signal?.throwIfAborted();
      if (parts.length >= Math.ceil(viewOnceCipherBytes / (64 * 1024)))
        throw new Error('View-once draft exceeds the limit.');
      parts.push(await openLocal(authority, chunk));
    }
    const result = await pureWork(
      { operation: 'view-once-open-draft', chunks: parts },
      () => openDraft(parts),
      work.signal,
    );
    return remember(result, work.id);
  } finally {
    parts.fill('');
  }
}

export async function prepareViewOnce(input: {
  id: string;
  scope: ViewOnceScope;
  sender: string;
  recipient: RecoveryKey;
  content: ViewOnceContent;
}): Promise<PreparedViewOnce> {
  const prepared = await prepareContent(input.content, { id: input.id });
  const identity = {
    id: input.id,
    scope: input.scope,
    policy: prepared.policy,
    sender: input.sender,
    recipient: input.recipient.accountId,
  };
  const serialized = await measureSend(
    'payload-serialize',
    () =>
      pureWork({ operation: 'view-once-serialize', prepared }, () => ({
        bytes: serializeViewOnce(prepared),
      })),
    input.id,
  );
  const plain = serialized.bytes;
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, [
      'encrypt',
    ]);
    const bytes = new Uint8Array(
      await measureSend(
        'payload-encrypt',
        () =>
          crypto.subtle.encrypt(
            {
              name: 'AES-GCM',
              iv,
              additionalData: associatedData(identity),
            },
            key,
            plain,
          ),
        input.id,
      ),
    );
    if (bytes.length > viewOnceCipherBytes)
      throw new Error('View-once content exceeds the limit.');
    return {
      header: viewOnceHeader({
        version: 1,
        ...identity,
        bytes: bytes.length,
        hash: await measureSend(
          'ciphertext-hash',
          () => bytesHash(bytes),
          input.id,
        ),
        iv: encode(iv),
        key: await measureSend(
          'recovery-wrap',
          () => archiveRoomKey(input.recipient, encode(rawKey)),
          input.id,
        ),
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
  const validatedContent = await prepareContent(content, {
    id: prepared.header.id,
  });
  const metadata: ViewOnceMetadata = {
    hash: await digest(viewOnceHeaderBody(prepared.header)),
    policy: prepared.header.policy,
    ...(content.file && prepared.header.policy === 'mobile'
      ? {
          file: {
            name: content.file.name,
            mime: content.file.mime,
            bytes: measureSendSync(
              'descriptor-bytes',
              () => validatedContent.fileBytes,
              prepared.header.id,
            ),
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
    if (typeof window !== 'undefined')
      window.dispatchEvent(
        new CustomEvent('0xdmme-attachment-progress', {
          detail: {
            id: header.id,
            message: header.id,
            done: offset,
            total: header.bytes,
          },
        }),
      );
  }
}

function assertDeliveryContent(
  prepared: ValidatedViewOnce,
  input: ViewOnceDelivery,
): void {
  // Older clients sent video under the authenticated download-only policy.
  const { content, policy, legacyPolicy, fileBytes } = prepared;
  if (
    (input.metadata.policy === 'file' ? legacyPolicy : policy) !==
    input.metadata.policy
  )
    throw new Error('View-once display policy differs.');
  if (input.metadata.policy === 'file' && content.text !== '')
    throw new Error('Download-only files cannot contain a message preview.');
  assertFileMetadata(content.file, input.metadata.file, fileBytes);
}
function assertFileMetadata(
  contentFile: ViewOnceContent['file'],
  file: ViewOnceMetadata['file'],
  bytes: number,
): void {
  if (
    (file && !contentFile) ||
    (file &&
      contentFile &&
      (file.name !== contentFile.name ||
        file.mime !== contentFile.mime ||
        file.bytes !== bytes))
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
  diagnostic?: LoadTrace | undefined;
};

export async function decryptViewOnce(
  input: ViewOnceDelivery,
): Promise<ViewOnceContent> {
  const trace = input.diagnostic;
  const raw = object(input.response);
  const header = timedLoadSync(trace, 'decrypt-header', () =>
    viewOnceHeader(raw['header']),
  );
  await timedLoad(trace, 'decrypt-header', () =>
    assertDeliveryHeader(header, input),
  );
  const ciphertext = timedLoadSync(trace, 'decrypt-base64', () =>
    base64(raw['bytes'], viewOnceCipherBytes),
  );
  await timedLoad(trace, 'decrypt-integrity', async () => {
    if (
      ciphertext.length !== header.bytes ||
      (await bytesHash(ciphertext)) !== header.hash
    )
      throw new Error('View-once ciphertext differs.');
  });
  const secret = await timedLoad(trace, 'decrypt-key', () =>
    openRecoveryKey(input.recovery, input.authority),
  );
  let rawKey: Uint8Array<ArrayBuffer> | undefined;
  let plain: Uint8Array<ArrayBuffer> | undefined;
  try {
    rawKey = timedLoadSync(trace, 'decrypt-key', () =>
      Uint8Array.from(base64(openRoomKey(secret, header.key), 32)),
    );
    if (rawKey.length !== 32) throw new Error('Invalid view-once content key.');
    const rawContentKey = rawKey;
    const key = await timedLoad(trace, 'decrypt-key', () =>
      crypto.subtle.importKey('raw', rawContentKey, 'AES-GCM', false, [
        'decrypt',
      ]),
    );
    const iv = timedLoadSync(trace, 'decrypt-base64', () =>
      base64(header.iv, 12),
    );
    const context = timedLoadSync(trace, 'decrypt-header', () =>
      associatedData(header),
    );
    plain = new Uint8Array(
      await timedLoad(trace, 'decrypt-aes', () =>
        crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv,
            additionalData: context,
          },
          key,
          ciphertext,
        ),
      ),
    );
    const plaintext = plain;
    const text = timedLoadSync(trace, 'decrypt-text', () =>
      decoder.decode(plaintext),
    );
    const parsed: unknown = timedLoadSync(
      trace,
      'decrypt-json',
      () => JSON.parse(text) as unknown,
    );
    const prepared = timedLoadSync(trace, 'decrypt-validate', () => {
      const validated = validateViewOnce(
        parsed,
        trace
          ? (ms) => trace.point('decrypt-base64', { loadStageMs: ms })
          : undefined,
      );
      assertDeliveryContent(validated, input);
      return validated;
    });
    return prepared.content;
  } finally {
    secret.free();
    ciphertext.fill(0);
    rawKey?.fill(0);
    plain?.fill(0);
  }
}
