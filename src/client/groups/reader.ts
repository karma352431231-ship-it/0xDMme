import { applyGroupRemovals } from './removals.ts';
import { groupEditRelation } from '../../shared/group-messages/index.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';
import {
  profilePhotoUpdate,
  profileDescriptionUpdate,
} from '../../shared/group-messages/index.ts';
import { object, uuid } from '../../shared/account/index.ts';
import { canonical, digest, fingerprint } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import {
  groupEventHash,
  groupManager,
  groupCanRead,
} from '../../shared/groups/index.ts';
import {
  groupPacket,
  groupKeys,
  groupKeysHash,
} from '../../shared/group-messages/index.ts';
import type {
  GroupPacket,
  GroupKeys,
} from '../../shared/group-messages/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import { recoveryKey } from '../../shared/messages/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import type { AttachmentApi } from '../attachments/index.ts';
import type { MessageCrypto } from '../message-crypto/index.ts';
import { openRecoveryKey, openRoomKey } from '../message-recovery/index.ts';
import { readDirectories } from '../peer-identity/index.ts';
import type { PeerIdentity } from '../peer-identity/index.ts';
import { GroupCache, groupTitle, groupMessageRecordName } from './cache.ts';
import type { GroupState } from './governance.ts';
import { optionalSentAt } from '../../shared/message-presentation/index.ts';
import type { MessagePresentation } from '../../shared/message-presentation/index.ts';
export interface GroupView {
  id: string;
  groupId: string;
  sequence: number;
  epoch: number;
  hash: string;
  sender: string;
  own: boolean;
  kind: GroupPacket['kind'];
  text: string;
  unavailableMedia: string[];
  localOnly?: boolean;
  delivery?: 'accepted' | 'received';
  read?: boolean;
  relation?: MessageRelation;
  edited?: boolean;
  editedSequence?: number;
  /** The sender's clock; groups messages sent before 24/10/2026 have none. */
  sentAt?: number;
}
interface GroupRow {
  id: string;
  sequence: number;
  epoch: number;
  hash: string;
  packet: GroupPacket | null;
  sender?: string;
  relation?: MessageRelation;
  deletion: unknown;
  unavailableMedia: string[];
}
export interface GroupReadContext {
  authority: VaultAuthority;
  group: GroupState;
  api: AttachmentApi;
  machine: MessageCrypto;
  identities: PeerIdentity;
}
export async function readGroupPage(
  c: GroupReadContext,
  input: unknown,
): Promise<{ views: GroupView[]; receipts: { id: string; hash: string }[] }> {
  const page = parseGroupPage(input),
    cache = new GroupCache(c.authority, c.group.state.groupId);
  await applyGroupRemovals(
    { ...c, groupId: c.group.state.groupId, head: c.group.head },
    page.items.flatMap((item) =>
      item.deletion && object(item.deletion)['type'] === 'message'
        ? [{ ...item, sender: item.sender ?? item.packet?.sender ?? '' }]
        : [],
    ),
  );
  const cached = await cachedGroupViews(
    cache,
    page.items,
    c.authority.session.accountId,
  );
  const senders = [
    ...new Set(
      page.items.flatMap((item) =>
        item.packet && !cached.has(item.id) ? [item.packet.sender] : [],
      ),
    ),
  ];
  const histories = await readDirectories({
    accounts: senders,
    identities: c.identities,
    load: (accounts) =>
      c.api('group-directory', {
        groupId: c.group.state.groupId,
        head: c.group.head,
        accounts,
      }),
  });
  const views: GroupView[] = [],
    receipts: { id: string; hash: string }[] = [];
  const keys = new Map<string, GroupKeys>();
  const recovery = new Map<
    string,
    Awaited<ReturnType<typeof openRecoveryKey>>
  >();
  for (const bundle of page.keys) keys.set(await groupKeysHash(bundle), bundle);
  try {
    for (const item of page.items) {
      const view = await readGroupRow({
        ...c,
        cache,
        item,
        histories,
        keys,
        recovery,
        cached,
      });
      if (!view) continue;
      views.push(view);
      if (item.packet && !item.unavailableMedia.length && !view.own)
        receipts.push({ id: item.id, hash: item.hash });
    }
    return { views, receipts };
  } finally {
    for (const secret of recovery.values()) secret.free();
  }
}
async function cachedGroupViews(
  cache: GroupCache,
  items: GroupRow[],
  account: string,
): Promise<Map<string, GroupView>> {
  const cached = new Map<string, GroupView>();
  for (const item of items) {
    if (!item.packet) continue;
    const stored = await cache.get(groupRowName(item));
    if (stored === null) continue;
    const view = groupView(stored);
    assertCachedGroupRow(view, item, account, item.packet);
    cached.set(item.id, view);
  }
  return cached;
}
function assertCachedGroupRow(
  view: GroupView,
  item: GroupRow,
  account: string,
  packet: GroupPacket,
): void {
  const stored = [
    view.id,
    view.hash,
    view.groupId,
    view.epoch,
    view.sequence,
    view.kind,
    view.sender,
    view.own,
    view.relation ?? null,
  ];
  const expected = [
    item.id,
    item.hash,
    packet.groupId,
    item.epoch,
    item.sequence,
    packet.kind,
    packet.sender,
    packet.sender === account,
    packet.relation ?? null,
  ];
  if (canonical(stored) !== canonical(expected))
    throw new Error('Local content differs from the group message.');
}

interface GroupRowContext extends GroupReadContext {
  cache: GroupCache;
  item: GroupRow;
  histories: Map<
    string,
    {
      events: import('../../shared/devices/index.ts').DirectoryEvent[];
      recovery: unknown;
    }
  >;
  keys: Map<string, GroupKeys>;
  recovery: Map<string, Awaited<ReturnType<typeof openRecoveryKey>>>;
  cached: Map<string, GroupView>;
}
function groupRowName(item: GroupRow): string {
  return groupMessageRecordName({
    ...item,
    ...(item.packet?.relation ? { relation: item.packet.relation } : {}),
  });
}
async function readGroupRow(c: GroupRowContext): Promise<GroupView | null> {
  const { item, cache } = c,
    packet = item.packet,
    name = groupRowName(item);
  if (!packet)
    return item.deletion && object(item.deletion)['type'] === 'message'
      ? null
      : preservedView(cache, name, item);
  await checkGroupIndex(c, packet);
  // Root-sealed cache is written only after SDK/signature validation. The current
  // packet hash and membership are still checked on every authorized read.
  const stored = c.cached.get(item.id);
  if (stored) return { ...stored, unavailableMedia: item.unavailableMedia };
  const { text, ...presentation } = await decryptGroupText(c, packet);
  if (packet.kind === 'attachment')
    attachmentContent(JSON.parse(text) as unknown);
  if (packet.kind === 'profile') await preserveProfile(c, packet, text);
  const view: GroupView = {
    id: item.id,
    groupId: packet.groupId,
    sequence: item.sequence,
    epoch: packet.epoch,
    hash: item.hash,
    sender: packet.sender,
    own: packet.sender === c.authority.session.accountId,
    kind: packet.kind,
    text,
    ...presentation,
    ...(packet.relation ? { relation: packet.relation } : {}),
    unavailableMedia: item.unavailableMedia,
  };
  await cache.put(name, view);
  await preserveEdit(cache, view);
  return view;
}
async function preserveEdit(cache: GroupCache, view: GroupView): Promise<void> {
  if (!view.relation) return;
  const old = await cache.get(`edit:${view.relation.id}`);
  if (old === null || groupView(old).sequence < view.sequence)
    await cache.put(`edit:${view.relation.id}`, view);
}
async function preservedView(
  cache: GroupCache,
  name: string,
  item: GroupRow,
): Promise<GroupView | null> {
  const stored = await cache.get(name);
  if (stored === null) return null;
  const previous = groupView(stored);
  if (previous.id !== item.id || previous.hash !== item.hash)
    throw new Error('Local content differs from the remote vault.');
  return { ...previous, localOnly: true };
}
async function checkGroupIndex(
  c: GroupRowContext,
  packet: GroupPacket,
): Promise<void> {
  const { item } = c;
  if (
    packet.id !== item.id ||
    packet.epoch !== item.epoch ||
    packet.groupId !== c.group.state.groupId ||
    (await digest(canonical(packet))) !== item.hash
  )
    throw new Error('Message differs from group index.');
  if (!groupCanRead(c.group.state, c.authority.session.accountId, packet.epoch))
    throw new Error('Message outside your membership period.');
}
async function decryptGroupText(
  c: GroupRowContext,
  packet: GroupPacket,
): Promise<{ text: string } & MessagePresentation> {
  const period = await c.cache.event(packet.head),
    bundle = c.keys.get(packet.keyHash),
    origin = c.histories.get(packet.sender)?.events[
      packet.authorityRevision - 1
    ];
  if (
    !period ||
    !bundle ||
    !origin ||
    (await groupEventHash(period)) !== packet.head
  )
    throw new Error('Message has no verified membership or origin.');
  const archive = bundle.archives.find(
    (a) => a.accountId === c.authority.session.accountId,
  );
  if (!archive) throw new Error('Message has no recovery for your account.');
  let secret = c.recovery.get(archive.keyId);
  if (!secret) {
    const key = recoveryKey(await c.api('recovery-key', { id: archive.keyId }));
    secret = await openRecoveryKey(key, c.authority);
    c.recovery.set(archive.keyId, secret);
  }
  return c.machine.decryptGroup({
    packet,
    keys: bundle,
    period,
    senderEvent: origin,
    exported: openRoomKey(secret, archive),
  });
}
async function preserveProfile(
  c: GroupRowContext,
  packet: GroupPacket,
  text: string,
): Promise<void> {
  const period = await c.cache.event(packet.head);
  if (!period || !groupManager(period, packet.sender))
    throw new Error('Group name has no authorized administrator.');
  const title = groupTitle(JSON.parse(text) as unknown),
    previous = await c.cache.get('profile');
  if (
    previous !== null &&
    integer(object(previous)['sequence'], Number.MAX_SAFE_INTEGER) >=
      c.item.sequence
  )
    return;
  await c.cache.put('profile', {
    version: 1,
    title,
    ...profilePhotoUpdate(JSON.parse(text) as unknown, previous),
    ...profileDescriptionUpdate(JSON.parse(text) as unknown, previous),
    epoch: packet.epoch,
    sequence: c.item.sequence,
  });
}
export function groupView(input: unknown): GroupView {
  const d = object(input),
    kind = d['kind'];
  if (
    !['text', 'attachment', 'profile'].includes(String(kind)) ||
    typeof d['text'] !== 'string' ||
    typeof d['own'] !== 'boolean' ||
    !Array.isArray(d['unavailableMedia'])
  )
    throw new Error('Invalid local group history.');
  return {
    id: uuid(d['id']),
    groupId: uuid(d['groupId']),
    sequence: integer(d['sequence'], Number.MAX_SAFE_INTEGER),
    epoch: integer(d['epoch'], 100_000),
    hash: fingerprint(d['hash']),
    sender: uuid(d['sender']),
    own: d['own'],
    kind: kind as GroupView['kind'],
    text: d['text'],
    ...(d['relation'] === undefined
      ? {}
      : { relation: groupEditRelation(d['relation']) }),
    ...optionalSentAt(d['sentAt']),
    unavailableMedia: d['unavailableMedia'].map(uuid),
  };
}
function parseGroupPage(input: unknown): {
  items: GroupRow[];
  keys: GroupKeys[];
} {
  const d = object(input);
  if (
    !Array.isArray(d['items']) ||
    d['items'].length > 16 ||
    !Array.isArray(d['keys']) ||
    d['keys'].length > 16
  )
    throw new Error('Invalid group message page.');
  const items: unknown[] = d['items'],
    keys: unknown[] = d['keys'];
  const checked = items.map((value) => {
    const row = object(value);
    if (!Array.isArray(row['unavailableMedia']))
      throw new Error('Invalid media state.');
    return {
      id: uuid(row['id']),
      ...(row['sender'] === undefined ? {} : { sender: uuid(row['sender']) }),
      ...(row['relation'] == null
        ? {}
        : { relation: groupEditRelation(row['relation']) }),
      deletion: row['deletion'] ?? null,
      epoch: integer(row['epoch'], 100_000),
      sequence: integer(row['sequence'], Number.MAX_SAFE_INTEGER),
      hash: fingerprint(row['hash']),
      packet: row['packet'] === null ? null : groupPacket(row['packet']),
      unavailableMedia: row['unavailableMedia'].map(uuid),
    };
  });
  if (
    checked.some(
      (r, index) =>
        index > 0 && r.sequence <= (checked[index - 1]?.sequence ?? 0),
    )
  )
    throw new Error('Invalid group order.');
  return { items: checked, keys: keys.map(groupKeys) };
}
