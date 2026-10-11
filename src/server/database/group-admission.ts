import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { canonical, digest, eventHash } from '../../shared/devices/index.ts';
import { groupManager } from '../../shared/groups/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import { verifyGroupLink } from '../../shared/groups/links.ts';
import type { GroupLink } from '../../shared/groups/links.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { DeviceStore } from './devices.ts';
interface GroupAdmissionHost {
  withGroupAuthority<T>(
    authority: ContactAuthority,
    scope: { groupId: string; head: string },
    work: (client: pg.PoolClient, state: GroupEvent) => Promise<T>,
  ): Promise<T>;
  anchor(
    client: pg.PoolClient,
    groupId: string,
    head: string,
  ): Promise<GroupEvent | null>;
}
interface AdmissionContext {
  groups: GroupAdmissionHost;
  contacts: ContactStore;
  devices: DeviceStore;
  capacity: number;
}

import {
  deleteGroupLink,
  saveGroupLink,
  storedGroupLink,
} from './group-link-storage.ts';
import { assertGroupTextQuota } from './group-quota.ts';
import { assertContentCapacity } from './vault-quota.ts';

function denied(): never {
  throw new AccountError(403, 'Convite de grupo indisponível.');
}
/** GroupStore owns the group lock; this module owns admission and invitation persistence. */
export class GroupAdmission {
  private readonly context: AdmissionContext;
  constructor(context: AdmissionContext) {
    this.context = context;
  }
  async current(
    authority: ContactAuthority,
    scope: { groupId: string; head: string },
  ): Promise<GroupLink | null> {
    return this.context.groups.withGroupAuthority(
      authority,
      scope,
      async (client, state) => {
        if (!groupManager(state, authority.session.accountId)) denied();
        const link = await storedGroupLink(client, state.groupId);
        if (!link) return null;
        const directory = await this.context.devices.currentInTransaction(
          client,
          link.actor,
        );
        if ((await eventHash(directory)) !== link.directory) {
          await deleteGroupLink(client, state.groupId);
          return null;
        }
        await this.origins(client, state, link);
        return link;
      },
    );
  }
  async publish(authority: ContactAuthority, link: GroupLink): Promise<void> {
    if (
      link.actor !== authority.session.accountId ||
      link.deviceId !== authority.session.deviceId ||
      link.directory !== authority.directory
    )
      denied();
    await this.context.groups.withGroupAuthority(
      authority,
      { groupId: link.groupId, head: link.head },
      async (client, state) => {
        await this.origins(client, state, link);
        await saveGroupLink(client, link);
        await assertGroupTextQuota(client, state.groupId);
        await assertContentCapacity(client, this.context.capacity);
      },
    );
  }
  async revoke(
    authority: ContactAuthority,
    scope: { groupId: string; head: string },
  ): Promise<void> {
    await this.context.groups.withGroupAuthority(
      authority,
      scope,
      async (client, state) => {
        if (!groupManager(state, authority.session.accountId)) denied();
        await deleteGroupLink(client, state.groupId);
      },
    );
  }
  async origins(client: pg.PoolClient, state: GroupEvent, link: GroupLink) {
    if (link.groupId !== state.groupId || !groupManager(state, link.actor))
      denied();
    const linkAnchor = await this.context.groups.anchor(
      client,
      state.groupId,
      link.head,
    );
    if (!linkAnchor || !groupManager(linkAnchor, link.actor)) denied();
    const linkDirectory = await this.context.devices.revisionInTransaction(
      client,
      link.actor,
      link.authorityRevision,
    );
    await verifyGroupLink(link, linkDirectory);
    return { linkAnchor, linkDirectory };
  }
  async require(
    client: pg.PoolClient,
    state: GroupEvent,
    token: string,
  ): Promise<GroupLink> {
    const link = await storedGroupLink(client, state.groupId);
    if (!link || link.tokenHash !== (await digest(token))) denied();
    await this.context.devices.lockDirectories(client, [link.actor]);
    const directory = await this.context.devices.currentInTransaction(
      client,
      link.actor,
    );
    await verifyGroupLink(link, directory);
    await this.origins(client, state, link);
    return link;
  }
  async admit(
    client: pg.PoolClient,
    event: GroupEvent,
    token?: string,
  ): Promise<void> {
    if (event.kind === 'add') {
      if (
        !event.target ||
        !(await this.context.contacts.messageDeliveryAllowed(
          client,
          event.actor,
          event.target,
        ))
      )
        denied();
      await this.context.devices.currentInTransaction(client, event.target);
    }
    if (event.kind === 'link-join') {
      if (!token) denied();
      const link = await this.require(client, event, token);
      if (canonical(link) !== canonical(event.link)) denied();
    }
  }
  async reconcile(client: pg.PoolClient, state: GroupEvent): Promise<void> {
    const link = await storedGroupLink(client, state.groupId);
    if (link && !groupManager(state, link.actor))
      await deleteGroupLink(client, state.groupId);
  }
}
