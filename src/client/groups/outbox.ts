import { groupQuota } from '../../shared/group-quota/index.ts';
import { object, uuid } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import { groupKeys, groupPacket } from '../../shared/group-messages/index.ts';
import type {
  GroupPacket,
  GroupKeys,
} from '../../shared/group-messages/index.ts';
import { recoveryKey } from '../../shared/messages/index.ts';
import type { MessageCrypto } from '../message-crypto/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { readDirectories } from '../peer-identity/index.ts';
import type { PeerIdentity } from '../peer-identity/index.ts';
import {
  stageAttachment,
  restageAttachments,
  uploadAttachments,
  forgetAttachment,
} from '../attachments/index.ts';
import type {
  AttachmentApi,
  AttachmentSelection,
} from '../attachments/index.ts';
import { GroupCache, groupCacheScope } from './cache.ts';
import type { GroupState } from './governance.ts';
import { groupAttachmentApi } from './media.ts';
interface Outbox {
  id: string;
  kind: GroupPacket['kind'];
  text: string;
  packet: GroupPacket | null;
  keys: GroupKeys | null;
  uploadEpoch: number | null;
}
interface SendContext {
  authority: VaultAuthority;
  group: GroupState;
  identities: PeerIdentity;
  api: AttachmentApi;
  machine: MessageCrypto;
}
export async function composeGroup(input: {
  authority: VaultAuthority;
  groupId: string;
  text: string;
  selection: AttachmentSelection | null;
  kind?: GroupPacket['kind'];
  id?: string;
}): Promise<string> {
  const id = input.id ?? crypto.randomUUID(),
    cache = new GroupCache(input.authority, input.groupId);
  let text = input.text,
    kind = input.kind ?? 'text';
  if (input.selection) {
    const content = await stageAttachment({
      account: groupCacheScope(
        input.authority.session.accountId,
        input.groupId,
      ),
      id,
      selection: input.selection,
      caption: text,
      budget: groupQuota,
    });
    text = JSON.stringify(content);
    kind = 'attachment';
  }
  if (!text.trim())
    throw new Error('Escreva uma mensagem ou escolha um anexo.');
  await cache.put(`outbox:${id}`, {
    id,
    kind,
    text,
    packet: null,
    keys: null,
    uploadEpoch: null,
  } satisfies Outbox);
  return id;
}
export async function sendGroupPending(c: SendContext): Promise<void> {
  const cache = new GroupCache(c.authority, c.group.state.groupId),
    page = await cache.page('outbox:', null);
  for (const row of page.items)
    await sendGroupOne(c, { cache, name: row.name, value: outbox(row.value) });
}
async function sendGroupOne(
  c: SendContext,
  entry: { cache: GroupCache; name: string; value: Outbox },
): Promise<void> {
  const { cache, name, value } = entry,
    scope = { groupId: c.group.state.groupId, head: c.group.head };
  if (
    value.packet &&
    (await c.api('group-message-accepted', {
      ...scope,
      id: value.id,
      hash: await digest(canonical(value.packet)),
    })) === true
  ) {
    await cache.remove(name);
    return;
  }
  await uploadGroupDraft(c, { cache, name, value });
  if (!currentPacket(value, c)) {
    const accounts = c.group.state.members.map((m) => m.accountId);
    const directories = await readDirectories({
      accounts,
      identities: c.identities,
      load: (requests) =>
        c.api('group-directory', { ...scope, accounts: requests }),
    });
    const saved = await cache.get(
      `session:${c.authority.session.deviceId}:${c.group.state.epoch}`,
    );
    const encrypted = await c.machine.encryptGroup({
      authority: c.authority,
      state: c.group.state,
      histories: accounts.map((account) => {
        const d = directories.get(account);
        if (!d) throw new Error('Participante sem diretório.');
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
      ...(saved === null ? {} : { existingKeys: groupKeys(saved) }),
    });
    value.packet = encrypted.packet;
    value.keys = encrypted.keys;
    await cache.put(
      `session:${c.authority.session.deviceId}:${c.group.state.epoch}`,
      encrypted.keys,
    );
    await cache.put(name, value);
  }
  const result = object(
    await c.api('group-message-publish', {
      packet: value.packet,
      keys: value.keys,
    }),
  );
  if (
    result['status'] !== 'accepted' ||
    result['hash'] !== (await digest(canonical(value.packet)))
  )
    throw new Error('Envio do grupo não confirmado.');
  await cache.remove(name);
}
function currentPacket(value: Outbox, c: SendContext): boolean {
  const packet = value.packet;
  if (!packet) return false;
  return (
    packet.head === c.group.head &&
    packet.directory === c.authority.directory &&
    packet.deviceId === c.authority.session.deviceId
  );
}
async function uploadGroupDraft(
  c: SendContext,
  entry: { cache: GroupCache; name: string; value: Outbox },
): Promise<void> {
  const { value, cache, name } = entry;
  if (value.kind !== 'attachment') return;
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
export async function discardGroupDraft(
  authority: VaultAuthority,
  group: string,
  id: string,
): Promise<void> {
  await new GroupCache(authority, group).remove(`outbox:${id}`);
  await forgetAttachment(
    groupCacheScope(authority.session.accountId, group),
    id,
  );
}
function outbox(input: unknown): Outbox {
  const d = object(input),
    kind = d['kind'];
  if (
    !['text', 'profile', 'attachment'].includes(String(kind)) ||
    typeof d['text'] !== 'string'
  )
    throw new Error('Rascunho de grupo inválido.');
  const uploadEpoch = d['uploadEpoch'];
  if (
    uploadEpoch !== null &&
    (typeof uploadEpoch !== 'number' ||
      !Number.isSafeInteger(uploadEpoch) ||
      uploadEpoch < 1)
  )
    throw new Error('Época de upload inválida.');
  return {
    id: uuid(d['id']),
    kind: kind as GroupPacket['kind'],
    text: d['text'],
    packet: d['packet'] === null ? null : groupPacket(d['packet']),
    keys: d['keys'] === null ? null : groupKeys(d['keys']),
    uploadEpoch,
  };
}
