import { encode, base64, object } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import {
  groupViewOnceManifest,
  groupViewOnceHash,
} from '../../shared/group-view-once/index.ts';
import type { GroupViewOnceManifest } from '../../shared/group-view-once/index.ts';
import { roomKeyArchive } from '../../shared/messages/index.ts';
import type {
  RecoveryKey,
  RoomKeyArchive,
} from '../../shared/messages/index.ts';
import type { ViewOnceContent } from '../../shared/view-once/index.ts';
import { viewOnceChunkBytes } from '../../shared/view-once/index.ts';
import {
  prepareViewOnceEnvelope,
  describeViewOnce,
} from '../view-once/index.ts';
import type { ViewOnceApi } from '../view-once/index.ts';

export interface GroupOncePayload {
  manifest: GroupViewOnceManifest;
  keys: RoomKeyArchive[];
  bytes: string;
  text: string;
}
export async function prepareGroupViewOnce(input: {
  id: string;
  group: { groupId: string; epoch: number; head: string };
  sender: string;
  recipients: RecoveryKey[];
  content: ViewOnceContent;
}): Promise<GroupOncePayload> {
  const prepared = await prepareViewOnceEnvelope({
    id: input.id,
    scope: 'group',
    sender: input.sender,
    recipient: input.group.groupId,
    recipients: input.recipients,
    content: input.content,
  });
  try {
    const manifest = groupViewOnceManifest({
      version: 1,
      ...prepared.identity,
      epoch: input.group.epoch,
      head: input.group.head,
      media: !!input.content.file,
      bytes: prepared.bytes.length,
      hash: prepared.hash,
      iv: prepared.iv,
      recipients: await Promise.all(
        prepared.keys.map(async (key) => ({
          accountId: key.accountId,
          keyId: key.keyId,
          hash: await digest(canonical(key)),
        })),
      ),
    });
    const { text } = await describeViewOnce(
      {
        id: input.id,
        policy: manifest.policy,
        hash: await groupViewOnceHash(manifest),
      },
      input.content,
    );
    return {
      manifest,
      keys: prepared.keys,
      bytes: encode(prepared.bytes),
      text,
    };
  } finally {
    prepared.bytes.fill(0);
  }
}
export function groupOncePayload(input: unknown): GroupOncePayload {
  const d = object(input);
  if (
    !Array.isArray(d['keys']) ||
    typeof d['bytes'] !== 'string' ||
    typeof d['text'] !== 'string'
  )
    throw new Error('Invalid group view-once draft.');
  return {
    manifest: groupViewOnceManifest(d['manifest']),
    keys: d['keys'].map(roomKeyArchive),
    bytes: d['bytes'],
    text: d['text'],
  };
}
export async function uploadGroupViewOnce(
  payload: GroupOncePayload,
  api: ViewOnceApi,
): Promise<void> {
  const { manifest, keys } = payload,
    common = { scope: 'group', peer: manifest.recipient },
    hash = await groupViewOnceHash(manifest);
  const state = object(
      await api('view-once-create', { ...common, manifest, keys }),
    ),
    bytes = base64(payload.bytes, 14000000);
  let offset = state['offset'];
  try {
    if (
      typeof offset !== 'number' ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > bytes.length
    )
      throw new Error('Invalid view-once upload offset.');
    while (offset < bytes.length) {
      const chunk = bytes.subarray(offset, offset + viewOnceChunkBytes);
      const next = object(
        await api('view-once-part', {
          ...common,
          id: manifest.id,
          hash,
          offset,
          bytes: encode(chunk),
        }),
      );
      if (next['offset'] !== offset + chunk.length)
        throw new Error('View-once upload offset differs.');
      offset += chunk.length;
    }
  } finally {
    bytes.fill(0);
  }
}
