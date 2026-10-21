import { object } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import {
  groupProfileDescription,
  groupProfilePhoto,
  groupTitle,
} from '../../shared/group-messages/index.ts';
import type { GroupPhoto } from '../../shared/group-messages/index.ts';
import { GroupCache } from './cache.ts';
import { composeGroup, sendGroupPending } from './outbox.ts';
import { readGroupPage } from './reader.ts';
import type { GroupContext } from './authority.ts';
import type { GroupState } from './governance.ts';
import type { PeerIdentity } from '../peer-identity/index.ts';
import type { MessageCrypto } from '../message-crypto/index.ts';
interface ProfilePatch {
  photo?: GroupPhoto | null;
  description?: string;
}
interface EditContext extends GroupContext {
  group: GroupState;
  machine: MessageCrypto;
  identities: PeerIdentity;
  id: string;
  patch: ProfilePatch;
  sequence?: number;
}
function assertPatch(value: unknown, patch: ProfilePatch): void {
  const stored = {
    photo: groupProfilePhoto(value) ?? null,
    description: groupProfileDescription(value) ?? '',
  };
  for (const field of Object.keys(patch) as (keyof ProfilePatch)[])
    if (canonical(stored[field]) !== canonical(patch[field]))
      throw new Error('Group profile request repeated with different content.');
}
/** Fresh signed membership/profile reads precede edits. Retry reuses the same ID
 * and preserves fields outside the patch; plaintext never leaves this module's client. */
export async function publishGroupProfile(c: EditContext): Promise<void> {
  const page = await readGroupPage(
    c,
    await c.api('group-profile', {
      groupId: c.group.state.groupId,
      head: c.group.head,
    }),
  );
  const latest = page.views.find((view) => view.kind === 'profile');
  if (latest?.id === c.id) {
    assertPatch(JSON.parse(latest.text) as unknown, c.patch);
    return;
  }
  const cache = new GroupCache(c.authority, c.group.state.groupId),
    raw = await cache.get('profile');
  if (raw === null)
    throw new Error('Refresh the group before changing its profile.');
  if (c.sequence !== undefined && object(raw)['sequence'] !== c.sequence)
    throw new Error('Group description changed. Reload before editing.');
  const pending = await cache.get(`outbox:${c.id}`);
  if (pending === null)
    await composeGroup({
      authority: c.authority,
      groupId: c.group.state.groupId,
      kind: 'profile',
      selection: null,
      id: c.id,
      text: profilePayload(raw, c.patch),
    });
  else {
    const draft = object(pending);
    if (draft['kind'] !== 'profile' || typeof draft['text'] !== 'string')
      throw new Error('Invalid group draft.');
    assertPatch(JSON.parse(draft['text']) as unknown, c.patch);
  }
  await sendGroupPending(c);
  await readGroupPage(
    c,
    await c.api('group-profile', {
      groupId: c.group.state.groupId,
      head: c.group.head,
    }),
  );
}

function profilePayload(raw: unknown, patch: ProfilePatch): string {
  return JSON.stringify({
    version: 1,
    title: groupTitle(raw),
    photo: groupProfilePhoto(raw) ?? null,
    description: groupProfileDescription(raw) ?? '',
    ...patch,
  });
}
