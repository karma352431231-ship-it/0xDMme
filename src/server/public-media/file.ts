import type { FileHandle } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { createHash } from 'node:crypto';
import type { MediaRange } from './range.ts';

const chunkBytes = 65_536;
export interface VerifiedMediaFile {
  length: number;
  hash: string;
  check: () => Promise<void>;
  read: (range: MediaRange, signal: AbortSignal) => AsyncIterable<Uint8Array>;
  close: () => Promise<void>;
}

function requireSame(before: BigIntStats, after: BigIntStats): void {
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeNs !== after.mtimeNs ||
    before.ctimeNs !== after.ctimeNs
  )
    throw new Error('Objeto alterado durante a leitura.');
}

async function verify(
  file: FileHandle,
  input: { stat: BigIntStats; hash: string; signal: AbortSignal },
): Promise<void> {
  const buffer = Buffer.alloc(chunkBytes),
    hash = createHash('sha256');
  const length = Number(input.stat.size);
  let offset = 0;
  while (offset < length) {
    input.signal.throwIfAborted();
    const { bytesRead } = await file.read(
      buffer,
      0,
      Math.min(buffer.length, length - offset),
      offset,
    );
    if (!bytesRead) throw new Error('Objeto incompleto.');
    hash.update(buffer.subarray(0, bytesRead));
    offset += bytesRead;
  }
  requireSame(input.stat, await file.stat({ bigint: true }));
  if (hash.digest('hex') !== input.hash)
    throw new Error('Integridade do objeto inválida.');
}

async function* slices(
  file: FileHandle,
  stat: BigIntStats,
  range: MediaRange,
  signal: AbortSignal,
): AsyncIterable<Uint8Array> {
  const buffer = Buffer.alloc(chunkBytes);
  let offset = range.start;
  while (offset <= range.end) {
    signal.throwIfAborted();
    const { bytesRead } = await file.read(
      buffer,
      0,
      Math.min(buffer.length, range.end - offset + 1),
      offset,
    );
    if (!bytesRead) throw new Error('Objeto incompleto.');
    requireSame(stat, await file.stat({ bigint: true }));
    offset += bytesRead;
    // The next filesystem read must not overwrite a chunk held by backpressure.
    yield Buffer.from(buffer.subarray(0, bytesRead));
  }
}

/** Verify the whole immutable file before sending any range, then retain its descriptor. */
export async function verifiedMediaFile(
  file: FileHandle,
  input: { bytes: number; hash: string; signal: AbortSignal },
): Promise<VerifiedMediaFile> {
  try {
    const stat = await file.stat({ bigint: true });
    if (stat.size !== BigInt(input.bytes))
      throw new Error('Objeto de mídia irregular.');
    await verify(file, { stat, hash: input.hash, signal: input.signal });
    input.signal.throwIfAborted();
    return {
      length: Number(stat.size),
      hash: input.hash,
      check: async () => requireSame(stat, await file.stat({ bigint: true })),
      read: (range, signal) => slices(file, stat, range, signal),
      close: () => file.close(),
    };
  } catch (error: unknown) {
    await file.close();
    throw error;
  }
}
