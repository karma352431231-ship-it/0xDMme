import {
  measurePrivateSend,
  privateSendContext,
  privateSendPoint,
  linkPrivateBatch,
  traceSend,
  resumeGroupSendDiagnostic,
} from '../chat-sync-diagnostics/index.ts';
import type { PrivateSendContext } from '../chat-sync-diagnostics/index.ts';
import { messageContentFormat } from '../../shared/message-presentation/index.ts';
import { prepareViewOnceContents } from '../view-once/index.ts';
import type { ViewOnceContent } from '../../shared/view-once/index.ts';
import {
  prepareGroupViewOnce,
  uploadGroupViewOnce,
  groupOncePayload,
} from '../group-view-once/index.ts';
import type { GroupOncePayload } from '../group-view-once/index.ts';
import { currentRecoveryKey } from '../message-recovery/index.ts';
import { decodeDailyText } from '../../shared/daily/index.ts';
import { groupQuota } from '../../shared/group-quota/index.ts';
import { object, uuid } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import {
  attachmentContent,
  chatFileLimit,
} from '../../shared/attachments/index.ts';
import {
  groupKeys,
  groupPacket,
  groupMessageRelation,
} from '../../shared/group-messages/index.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';
import type {
  GroupPacket,
  GroupKeys,
} from '../../shared/group-messages/index.ts';
import { recoveryKey } from '../../shared/messages/index.ts';
import { GroupSendBatch } from '../message-crypto/index.ts';
import type { MessageCrypto } from '../message-crypto/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { readDirectories } from '../peer-identity/index.ts';
import type { PeerIdentity } from '../peer-identity/index.ts';
import {
  stageAttachment,
  restageAttachments,
  uploadAttachments,
} from '../attachments/index.ts';
import type {
  AttachmentApi,
  AttachmentSelection,
} from '../attachments/index.ts';
import { measureWork } from '../synchronization-diagnostics/index.ts';
import { GroupCache, groupCacheScope } from './cache.ts';
import type { GroupState } from './governance.ts';
import { groupAttachmentApi } from './media.ts';
export interface GroupDraft {
  id: string;
  kind: GroupPacket['kind'];
  text: string;
  packet: GroupPacket | null;
  keys: GroupKeys | null;
  uploadEpoch: number | null;
  contentFormat?: 'daily';
  once?: {
    content: ViewOnceContent;
    payload?: GroupOncePayload;
    batch: string[];
  };
  relation?: MessageRelation;
  /** Admission order; drafts saved before it existed sort first. */
  order?: number;
}
/** Steps of each draft a send reaches, for the outgoing rows and the local
 * trace. `accepted` follows the server's confirmation of that exact packet,
 * whether this attempt published it or an earlier one whose answer was lost. */
export interface GroupSendProgress {
  sending: (id: string) => void;
  accepted: (id: string) => void;
}
interface SendContext {
  apiFor?: (diagnostic: PrivateSendContext | undefined) => AttachmentApi;
  diagnostic?: PrivateSendContext | undefined;
  authority: VaultAuthority;
  group: GroupState;
  identities: PeerIdentity;
  api: AttachmentApi;
  machine: MessageCrypto;
  progress?: GroupSendProgress | undefined;
}
export async function composeGroup(input: {
  authority: VaultAuthority;
  diagnostic?: PrivateSendContext | undefined;
  groupId: string;
  text: string;
  selection: AttachmentSelection | null;
  kind?: GroupPacket['kind'];
  contentFormat?: 'daily';
  id?: string;
  relation?: MessageRelation;
  order?: number;
}): Promise<string> {
  const id = input.id ?? crypto.randomUUID(),
    cache = new GroupCache(input.authority, input.groupId, input.diagnostic);
  let text = input.text,
    kind = input.kind ?? 'text';
  if (input.selection) {
    const selection = input.selection;
    const content = await measurePrivateSend(
      input.diagnostic,
      'attachment-stage',
      () =>
        stageAttachment({
          account: groupCacheScope(
            input.authority.session.accountId,
            input.groupId,
          ),
          id,
          selection,
          caption: text,
          budget: groupQuota,
          maximum: chatFileLimit,
        }),
    );
    text = JSON.stringify(content);
    kind = 'attachment';
  }
  if (!text.trim()) throw new Error('Write a message or choose an attachment.');
  await cache.put(`outbox:${id}`, {
    id,
    kind,
    text,
    packet: null,
    keys: null,
    uploadEpoch: null,
    ...messageContentFormat(input.contentFormat),
    ...(input.relation
      ? { relation: groupMessageRelation(input.relation) }
      : {}),
    ...(input.order === undefined ? {} : { order: input.order }),
  } satisfies GroupDraft);
  return id;
}
/** Sends the group's drafts in admission order. The participant directories
 * are read once for the batch, when the first draft needs encryption. */
export async function sendGroupPending(c: SendContext): Promise<void> {
  const cache = new GroupCache(
    c.authority,
    c.group.state.groupId,
    c.diagnostic,
  );
  const drafts = (await outboxDrafts(cache)).sort(
    (a, b) => (a.value.order ?? 0) - (b.value.order ?? 0),
  );
  for (const { value } of drafts) resumeGroupSendDiagnostic(value.id);
  linkPrivateBatch(
    c.diagnostic,
    drafts.map((draft) => draft.value.id),
  );
  let directories: ReturnType<typeof readDirectories> | null = null;
  const participants = () =>
    (directories ??= readDirectories({
      accounts: c.group.state.members.map((m) => m.accountId),
      identities: c.identities,
      load: (requests) =>
        measurePrivateSend(c.diagnostic, 'group-directories', () =>
          c.api('group-directory', {
            groupId: c.group.state.groupId,
            head: c.group.head,
            accounts: requests,
          }),
        ),
    }));
  const batch = new GroupSendBatch();
  for (const draft of drafts) {
    traceSend('outbox-dispatch', draft.value.id);
    const message = privateSendContext(draft.value.id);
    const diagnostic = message ? { ...c.diagnostic, ...message } : c.diagnostic;
    await measurePrivateSend(diagnostic, 'group-send-entry', () =>
      sendGroupOne(
        { ...c, diagnostic, api: groupSendApi(c, diagnostic) },
        {
          cache: new GroupCache(c.authority, c.group.state.groupId, diagnostic),
          ...draft,
          participants,
          batch,
        },
      ),
    );
  }
}
/** The server rejected a packet prepared for an older membership, participant
 * directory or recovery key; its draft was cleared for a fresh encryption. */
export function staleGroupSend(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 409
  );
}
/** Every draft, so the admission order holds across storage pages. */
async function outboxDrafts(
  cache: GroupCache,
): Promise<{ name: string; value: GroupDraft }[]> {
  const drafts: { name: string; value: GroupDraft }[] = [];
  let after: string | null = null;
  for (let page = 0; page < 8; page++) {
    const result = await cache.page('outbox:', after);
    for (const row of result.items)
      drafts.push({ name: row.name, value: outbox(row.value) });
    if (result.next === null) return drafts;
    after = result.next;
  }
  return drafts;
}
async function sendGroupOne(
  c: SendContext,
  entry: {
    cache: GroupCache;
    name: string;
    value: GroupDraft;
    participants: () => ReturnType<typeof readDirectories>;
    batch: GroupSendBatch;
  },
): Promise<void> {
  const { cache, name, value } = entry,
    scope = { groupId: c.group.state.groupId, head: c.group.head };
  c.progress?.sending(value.id);
  privateSendPoint(c.diagnostic, 'group-send-entry');
  // A packet kept from an attempt whose answer was lost is never published
  // twice: the server's copy is the durable record from here on.
  if (
    value.packet &&
    (await c.api('group-message-accepted', {
      ...scope,
      id: value.id,
      hash: await digest(canonical(value.packet)),
    })) === true
  ) {
    privateSendPoint(c.diagnostic, 'accepted-check', {
      sendOutcome: 'accepted',
    });
    privateSendPoint(c.diagnostic, 'device-keys', { sendOutcome: 'skipped' });
    traceSend('accepted', value.id);
    await cache.remove(name);
    c.progress?.accepted(value.id);
    return;
  }
  await prepareGroupOnceDraft(c, { cache, name, value }, entry.participants);
  await transmitGroupMedia(c, { cache, name, value });
  if (!currentPacket(value, c)) {
    const accounts = c.group.state.members.map((m) => m.accountId);
    const directories = await entry.participants();
    const saved = await cache.get(
      `session:${c.authority.session.deviceId}:${c.group.state.epoch}`,
    );
    const encrypted = await measurePrivateSend(
      c.diagnostic,
      'group-packet',
      () =>
        measureWork(c.machine, 'sdk/group-encrypt', () =>
          c.machine.encryptGroup({
            authority: c.authority,
            state: c.group.state,
            histories: accounts.map((account) => {
              const d = directories.get(account);
              if (!d) throw new Error('Participant has no directory.');
              return d.events;
            }),
            recovery: accounts.map((account) =>
              recoveryKey(directories.get(account)?.recovery),
            ),
            transport: (op, payload) =>
              op === 'matrix-upload'
                ? c.api(op, payload)
                : c.api('group-' + op, { ...scope, payload }),
            id: value.id,
            text: value.text,
            kind: value.kind,
            ...messageContentFormat(value.once ? 'daily' : value.contentFormat),
            ...(value.relation ? { relation: value.relation } : {}),
            ...(value.once?.payload
              ? {
                  viewOnce: {
                    hash: decodeDailyText(value.text).viewOnce!.hash,
                  },
                }
              : {}),
            ...(saved === null ? {} : { existingKeys: groupKeys(saved) }),
            batch: entry.batch,
          }),
        ),
    );
    value.packet = encrypted.packet;
    value.keys = encrypted.keys;
    await cache.put(
      `session:${c.authority.session.deviceId}:${c.group.state.epoch}`,
      encrypted.keys,
    );
    await measurePrivateSend(c.diagnostic, 'packet-save', () =>
      cache.put(name, value),
    );
  } else
    privateSendPoint(c.diagnostic, 'device-keys', { sendOutcome: 'skipped' });
  const result = object(
    await measurePrivateSend(c.diagnostic, 'server-publish', () =>
      publish(c, entry),
    ),
  );
  if (
    result['status'] !== 'accepted' ||
    result['hash'] !== (await digest(canonical(value.packet)))
  )
    throw new Error('Group send not confirmed.');
  // The draft keeps its packet until here, so a crash before the removal
  // leaves a draft the next attempt settles through `group-message-accepted`.
  traceSend('accepted', value.id);
  await cache.remove(name);
  c.progress?.accepted(value.id);
}
/** A stale rejection clears the stored packet and the batch's device trust,
 * so the next attempt prepares and encrypts again instead of resending it. */
async function publish(
  c: SendContext,
  entry: {
    cache: GroupCache;
    name: string;
    value: GroupDraft;
    batch: GroupSendBatch;
  },
): Promise<unknown> {
  const { cache, name, value } = entry;
  try {
    return await c.api('group-message-publish', {
      packet: value.packet,
      keys: value.keys,
    });
  } catch (error: unknown) {
    if (staleGroupSend(error)) {
      if (value.once?.payload) {
        await c.api('view-once-cancel', {
          scope: 'group',
          peer: c.group.state.groupId,
          id: value.id,
          hash: decodeDailyText(value.once.payload.text).viewOnce!.hash,
        });
        delete value.once.payload;
      }
      entry.batch.reset();
      value.packet = null;
      value.keys = null;
      await cache.put(name, value);
    }
    throw error;
  }
}
function currentPacket(value: GroupDraft, c: SendContext): boolean {
  const packet = value.packet;
  if (!packet) return false;
  return (
    packet.head === c.group.head &&
    packet.directory === c.authority.directory &&
    packet.deviceId === c.authority.session.deviceId
  );
}
async function transmitGroupMedia(
  c: SendContext,
  entry: { cache: GroupCache; name: string; value: GroupDraft },
): Promise<void> {
  if (entry.value.kind !== 'attachment') return;
  await measurePrivateSend(c.diagnostic, 'upload', () =>
    uploadGroupDraft(c, entry),
  );
  traceSend('transfer-complete', entry.value.id);
}
async function uploadGroupDraft(
  c: SendContext,
  entry: { cache: GroupCache; name: string; value: GroupDraft },
): Promise<void> {
  const { value, cache, name } = entry;
  const account = groupCacheScope(
    c.authority.session.accountId,
    c.group.state.groupId,
  );
  let content = attachmentContent(JSON.parse(value.text) as unknown);
  if (value.uploadEpoch !== null && value.uploadEpoch !== c.group.state.epoch) {
    await c.api('group-attachment-cancel', {
      groupId: c.group.state.groupId,
      head: c.group.head,
      message: value.id,
    });
    content = await restageAttachments({
      account,
      message: value.id,
      content,
      budget: groupQuota,
    });
    value.text = JSON.stringify(content);
    value.packet = null;
    value.keys = null;
  }
  value.uploadEpoch = c.group.state.epoch;
  await cache.put(name, value);
  await uploadAttachments({
    account,
    message: value.id,
    peer: c.group.state.groupId,
    content,
    api: groupAttachmentApi(c.group, c.api),
  });
}
function outbox(input: unknown): GroupDraft {
  const d = object(input),
    kind = d['kind'];
  if (
    !['text', 'profile', 'attachment'].includes(String(kind)) ||
    typeof d['text'] !== 'string'
  )
    throw new Error('Invalid group draft.');
  const uploadEpoch = d['uploadEpoch'];
  if (
    uploadEpoch !== null &&
    (typeof uploadEpoch !== 'number' ||
      !Number.isSafeInteger(uploadEpoch) ||
      uploadEpoch < 1)
  )
    throw new Error('Invalid upload epoch.');
  return {
    id: uuid(d['id']),
    kind: kind as GroupPacket['kind'],
    text: d['text'],
    packet: d['packet'] === null ? null : groupPacket(d['packet']),
    keys: d['keys'] === null ? null : groupKeys(d['keys']),
    uploadEpoch,
    ...(d['relation'] === undefined
      ? {}
      : { relation: groupMessageRelation(d['relation']) }),
    ...optionalOnce(d['once']),
    ...messageContentFormat(d['contentFormat']),
    ...draftOrder(d['order']),
  };
}
function draftOrder(value: unknown): { order?: number } {
  if (value === undefined) return {};
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid group draft order.');
  return { order: value };
}

function parseOnce(input: unknown): NonNullable<GroupDraft['once']> {
  const d = object(input);
  if (!Array.isArray(d['batch']))
    throw new Error('Invalid group view-once draft.');
  return {
    content: d['content'] as ViewOnceContent,
    batch: d['batch'].map(uuid),
    ...(d['payload'] === undefined
      ? {}
      : { payload: groupOncePayload(d['payload']) }),
  };
}
export async function composeGroupOnce(input: {
  authority: VaultAuthority;
  diagnostic?: PrivateSendContext | undefined;
  groupId: string;
  id: string;
  text: string;
  selection: AttachmentSelection | null;
  createdAt: number;
}) {
  const cache = new GroupCache(
      input.authority,
      input.groupId,
      input.diagnostic,
    ),
    old = await cache.get(`outbox:${input.id}`);
  if (old) return outbox(old).once!.batch;
  const contents = await prepareViewOnceContents(
      input.text,
      input.selection,
      chatFileLimit,
    ),
    ids = contents.map((_, index) =>
      index === 0 ? input.id : crypto.randomUUID(),
    );
  await cache.putMany(
    contents.map((content, index) => ({
      name: `outbox:${ids[index]!}`,
      value: {
        id: ids[index]!,
        kind: 'text',
        text: '',
        packet: null,
        keys: null,
        uploadEpoch: null,
        order: (input.createdAt + index) * 1000,
        once: { content, batch: ids },
      } satisfies GroupDraft,
    })),
  );
  return ids;
}
async function prepareGroupOnceDraft(
  c: SendContext,
  entry: { cache: GroupCache; name: string; value: GroupDraft },
  participants: () => ReturnType<typeof readDirectories>,
): Promise<void> {
  const { value, cache, name } = entry,
    once = value.once;
  if (!once) return;
  if (once.payload && once.payload.manifest.head !== c.group.head) {
    await c.api('view-once-cancel', {
      scope: 'group',
      peer: c.group.state.groupId,
      id: value.id,
      hash: decodeDailyText(once.payload.text).viewOnce!.hash,
    });
    delete once.payload;
    value.packet = null;
    value.keys = null;
    await cache.put(name, value);
  }
  if (!once.payload) {
    const directories = await participants(),
      recipients = [];
    for (const member of c.group.state.members.filter(
      (m) => m.accountId !== c.authority.session.accountId,
    )) {
      const directory = directories.get(member.accountId);
      if (!directory) throw new Error('Participant has no directory.');
      const key = recoveryKey(directory.recovery);
      await currentRecoveryKey(key, directory.events, member.accountId);
      recipients.push(key);
    }
    once.payload = await prepareGroupViewOnce({
      id: value.id,
      group: { ...c.group.state, head: c.group.head },
      sender: c.authority.session.accountId,
      recipients,
      content: once.content,
    });
    value.text = once.payload.text;
    await cache.put(name, value);
  }
  await uploadGroupViewOnce(once.payload, c.api);
}

function optionalOnce(input: unknown): Pick<GroupDraft, 'once'> {
  return input === undefined ? {} : { once: parseOnce(input) };
}

function groupSendApi(
  c: SendContext,
  diagnostic: PrivateSendContext | undefined,
): AttachmentApi {
  return c.apiFor?.(diagnostic) ?? c.api;
}
