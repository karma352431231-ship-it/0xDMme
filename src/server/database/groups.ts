import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { canonical, eventHash } from '../../shared/devices/index.ts';
import { groupCreationRetryAt } from '../../shared/group-quota/index.ts';
import {
  groupConsent,
  groupEvent,
  groupEventHash,
  groupManager,
  groupPageSize,
  verifyGroupConsent,
  verifyGroupTransition,
} from '../../shared/groups/index.ts';
import type { GroupConsent, GroupEvent } from '../../shared/groups/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { DeviceStore } from './devices.ts';
import type { MessageRecoveryStore } from './message-recovery.ts';
import { assertContentCapacity } from './vault-quota.ts';
import { assertGroupTextQuota } from './group-quota.ts';

interface GroupRow {
  id: string;
  head: string;
  event: unknown;
}
function unavailable(): never {
  throw new AccountError(403, 'Grupo indisponível para esta conta.');
}

export class GroupStore {
  private readonly contacts: ContactStore;
  private readonly devices: DeviceStore;
  private readonly capacity: number;
  private readonly recovery: MessageRecoveryStore;
  constructor(
    contacts: ContactStore,
    devices: DeviceStore,
    capacity: number,
    recovery: MessageRecoveryStore,
  ) {
    this.contacts = contacts;
    this.devices = devices;
    this.capacity = capacity;
    this.recovery = recovery;
  }

  private async row(
    client: pg.PoolClient,
    id: string,
  ): Promise<GroupRow | null> {
    const result = await client.query<GroupRow>(
      'SELECT id,head,event FROM hash_talk.groups WHERE id=$1 FOR UPDATE',
      [id],
    );
    return result.rows[0] ?? null;
  }
  async current(authority: ContactAuthority, id: string): Promise<GroupEvent> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const row = await this.row(client, id);
      if (!row) unavailable();
      const state = groupEvent(row.event);
      if (
        !state.members.some((m) => m.accountId === authority.session.accountId)
      )
        unavailable();
      return state;
    });
  }
  /** Owns the group ACL and serializes admission against membership/device changes. */
  async withGroupAuthority<T>(
    authority: ContactAuthority,
    scope: { groupId: string; head: string },
    work: (client: pg.PoolClient, state: GroupEvent) => Promise<T>,
  ): Promise<T> {
    return this.withGroupMembership(
      authority,
      scope.groupId,
      async (client, state) => {
        if ((await groupEventHash(state)) !== scope.head)
          throw new AccountError(
            409,
            'Participação do grupo mudou. Atualize antes de continuar.',
          );
        return work(client, state);
      },
    );
  }
  async withGroupMembership<T>(
    authority: ContactAuthority,
    groupId: string,
    work: (client: pg.PoolClient, state: GroupEvent) => Promise<T>,
  ): Promise<T> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const row = await this.row(client, groupId);
      if (!row) unavailable();
      const state = groupEvent(row.event);
      if (
        !state.members.some((m) => m.accountId === authority.session.accountId)
      )
        unavailable();
      await this.devices.lockDirectories(
        client,
        state.members.map((m) => m.accountId),
      );
      return work(client, state);
    });
  }
  async withMaintenance<T>(
    groupId: string,
    work: (client: pg.PoolClient, state: GroupEvent) => Promise<T>,
  ): Promise<T | null> {
    return this.contacts.withMaintenance(async (client) => {
      const row = await this.row(client, groupId);
      if (!row) return null;
      return work(client, groupEvent(row.event));
    });
  }
  async authorizedScopes(
    client: pg.PoolClient,
    account: string,
    scopes: { groupId: string; head: string }[],
  ): Promise<GroupEvent[]> {
    if (
      scopes.length > 16 ||
      new Set(scopes.map((s) => s.groupId)).size !== scopes.length
    )
      throw new AccountError(400, 'Lote de grupos inválido.');
    const result = await client.query<{ event: unknown }>(
      `SELECT g.event FROM jsonb_to_recordset($1::jsonb) r("groupId" uuid,head text) JOIN hash_talk.groups g ON g.id=r."groupId" AND g.head=r.head AND NOT g.deleted JOIN hash_talk.group_members m ON m.group_id=g.id AND m.account_id=$2`,
      [JSON.stringify(scopes), account],
    );
    if (result.rows.length !== scopes.length)
      throw new AccountError(409, 'Participação de um grupo mudou. Atualize.');
    return result.rows.map((r) => groupEvent(r.event));
  }
  async list(
    authority: ContactAuthority,
    after: string | null,
  ): Promise<{ items: GroupEvent[]; next: string | null }> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const rows = await client.query<{ event: unknown; id: string }>(
        'SELECT g.id,g.event FROM hash_talk.groups g JOIN hash_talk.group_members m ON m.group_id=g.id WHERE m.account_id=$1 AND NOT g.deleted AND ($2::uuid IS NULL OR g.id>$2) ORDER BY g.id LIMIT $3',
        [authority.session.accountId, after, groupPageSize + 1],
      );
      const page = rows.rows.slice(0, groupPageSize);
      return {
        items: page.map((r) => groupEvent(r.event)),
        next:
          rows.rows.length > groupPageSize ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }
  async commit(
    authority: ContactAuthority,
    input: { event: GroupEvent },
  ): Promise<{ head: string; status: 'saved' }> {
    const event = groupEvent(input.event),
      hash = await groupEventHash(event);
    if (
      event.actor !== authority.session.accountId ||
      event.deviceId !== authority.session.deviceId ||
      event.directory !== authority.directory
    )
      unavailable();
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const previous = await this.prepareCommit(client, event, hash);
      if (previous === 'accepted') return { head: hash, status: 'saved' };
      if (event.kind === 'create') await this.recordCreation(client, event);
      await this.saveEvent(client, event, hash);
      await assertGroupTextQuota(client, event.groupId);
      await assertContentCapacity(client, this.capacity);
      this.contacts.changed(client, changedMembers(previous, event), true);
      return { head: hash, status: 'saved' };
    });
  }
  private async prepareCommit(
    client: pg.PoolClient,
    event: GroupEvent,
    hash: string,
  ): Promise<GroupEvent | null | 'accepted'> {
    await this.devices.lockDirectories(client, [
      event.actor,
      ...(event.consent ? [event.consent.actor] : []),
    ]);
    const row = await this.row(client, event.groupId);
    if (row?.head === hash) return 'accepted';
    const accepted = await client.query<{ hash: string }>(
      'SELECT hash FROM hash_talk.group_events WHERE group_id=$1 AND revision=$2',
      [event.groupId, event.revision],
    );
    if (accepted.rows[0]?.hash === hash) return 'accepted';
    const previous = row ? groupEvent(row.event) : null;
    await this.checkTransition(client, event, previous);
    await this.checkConsent(client, event);
    return previous;
  }
  private async checkTransition(
    client: pg.PoolClient,
    event: GroupEvent,
    previous: GroupEvent | null,
  ): Promise<void> {
    const actorDirectory = await this.devices.currentInTransaction(
      client,
      event.actor,
    );
    const consentDirectory = event.consent
      ? await this.devices.currentInTransaction(client, event.consent.actor)
      : undefined;
    const targetDirectory = event.consent
      ? await this.devices.revisionInTransaction(
          client,
          event.actor,
          event.consent.targetRevision,
        )
      : undefined;
    await verifyGroupTransition({
      previous,
      event,
      actorDirectory,
      ...(consentDirectory ? { consentDirectory } : {}),
      ...(targetDirectory ? { targetDirectory } : {}),
    });
  }
  private async checkCreationFrequency(
    client: pg.PoolClient,
    owner: string,
  ): Promise<void> {
    const now = Date.now();
    const times = await client.query<{ at: string }>(
      "SELECT floor(extract(epoch FROM created_at)*1000)::bigint::text AS at FROM hash_talk.group_creation_window WHERE account_id=$1 AND created_at>clock_timestamp()-interval '1 hour' ORDER BY created_at DESC LIMIT 10",
      [owner],
    );
    if (
      groupCreationRetryAt({
        now,
        createdAt: times.rows.map((r) => Number(r.at)),
      }) > now
    )
      throw new AccountError(
        429,
        'Limite de criação: uma por minuto e dez por hora.',
      );
  }
  private async checkConsent(
    client: pg.PoolClient,
    event: GroupEvent,
  ): Promise<void> {
    if (!event.consent) return;
    const row = await client.query<{ proof: unknown }>(
      'SELECT proof FROM hash_talk.group_consents WHERE id=$1 FOR UPDATE',
      [event.consent.id],
    );
    if (
      !row.rows[0] ||
      canonical(row.rows[0].proof) !== canonical(event.consent)
    )
      throw new AccountError(409, 'Convite ou transferência encerrados.');
    const anchor = await client.query<{ event: unknown }>(
      'SELECT event FROM hash_talk.group_events WHERE group_id=$1 AND hash=$2',
      [event.groupId, event.consent.head],
    );
    if (
      !anchor.rows[0] ||
      !groupManager(groupEvent(anchor.rows[0].event), event.consent.actor)
    )
      unavailable();
    if (
      event.kind === 'join' &&
      !(await this.contacts.messageDeliveryAllowed(
        client,
        event.consent.actor,
        event.actor,
      ))
    )
      unavailable();
  }
  /** No token or count gate. Frequency and persisted bytes are admitted atomically. */
  private async recordCreation(
    client: pg.PoolClient,
    event: GroupEvent,
  ): Promise<void> {
    await this.checkCreationFrequency(client, event.owner);
    await client.query(
      "DELETE FROM hash_talk.group_creation_window WHERE account_id=$1 AND created_at<=clock_timestamp()-interval '1 hour'",
      [event.owner],
    );
    await client.query(
      'INSERT INTO hash_talk.group_creation_window(account_id,group_id) VALUES($1,$2)',
      [event.owner, event.groupId],
    );
  }
  private async saveEvent(
    client: pg.PoolClient,
    event: GroupEvent,
    hash: string,
  ): Promise<void> {
    const serialized = JSON.stringify(event),
      charge = Buffer.byteLength(serialized) + 512;
    await client.query(
      'INSERT INTO hash_talk.groups(id,owner,revision,epoch,head,event,deleted,charge) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,revision=excluded.revision,epoch=excluded.epoch,head=excluded.head,event=excluded.event,deleted=excluded.deleted,charge=excluded.charge',
      [
        event.groupId,
        event.owner,
        event.revision,
        event.epoch,
        hash,
        serialized,
        event.kind === 'delete',
        charge,
      ],
    );
    await client.query(
      'INSERT INTO hash_talk.group_events(group_id,revision,epoch,hash,event,charge) VALUES($1,$2,$3,$4,$5::jsonb,$6)',
      [event.groupId, event.revision, event.epoch, hash, serialized, charge],
    );
    await this.saveMembers(client, event);
    if (event.kind === 'delete')
      await client.query(
        'UPDATE hash_talk.groups SET clearing=true WHERE id=$1',
        [event.groupId],
      );
    // Keep independent invitations; consume acceptance and invalidate lost issuer/target authority.
    await client.query(
      "DELETE FROM hash_talk.group_consents c WHERE group_id=$1 AND (c.id=$2::uuid OR NOT EXISTS(SELECT 1 FROM hash_talk.group_members m WHERE m.group_id=c.group_id AND m.account_id=c.actor AND m.role IN ('owner','admin')) OR (c.kind='invite' AND EXISTS(SELECT 1 FROM hash_talk.group_members m WHERE m.group_id=c.group_id AND m.account_id=c.target)) OR (c.kind='transfer' AND (c.actor<>$3::uuid OR NOT EXISTS(SELECT 1 FROM hash_talk.group_members m WHERE m.group_id=c.group_id AND m.account_id=c.target))))",
      [event.groupId, event.consent?.id ?? null, event.owner],
    );
  }
  private async saveMembers(
    client: pg.PoolClient,
    event: GroupEvent,
  ): Promise<void> {
    const accounts = event.members.map((m) => m.accountId);
    await client.query(
      'DELETE FROM hash_talk.group_members WHERE group_id=$1 AND NOT(account_id=ANY($2::uuid[]))',
      [event.groupId, accounts],
    );
    if (!accounts.length) return;
    await client.query(
      `INSERT INTO hash_talk.group_members(group_id,account_id,role,joined) SELECT $1,x.account_id,x.role,x.joined FROM jsonb_to_recordset($2::jsonb) AS x(account_id uuid,role text,joined integer) ON CONFLICT(group_id,account_id) DO UPDATE SET role=excluded.role,joined=excluded.joined WHERE hash_talk.group_members.role<>excluded.role OR hash_talk.group_members.joined<>excluded.joined`,
      [
        event.groupId,
        JSON.stringify(
          event.members.map((m) => ({
            account_id: m.accountId,
            role: m.role,
            joined: m.joined,
          })),
        ),
      ],
    );
  }
  async propose(
    authority: ContactAuthority,
    input: GroupConsent,
  ): Promise<void> {
    const consent = groupConsent(input);
    if (
      consent.actor !== authority.session.accountId ||
      consent.deviceId !== authority.session.deviceId ||
      consent.directory !== authority.directory
    )
      unavailable();
    await this.contacts.withMessageAuthority(authority, async (client) => {
      const row = await this.row(client, consent.groupId);
      if (!row || row.head !== consent.head)
        throw new AccountError(409, 'Grupo mudou. Confira novamente.');
      const state = groupEvent(row.event);
      if (!groupManager(state, consent.actor)) unavailable();
      await this.devices.lockDirectories(client, [
        consent.actor,
        consent.target,
      ]);
      await verifyGroupConsent(
        consent,
        await this.devices.currentInTransaction(client, consent.actor),
      );
      await this.checkProposalTarget(client, state, consent);
      const target = await this.devices.currentInTransaction(
        client,
        consent.target,
      );
      if (
        target.revision !== consent.targetRevision ||
        (await eventHash(target)) !== consent.targetDirectory
      )
        throw new AccountError(
          409,
          'Chaves do destinatário mudaram. Confira novamente.',
        );
      const serialized = JSON.stringify(consent);
      await client.query(
        'INSERT INTO hash_talk.group_consents(id,group_id,target,actor,kind,head,proof,charge) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT(group_id,target,kind) DO UPDATE SET id=excluded.id,actor=excluded.actor,head=excluded.head,proof=excluded.proof,charge=excluded.charge WHERE hash_talk.group_consents.proof<>excluded.proof',
        [
          consent.id,
          consent.groupId,
          consent.target,
          consent.actor,
          consent.kind,
          consent.head,
          serialized,
          Buffer.byteLength(serialized) + 512,
        ],
      );
      await assertGroupTextQuota(client, consent.groupId);
      await assertContentCapacity(client, this.capacity);
      this.contacts.changed(client, [consent.actor, consent.target]);
    });
  }
  private async checkProposalTarget(
    client: pg.PoolClient,
    state: GroupEvent,
    consent: GroupConsent,
  ): Promise<void> {
    const member = state.members.some((m) => m.accountId === consent.target);
    if (consent.kind === 'transfer') {
      if (
        state.owner !== consent.actor ||
        !member ||
        consent.target === consent.actor
      )
        unavailable();
      return;
    }
    if (
      member ||
      !(await this.contacts.messageDeliveryAllowed(
        client,
        consent.actor,
        consent.target,
      ))
    )
      unavailable();
  }
  async incoming(
    authority: ContactAuthority,
    after: string | null,
  ): Promise<{ items: GroupConsent[]; next: string | null }> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const rows = await client.query<{ proof: unknown; id: string }>(
        'SELECT id,proof FROM hash_talk.group_consents WHERE target=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3',
        [authority.session.accountId, after, groupPageSize + 1],
      );
      const page = rows.rows.slice(0, groupPageSize);
      const consents = page.map((r) => groupConsent(r.proof));
      const allowed = await this.contacts.messageDeliveryBatch(
        client,
        authority.session.accountId,
        [
          ...new Set(
            consents.filter((c) => c.kind === 'invite').map((c) => c.actor),
          ),
        ],
      );
      return {
        items: consents.filter(
          (c) => c.kind === 'transfer' || allowed.has(c.actor),
        ),
        next:
          rows.rows.length > groupPageSize ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }
  async cancel(authority: ContactAuthority, id: string): Promise<void> {
    await this.contacts.withMessageAuthority(authority, async (client) => {
      const rows = await client.query<{ proof: unknown }>(
        'SELECT proof FROM hash_talk.group_consents WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (!rows.rows[0]) return;
      const consent = groupConsent(rows.rows[0].proof),
        account = authority.session.accountId;
      const row = await this.row(client, consent.groupId);
      if (!row) unavailable();
      if (
        account !== consent.target &&
        !groupManager(groupEvent(row.event), account)
      )
        unavailable();
      await client.query('DELETE FROM hash_talk.group_consents WHERE id=$1', [
        id,
      ]);
      this.contacts.changed(client, [consent.actor, consent.target]);
    });
  }
  async history(
    authority: ContactAuthority,
    input: { groupId: string; after: number },
  ): Promise<{ events: GroupEvent[]; head: string; revision: number }> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const row = await this.historyState(client, authority, input.groupId);
      const state = groupEvent(row.event);
      const events = await client.query<{ event: unknown }>(
        'SELECT event FROM hash_talk.group_events WHERE group_id=$1 AND revision>$2 ORDER BY revision LIMIT $3',
        [input.groupId, input.after, groupPageSize],
      );
      return {
        events: events.rows.map((r) => groupEvent(r.event)),
        head: row.head,
        revision: state.revision,
      };
    });
  }
  /** Called inside coordinated reads; current participation gates every old period. */
  async allowedPeriods(
    client: pg.PoolClient,
    accountId: string,
    periods: { groupId: string; epoch: number }[],
  ): Promise<Set<string>> {
    if (periods.length > 16)
      throw new AccountError(413, 'Lote de períodos excedido.');
    const rows = await client.query<{
      group_id: string;
      joined: number;
      epoch: number;
    }>(
      'SELECT m.group_id,m.joined,g.epoch FROM hash_talk.group_members m JOIN hash_talk.groups g ON g.id=m.group_id WHERE m.account_id=$1 AND m.group_id=ANY($2::uuid[]) AND NOT g.deleted',
      [accountId, [...new Set(periods.map((p) => p.groupId))]],
    );
    const membership = new Map(rows.rows.map((r) => [r.group_id, r]));
    return new Set(
      periods
        .filter((p) => {
          const member = membership.get(p.groupId);
          return member && p.epoch >= member.joined && p.epoch <= member.epoch;
        })
        .map((p) => `${p.groupId}:${p.epoch}`),
    );
  }
  async directory(
    authority: ContactAuthority,
    input: {
      groupId: string;
      head: string;
      accounts: { accountId: string; after: number }[];
    },
  ): Promise<unknown> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const row = await this.historyState(client, authority, input.groupId);
      if (row.head !== input.head)
        throw new AccountError(409, 'Participação do grupo mudou.');
      const state = groupEvent(row.event),
        current = new Set(state.members.map((m) => m.accountId));
      const historical = await client.query<{ actor: string }>(
        "SELECT DISTINCT event->>'actor' AS actor FROM hash_talk.group_events WHERE group_id=$1 AND event->>'actor'=ANY($2::text[])",
        [input.groupId, input.accounts.map((r) => r.accountId)],
      );
      const allowed = new Set([
        ...current,
        ...historical.rows.map((r) => r.actor),
      ]);
      if (input.accounts.some((r) => !allowed.has(r.accountId))) unavailable();
      const directories = await this.devices.historyBatch(
        client,
        input.accounts,
      );
      const recovery = current.has(authority.session.accountId)
        ? await this.recovery.currentBatch(
            client,
            input.accounts
              .filter((r) => current.has(r.accountId))
              .map((r) => r.accountId),
          )
        : [];
      return { directories, recovery };
    });
  }
  private async historyState(
    client: pg.PoolClient,
    authority: ContactAuthority,
    groupId: string,
  ): Promise<GroupRow> {
    const row = await this.row(client, groupId);
    if (!row) unavailable();
    const state = groupEvent(row.event),
      account = authority.session.accountId;
    if (state.members.some((m) => m.accountId === account)) return row;
    const invitation = await client.query<{ actor: string }>(
      "SELECT actor FROM hash_talk.group_consents WHERE group_id=$1 AND target=$2 AND kind='invite' LIMIT 1",
      [groupId, account],
    );
    const inviter = invitation.rows[0]?.actor;
    if (
      !inviter ||
      !(await this.contacts.messageDeliveryAllowed(client, inviter, account))
    )
      unavailable();
    return row;
  }
  async periods(
    client: pg.PoolClient,
    groupId: string,
    epochs: number[],
  ): Promise<GroupEvent[]> {
    if (epochs.length > 16)
      throw new AccountError(413, 'Lote de períodos excedido.');
    const rows = await client.query<{ event: unknown }>(
      'SELECT event FROM hash_talk.group_events WHERE group_id=$1 AND epoch=ANY($2::integer[]) ORDER BY epoch',
      [groupId, epochs],
    );
    return rows.rows.map((r) => groupEvent(r.event));
  }
}

function changedMembers(
  previous: GroupEvent | null,
  event: GroupEvent,
): string[] {
  const before = previous ? previous.members.map((m) => m.accountId) : [];
  return [...new Set([...before, ...event.members.map((m) => m.accountId)])];
}
