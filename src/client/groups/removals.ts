import { object } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import {
  groupDeletion,
  verifyGroupDeletion,
} from '../../shared/group-messages/index.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { readDirectories } from '../peer-identity/index.ts';
import type { PeerIdentity } from '../peer-identity/index.ts';
import type { AttachmentApi } from '../attachments/index.ts';
import { forgetAttachment } from '../attachments/index.ts';
import {
  GroupCache,
  groupCacheScope,
  groupMessageRecordName,
} from './cache.ts';
export interface GroupRemovalItem {
  id: string;
  hash: string;
  sequence: number;
  epoch: number;
  sender: string;
  relation?: MessageRelation;
  deletion: unknown;
}
export async function applyGroupRemovals(
  c: {
    authority: VaultAuthority;
    groupId: string;
    head: string;
    api: AttachmentApi;
    identities: PeerIdentity;
  },
  items: GroupRemovalItem[],
): Promise<void> {
  const removed = items.filter(
    (item) => item.deletion && object(item.deletion)['type'] === 'message',
  );
  if (!removed.length) return;
  const accounts = [
    ...new Set(removed.map((item) => groupDeletion(item.deletion).accountId)),
  ];
  const histories = await readDirectories({
    accounts,
    identities: c.identities,
    load: (requests) =>
      c.api('group-directory', {
        groupId: c.groupId,
        head: c.head,
        accounts: requests,
      }),
  });
  const cache = new GroupCache(c.authority, c.groupId);
  for (const item of removed) {
    const deletion = groupDeletion(item.deletion);
    await verifyGroupDeletion(
      deletion,
      { ...item, groupId: c.groupId },
      histories.get(deletion.accountId)?.events ?? [],
    );
    const name = groupMessageRecordName(item),
      raw = await cache.get(name);
    assertKnownRemoval(raw, item, c.groupId);
    await cache.remove(name);
    await cache.remove(`edit:${item.id}`);
    await forgetAttachment(
      groupCacheScope(c.authority.session.accountId, c.groupId),
      item.id,
    );
  }
}

function assertKnownRemoval(
  raw: unknown,
  item: GroupRemovalItem,
  group: string,
): void {
  if (raw === null) return;
  const stored = object(raw);
  if (
    canonical([
      stored['id'],
      stored['hash'],
      stored['groupId'],
      stored['sender'],
      stored['relation'] ?? null,
    ]) !==
    canonical([item.id, item.hash, group, item.sender, item.relation ?? null])
  )
    throw new Error('Exclusão divergente da mensagem de grupo já verificada.');
}
