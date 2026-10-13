import { readGroupPage } from './reader.ts';
import { sendGroupPending } from './outbox.ts';
import type { GroupContext } from './authority.ts';
import type { PeerIdentity } from '../peer-identity/index.ts';
import type { MessageCrypto } from '../message-crypto/index.ts';
import type { GroupPhoto } from '../../shared/group-messages/index.ts';
import { groupProfilePhoto } from '../../shared/group-messages/index.ts';
import { object } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import { groupManager } from '../../shared/groups/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { GroupCache, groupTitle } from './cache.ts';
import type { GroupState } from './governance.ts';
import { composeGroup } from './outbox.ts';
/** Reannounce only the current metadata; new members receive no older conversation key. */
export async function stageCurrentProfile(
  authority: VaultAuthority,
  group: GroupState,
): Promise<boolean> {
  if (!groupManager(group.state, authority.session.accountId)) return false;
  const cache = new GroupCache(authority, group.state.groupId),
    raw = await cache.get('profile');
  if (raw === null || object(raw)['epoch'] === group.state.epoch) return false;
  const title = groupTitle(raw),
    hash = await digest(
      canonical({
        head: group.head,
        account: authority.session.accountId,
        device: authority.session.deviceId,
      }),
    );
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  if ((await cache.get(`outbox:${id}`)) === null)
    await composeGroup({
      authority,
      groupId: group.state.groupId,
      text: JSON.stringify({
        version: 1,
        title,
        photo: groupProfilePhoto(raw) ?? null,
      }),
      selection: null,
      kind: 'profile',
      id,
    });
  return true;
}

/** Read the signed current profile before editing, and reuse a pending/accepted ID after a lost response. */
export async function publishGroupPhoto(
  c: GroupContext & {
    group: GroupState;
    machine: MessageCrypto;
    identities: PeerIdentity;
    id: string;
    photo: GroupPhoto | null;
  },
): Promise<void> {
  const page = await readGroupPage(
    c,
    await c.api('group-profile', {
      groupId: c.group.state.groupId,
      head: c.group.head,
    }),
  );
  const latest = page.views.find((view) => view.kind === 'profile');
  if (latest?.id === c.id) {
    if (
      canonical(
        groupProfilePhoto(JSON.parse(latest.text) as unknown) ?? null,
      ) !== canonical(c.photo)
    )
      throw new Error('Pedido de foto repetido com conteúdo diferente.');
    return;
  }
  const cache = new GroupCache(c.authority, c.group.state.groupId),
    raw = await cache.get('profile');
  if (raw === null)
    throw new Error('Atualize o grupo antes de alterar a foto.');
  const pending = await cache.get(`outbox:${c.id}`);
  if (pending === null)
    await composeGroup({
      authority: c.authority,
      groupId: c.group.state.groupId,
      text: JSON.stringify({
        version: 1,
        title: groupTitle(raw),
        photo: c.photo,
      }),
      selection: null,
      kind: 'profile',
      id: c.id,
    });
  else assertPendingPhoto(pending, c.photo);
  await sendGroupPending(c);
}

function assertPendingPhoto(pending: unknown, photo: GroupPhoto | null): void {
  const draft = object(pending);
  if (
    draft['kind'] !== 'profile' ||
    typeof draft['text'] !== 'string' ||
    canonical(
      groupProfilePhoto(JSON.parse(draft['text']) as unknown) ?? null,
    ) !== canonical(photo)
  )
    throw new Error('Pedido local de foto divergente.');
}
