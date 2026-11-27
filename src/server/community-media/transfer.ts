import { createHash } from 'node:crypto';
import {
  AccountError,
  base64,
  keys,
  uuid,
} from '../../shared/account/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { communityMediaPartBytes } from '../../shared/community-media/index.ts';
import type { CommunityMediaState } from '../../shared/community-media/index.ts';
import {
  communityMediaBatchOperation,
  communityMediaBatchParts,
  communityMediaBatchPolicyOperation,
} from '../../shared/community-media/transfer.ts';
import type {
  CommunityMediaStore,
  ContactAuthority,
} from '../database/index.ts';
import type { CommunityMediaFiles } from './files.ts';

type TransferOperation =
  | 'media-part'
  | typeof communityMediaBatchOperation
  | typeof communityMediaBatchPolicyOperation;

export function isMediaTransfer(
  operation: string,
): operation is TransferOperation {
  return (
    operation === 'media-part' ||
    operation === communityMediaBatchOperation ||
    operation === communityMediaBatchPolicyOperation
  );
}

interface Reservation {
  authority: ContactAuthority;
  community: string;
  id: string;
}

function requireVideo(state: CommunityMediaState): void {
  if (state.source.kind !== 'video')
    throw new AccountError(400, 'Batched uploads require a video.');
}

/** Consecutive pieces of a reservation use the same durable write path. */
export class CommunityMediaTransfer {
  private readonly store: CommunityMediaStore;
  private readonly files: CommunityMediaFiles;
  private readonly signal: AbortSignal;

  constructor(options: {
    store: CommunityMediaStore;
    files: CommunityMediaFiles;
    signal: AbortSignal;
  }) {
    this.store = options.store;
    this.files = options.files;
    this.signal = options.signal;
  }

  async run(input: {
    operation: TransferOperation;
    authority: ContactAuthority;
    community: string;
    data: Record<string, unknown>;
  }): Promise<unknown> {
    const { operation, authority, community, data } = input;
    const reservation = { authority, community, id: uuid(data['media']) };
    if (operation === communityMediaBatchPolicyOperation) {
      keys(data, ['id', 'media']);
      requireVideo(await this.status(reservation));
      return { parts: communityMediaBatchParts };
    }
    if (operation === communityMediaBatchOperation)
      return this.batch(reservation, data);
    keys(data, ['id', 'media', 'index', 'bytes']);
    return (
      (await this.write(reservation, {
        index: integer(data['index'], 381),
        bytes: base64(data['bytes'], communityMediaPartBytes),
      })) ?? this.status(reservation)
    );
  }

  private status({ authority, community, id }: Reservation) {
    return this.store.status(authority, community, id);
  }

  private async batch(
    reservation: Reservation,
    data: Record<string, unknown>,
  ): Promise<CommunityMediaState> {
    keys(data, ['id', 'media', 'index', 'parts']);
    const index = integer(data['index'], 381);
    const encoded = data['parts'];
    if (
      !Array.isArray(encoded) ||
      encoded.length < 2 ||
      encoded.length > communityMediaBatchParts ||
      index + encoded.length > 382
    )
      throw new AccountError(400, 'Invalid media part batch.');
    const parts = encoded.map((value) =>
      base64(value, communityMediaPartBytes),
    );
    for (const [offset, bytes] of parts.entries())
      await this.write(reservation, {
        index: index + offset,
        bytes,
        expectedKind: 'video',
      });
    return this.status(reservation);
  }

  private async write(
    { authority, community, id }: Reservation,
    part: { index: number; bytes: Uint8Array; expectedKind?: 'video' },
  ): Promise<CommunityMediaState | undefined> {
    this.signal.throwIfAborted();
    const { index, bytes } = part;
    const hash = createHash('sha256').update(bytes).digest('hex');
    const lease = await this.store.begin(authority, {
      community,
      id,
      index,
      hash,
    });
    try {
      if (part.expectedKind) requireVideo(lease.state);
      if (!lease.writer) return lease.state;
      if (
        bytes.length !==
        Math.min(
          communityMediaPartBytes,
          lease.state.source.bytes - index * communityMediaPartBytes,
        )
      )
        throw new AccountError(400, 'Part size does not match.');
      await this.files.part(id, index, bytes);
      await this.store.part(authority, {
        community,
        id,
        writer: lease.writer,
        hash,
      });
    } catch (error: unknown) {
      if (lease.writer) await this.store.release(id, lease.writer);
      throw error;
    }
  }
}
