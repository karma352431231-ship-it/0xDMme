import { object } from '../../shared/account/index.ts';
import { canonical, digest, eventHash } from '../../shared/devices/index.ts';
import { groupEventHash, groupManager } from '../../shared/groups/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import {
  groupLink,
  groupLinkProof,
  groupInvitationUrl,
  readGroupInvitation,
  verifyGroupLink,
} from '../../shared/groups/links.ts';
import type { GroupLink } from '../../shared/groups/links.ts';
import { peerHistory, readDirectories } from '../peer-identity/index.ts';
import type { PeerIdentity } from '../peer-identity/index.ts';
import type { AttachmentApi } from '../attachments/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { GroupCache } from './cache.ts';
import { GroupGovernance } from './governance.ts';
import { changeGroupEvent } from './transitions.ts';

export interface AdmissionContext {
  authority: VaultAuthority;
  api: AttachmentApi;
  governance: GroupGovernance;
  identities: PeerIdentity;
}
export class GroupAdmissions {
  private readonly c: AdmissionContext;
  constructor(context: AdmissionContext) {
    this.c = context;
  }
  async add(groupId: string, target: string): Promise<void> {
    const c = this.c,
      group = await c.governance.verify(groupId);
    const history = await peerHistory(
      c.api,
      target,
      null,
      c.identities.get(target),
    );
    await c.identities.remember(target, history);
    const event = await changeGroupEvent({
      authority: c.authority,
      state: group.state,
      kind: 'add',
      target,
    });
    await this.commit(event);
  }
  async link(groupId: string): Promise<string> {
    const c = this.c,
      group = await c.governance.verify(groupId),
      cache = new GroupCache(c.authority, groupId);
    const current = await c.api('group-link-current', {
      groupId,
      head: group.head,
    });
    const cached = await cache.get('invitation-link');
    if (cached !== null) {
      const saved = object(cached),
        link = groupLink(saved['link']);
      if (
        current !== null &&
        link.groupId === groupId &&
        canonical(groupLink(current)) === canonical(link) &&
        (await digest(String(saved['token']))) === link.tokenHash
      )
        return groupInvitationUrl(
          location.origin,
          groupId,
          String(saved['token']),
        );
    }
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
      n.toString(16).padStart(2, '0'),
    ).join('');
    const link: GroupLink = {
      version: 1,
      id: crypto.randomUUID(),
      groupId,
      head: group.head,
      actor: c.authority.session.accountId,
      deviceId: c.authority.session.deviceId,
      directory: c.authority.directory,
      authorityRevision: c.authority.events.length,
      tokenHash: await digest(token),
      signature: '',
    };
    link.signature = await c.authority.sign(groupLinkProof(link));
    await cache.put('invitation-link', { link, token });
    await c.api('group-link-publish', { link });
    return groupInvitationUrl(location.origin, groupId, token);
  }
  async revoke(groupId: string): Promise<void> {
    const c = this.c,
      group = await c.governance.verify(groupId);
    await c.api('group-link-revoke', { groupId, head: group.head });
    await new GroupCache(c.authority, groupId).remove('invitation-link');
  }
  async join(url: string): Promise<string> {
    const c = this.c,
      invitation = readGroupInvitation(url);
    const api: AttachmentApi = (op, data) => {
      if (op !== 'group-history' && op !== 'group-directory')
        throw new Error('Consulta de convite inválida.');
      return c.api(
        op === 'group-history' ? 'group-link-history' : 'group-link-directory',
        { ...data, token: invitation.token },
      );
    };
    const page = object(
        await api('group-history', { groupId: invitation.groupId, after: 0 }),
      ),
      link = groupLink(page['link']);
    const group = await new GroupGovernance(
      c.identities,
      api,
      c.authority,
    ).verify(invitation.groupId);
    await this.verifyInvitation({
      api,
      link,
      state: group.state,
      token: invitation.token,
    });
    if (
      group.state.members.some(
        (m) => m.accountId === c.authority.session.accountId,
      )
    )
      return invitation.groupId;
    const event = await changeGroupEvent({
      authority: c.authority,
      state: group.state,
      kind: 'link-join',
      target: c.authority.session.accountId,
      link,
    });
    await this.commit(event, invitation.token);
    return invitation.groupId;
  }
  private async verifyInvitation(input: {
    api: AttachmentApi;
    link: GroupLink;
    state: GroupEvent;
    token: string;
  }): Promise<void> {
    const { api, link, state, token } = input,
      c = this.c;
    const anchor = await new GroupCache(c.authority, state.groupId).event(
      link.head,
    );
    if (
      link.groupId !== state.groupId ||
      (await digest(token)) !== link.tokenHash ||
      !anchor ||
      !groupManager(anchor, link.actor) ||
      !groupManager(state, link.actor)
    )
      throw new Error('Convite de grupo inválido.');
    const head = await groupEventHash(state);
    const directories = await readDirectories({
      accounts: [link.actor],
      identities: c.identities,
      load: (accounts) =>
        api('group-directory', { groupId: state.groupId, head, accounts }),
    });
    const directory = directories.get(link.actor)?.events.at(-1);
    if (!directory || (await eventHash(directory)) !== link.directory)
      throw new Error('O link precisa ser renovado pelo administrador.');
    await verifyGroupLink(link, directory);
  }
  private async commit(event: GroupEvent, token?: string): Promise<void> {
    const result = object(
      await this.c.api(token ? 'group-link-join' : 'group-commit', {
        event,
        ...(token ? { token } : {}),
      }),
    );
    if (
      result['status'] !== 'saved' ||
      result['head'] !== (await groupEventHash(event))
    )
      throw new Error('Entrada no grupo não confirmada.');
    await new GroupCache(this.c.authority, event.groupId).preserve(event);
  }
}
