// SPDX-License-Identifier: GPL-3.0-only
import { AccountError, encode } from '../../shared/account/index.ts';
import { bytesHash } from '../../shared/vault/index.ts';
import {
  communityMediaPartBytes,
  communityMediaState,
} from '../../shared/community-media/index.ts';
import type {
  CommunityMediaKind,
  CommunityMediaSource,
} from '../../shared/community-media/index.ts';
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
export async function upload(
  access: CommunityMediaAccess,
  source: CommunityMediaSource,
  blob: Blob,
  onProgress: (fraction: number | null) => void,
): Promise<string> {
  let state = communityMediaState(
    await request(access, 'media-reserve', { source }),
  );
  const parts = Math.ceil(source.bytes / communityMediaPartBytes);
  for (
    let index = state.received;
    index < parts && state.status === 'uploading';
    index++
  ) {
    onProgress(index / parts);
    const bytes = new Uint8Array(
      await blob
        .slice(
          index * communityMediaPartBytes,
          (index + 1) * communityMediaPartBytes,
        )
        .arrayBuffer(),
    );
    state = communityMediaState(
      await request(access, 'media-part', {
        media: source.id,
        index,
        bytes: encode(bytes),
      }),
    );
  }
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
