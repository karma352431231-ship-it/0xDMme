// SPDX-License-Identifier: GPL-3.0-only
import { AccountError, encode, object } from '../../shared/account/index.ts';
import { bytesHash, integer } from '../../shared/vault/index.ts';
import {
  communityMediaPartBytes,
  communityMediaState,
} from '../../shared/community-media/index.ts';
import type {
  CommunityMediaKind,
  CommunityMediaSource,
  CommunityMediaState,
} from '../../shared/community-media/index.ts';
import {
  communityMediaBatchOperation,
  communityMediaBatchParts,
  communityMediaBatchPolicyOperation,
} from '../../shared/community-media/transfer.ts';
import { ApiResponseError } from '../api-response/index.ts';
import { prepareAttachment } from '../attachments/index.ts';
import { selectedMediaKind } from './selection.ts';

/** Upload steps of one community media file, shared by the media editor and
 * its chosen uploads. Each request retries a busy server for 3 minutes. */
export interface CommunityMediaAccess {
  community: string;
  request: (
    operation: string,
    payload: Record<string, unknown>,
  ) => Promise<unknown>;
  valid: () => boolean;
  signal: AbortSignal;
}
export async function pause(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    function abort() {
      clearTimeout(timer);
      reject(new Error('Send interrupted.'));
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}
export async function request(
  access: CommunityMediaAccess,
  operation: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const deadline = Date.now() + 180_000;
  while (true) {
    if (!access.valid()) throw new Error('Session or community changed.');
    access.signal.throwIfAborted();
    try {
      return await access.request(operation, { id: access.community, ...data });
    } catch (error: unknown) {
      if (
        !(error instanceof AccountError) ||
        error.status !== 429 ||
        Date.now() > deadline
      )
        throw error;
      await pause(5_000, access.signal);
    }
  }
}
export interface PreparedSource {
  blob: Blob;
  kind: CommunityMediaKind;
  hash: string;
}
export async function preparedSource(file: File): Promise<PreparedSource> {
  const kind = selectedMediaKind(file);
  const blob =
    kind === 'photo'
      ? new Blob([(await prepareAttachment(file, true)).bytes])
      : file;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = await bytesHash(bytes);
  bytes.fill(0);
  return { blob, kind, hash };
}

interface UploadParts {
  access: CommunityMediaAccess;
  source: CommunityMediaSource;
  blob: Blob;
  count: number;
  progress: (fraction: number | null) => void;
}

async function sendParts(
  upload: UploadParts,
  state: CommunityMediaState,
  size: number,
): Promise<CommunityMediaState> {
  const { access, blob, source, count } = upload;
  const start = state.received;
  const end = Math.min(start + size, count);
  upload.progress(start / count);
  const parts: string[] = [];
  for (let index = start; index < end; index++) {
    const part = blob.slice(
      index * communityMediaPartBytes,
      (index + 1) * communityMediaPartBytes,
    );
    parts.push(encode(new Uint8Array(await part.arrayBuffer())));
  }
  const position = { media: source.id, index: start };
  const updated = communityMediaState(
    parts.length === 1
      ? await request(access, 'media-part', { ...position, bytes: parts[0] })
      : await request(access, communityMediaBatchOperation, {
          ...position,
          parts,
        }),
  );
  if (updated.status === 'uploading' && updated.received < end)
    throw new Error('Upload incomplete.');
  return updated;
}

async function batchSize(
  upload: UploadParts,
  state: CommunityMediaState,
  elapsed: number,
): Promise<number> {
  // Use a confirmed single part as a conservative estimate against the
  // existing five-second request-body deadline, leaving room for variation.
  const estimated = Math.min(
    communityMediaBatchParts,
    Math.floor(3000 / elapsed),
  );
  if (
    estimated < 2 ||
    state.status !== 'uploading' ||
    upload.count - state.received < 2
  )
    return 1;
  try {
    const policy = object(
      await request(upload.access, communityMediaBatchPolicyOperation, {
        media: upload.source.id,
      }),
    );
    return Math.max(
      1,
      Math.min(estimated, integer(policy['parts'], communityMediaBatchParts)),
    );
  } catch (error: unknown) {
    // A cached client may be talking to the previous release after rollback.
    if (
      error instanceof ApiResponseError &&
      error.status === 404 &&
      error.reason === 'Media operation unavailable.'
    )
      return 1;
    throw error;
  }
}

function interruptedBatch(error: unknown): boolean {
  if (!(error instanceof ApiResponseError)) return false;
  return (
    error.failure === 'network' ||
    error.failure === 'timeout' ||
    error.status === 408 ||
    error.status === 413 ||
    error.status === 504
  );
}

async function reserve(upload: UploadParts): Promise<CommunityMediaState> {
  return communityMediaState(
    await request(upload.access, 'media-reserve', { source: upload.source }),
  );
}

async function transferParts(
  upload: UploadParts,
): Promise<CommunityMediaState> {
  let state = await reserve(upload);
  let size = 1;
  if (
    state.source.kind === 'video' &&
    state.status === 'uploading' &&
    upload.count - state.received > 2
  ) {
    const start = performance.now();
    state = await sendParts(upload, state, 1);
    size = await batchSize(upload, state, performance.now() - start);
  }
  while (state.status === 'uploading' && state.received < upload.count) {
    const inRequest = Math.min(size, upload.count - state.received);
    try {
      state = await sendParts(upload, state, inRequest);
    } catch (error: unknown) {
      if (inRequest === 1 || !interruptedBatch(error)) throw error;
      // A lost response can leave a durable prefix. Reconcile it once and
      // continue at the existing request size for the rest of this attempt.
      size = 1;
      state = await reserve(upload);
    }
  }
  return state;
}

export async function upload(
  access: CommunityMediaAccess,
  source: CommunityMediaSource,
  blob: Blob,
  onProgress: (fraction: number | null) => void,
): Promise<string> {
  let state = await transferParts({
    access,
    source,
    blob,
    count: Math.ceil(source.bytes / communityMediaPartBytes),
    progress: onProgress,
  });
  if (state.status === 'uploading')
    state = communityMediaState(
      await request(access, 'media-finish', { media: source.id }),
    );
  const deadline = Date.now() + 390_000;
  // A picture is usually ready within a second: check soon, then every
  // second (owner, 27/11/2026).
  let wait = 250;
  while (state.status === 'processing') {
    onProgress(null);
    if (Date.now() > deadline)
      throw new Error('Preparation still in progress. Try again to resume.');
    await pause(wait, access.signal);
    wait = Math.min(wait * 2, 1000);
    state = communityMediaState(
      await request(access, 'media-status', { media: source.id }),
    );
  }
  if (state.status !== 'ready')
    throw new Error(
      state.error ?? 'Media is not ready yet. Resume the upload.',
    );
  return source.id;
}
