import { admitGroupNotification } from './daily.ts';
import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import {
  groupCanRead,
  groupEventHash,
  groupManager,
} from '../../shared/groups/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import {
  assertGroupPacketPeriod,
  groupKeys,
  groupKeysHash,
  groupPacket,
  verifyGroupKeys,
  verifyGroupPacket,
} from '../../shared/group-messages/index.ts';
import type {
  GroupKeys,
  GroupPacket,
} from '../../shared/group-messages/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { GroupStore } from './groups.ts';
import type { DeviceStore } from './devices.ts';
import type { GroupMediaStore } from './group-media.ts';
import { assertGroupContentQuota, groupTextUsage } from './group-quota.ts';
import { assertContentCapacity } from './vault-quota.ts';

interface PacketRow {
  id: string;
  epoch: number;
  sequence: string;
  hash: string;
  body: unknown;
  deletion: unknown;
  key_hash: string | null;
}
function unavailable(): never {
  throw new AccountError(403, 'Mensagem fora da participação autorizada.');
}
export class GroupMessageStore {
  private readonly contacts: ContactStore;
  private readonly groups: GroupStore;
  private readonly devices: DeviceStore;
  private readonly capacity: number;
  private readonly media: GroupMediaStore;
  constructor(
    contacts: ContactStore,
    groups: GroupStore,
    services: {
      devices: DeviceStore;
      capacity: number;
      media: GroupMediaStore;
    },
  ) {
    this.contacts = contacts;
    this.groups = groups;
    this.devices = services.devices;
    this.capacity = services.capacity;
    this.media = services.media;
  }
  async admit(
    authority: ContactAuthority,
    input: { packet: GroupPacket; keys: GroupKeys | null },
  ): Promise<{ status: 'accepted'; hash: string }> {
    const packet = groupPacket(input.packet),
      hash = await digest(canonical(packet));
    if (packet.sender !== authority.session.accountId) unavailable();
    return this.groups.withGroupMembership(
      authority,
      packet.groupId,
      async (client, state) => {
        const accepted = await this.accepted(client, { packet, hash, state });
        if (accepted) return { status: 'accepted', hash };
        await this.validatePacket(client, authority, { packet, state });
        const bundle = await this.bundle(client, {
          packet,
          provided: input.keys,
        });
        const sender = await this.devices.currentInTransaction(
          client,
          packet.sender,
        );
        await verifyGroupKeys(bundle, sender);
        await assertGroupPacketPeriod(packet, state, bundle);
        await this.checkDestinations(client, bundle);
        await this.media.admit(client, packet);
        await this.saveBundle(client, bundle);
        await this.savePacket(client, { packet, hash, state });
        await admitGroupNotification(client, {
          groupId: packet.groupId,
          sender: packet.sender,
          kind: packet.kind,
          accounts: state.members.map((m) => m.accountId),
        });
        await assertGroupContentQuota(client, packet.groupId);
        await assertContentCapacity(client, this.capacity);
        this.contacts.changed(
          client,
          state.members.map((m) => m.accountId),
        );
        return { status: 'accepted', hash };
      },
    );
  }
  private async accepted(
    client: pg.PoolClient,
    input: { packet: GroupPacket; hash: string; state: GroupEvent },
  ): Promise<boolean> {
    const rows = await client.query<{
      hash: string;
      sender: string;
      group_id: string;
      epoch: number;
    }>(
      'SELECT hash,sender,group_id,epoch FROM hash_talk.group_packets WHERE id=$1',
      [input.packet.id],
    );
    const row = rows.rows[0];
    if (!row) return false;
    if (
      row.hash !== input.hash ||
      row.sender !== input.packet.sender ||
      row.group_id !== input.packet.groupId
    )
      throw new AccountError(409, 'Mensagem de grupo repetida divergente.');
    if (!groupCanRead(input.state, input.packet.sender, row.epoch))
      unavailable();
    return true;
  }
  private async validatePacket(
    client: pg.PoolClient,
    authority: ContactAuthority,
    input: { packet: GroupPacket; state: GroupEvent },
  ): Promise<void> {
    if (
      input.packet.deviceId !== authority.session.deviceId ||
      input.packet.directory !== authority.directory
    )
      unavailable();
    if (
      input.packet.head !== (await groupEventHash(input.state)) ||
      input.packet.epoch !== input.state.epoch
    )
      throw new AccountError(
        409,
        'Participação mudou antes da aceitação. Atualize e cifre novamente.',
      );
    if (
      input.packet.kind === 'profile' &&
      !groupManager(input.state, input.packet.sender)
    )
      unavailable();
    const sender = await this.devices.currentInTransaction(
      client,
      input.packet.sender,
    );
    await verifyGroupPacket(input.packet, sender);
  }
  private async bundle(
    client: pg.PoolClient,
    input: { packet: GroupPacket; provided: GroupKeys | null },
  ): Promise<GroupKeys> {
    if (input.provided) {
      const bundle = groupKeys(input.provided);
      if ((await groupKeysHash(bundle)) !== input.packet.keyHash)
        throw new AccountError(400, 'Referência de recuperação divergente.');
      return bundle;
    }
    const rows = await client.query<{ body: unknown }>(
      'SELECT body FROM hash_talk.group_key_sets WHERE hash=$1',
      [input.packet.keyHash],
    );
    if (!rows.rows[0])
      throw new AccountError(
        409,
        'Envie a recuperação desta sessão antes de continuar.',
      );
    return groupKeys(rows.rows[0].body);
  }
  private async checkDestinations(
    client: pg.PoolClient,
    bundle: GroupKeys,
  ): Promise<void> {
    const requests = bundle.destinations.map((d, index) => ({
      ...d,
      key_id: bundle.archives[index]?.keyId,
    }));
    const rows = await client.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM jsonb_to_recordset($1::jsonb) AS r("accountId" uuid,directory text,"authorityRevision" integer,key_id uuid) JOIN hash_talk.device_directories d ON d.account_id=r."accountId" AND d.head=r.directory AND d.revision=r."authorityRevision" JOIN hash_talk.message_recovery_keys k ON k.account_id=d.account_id AND k.id=r.key_id AND k.epoch=(d.event->>'epoch')::integer`,
      [JSON.stringify(requests)],
    );
    if (rows.rows[0]?.count !== requests.length)
      throw new AccountError(
        409,
        'Diretório ou recuperação de participante mudou. Atualize antes de reenviar.',
      );
  }
  private async saveBundle(
    client: pg.PoolClient,
    bundle: GroupKeys,
  ): Promise<void> {
    const body = JSON.stringify(bundle),
      charge = Buffer.byteLength(body) + 512;
    if (charge > 2_200_000)
      throw new AccountError(413, 'Recuperação de grupo excedida.');
    await client.query(
      'INSERT INTO hash_talk.group_key_sets(hash,group_id,epoch,sender,body,charge) VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT DO NOTHING',
      [
        await groupKeysHash(bundle),
        bundle.groupId,
        bundle.epoch,
        bundle.sender,
        body,
        charge,
      ],
    );
  }
  private async savePacket(
    client: pg.PoolClient,
    input: { packet: GroupPacket; hash: string; state: GroupEvent },
  ): Promise<void> {
    const body = JSON.stringify(input.packet),
      charge = Buffer.byteLength(body) + 512 + input.state.members.length * 16;
    if (charge > 4_300_000)
      throw new AccountError(413, 'Mensagem de grupo excedida.');
    const pending = input.state.members
      .filter((m) => m.accountId !== input.packet.sender)
      .map((m) => m.accountId);
    await client.query(
      'INSERT INTO hash_talk.group_packets(id,group_id,epoch,sender,key_hash,hash,body,charge,pending_accounts,received_accounts) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::uuid[],$10::uuid[])',
      [
        input.packet.id,
        input.packet.groupId,
        input.packet.epoch,
        input.packet.sender,
        input.packet.keyHash,
        input.hash,
        body,
        charge,
        pending,
        [input.packet.sender],
      ],
    );
  }
  async page(
    authority: ContactAuthority,
    input: { groupId: string; head: string; after: number },
  ): Promise<unknown> {
    return this.groups.withGroupAuthority(
      authority,
      input,
      async (client, state) => {
        const joined = state.members.find(
          (m) => m.accountId === authority.session.accountId,
        )?.joined;
        if (!joined) unavailable();
        const rows = await client.query<PacketRow>(
          `WITH candidates AS (SELECT p.*,coalesce(k.charge,0) AS key_charge FROM hash_talk.group_packets p LEFT JOIN hash_talk.group_key_sets k ON k.hash=p.key_hash WHERE p.group_id=$1 AND p.epoch>=$2 AND p.epoch<=$3 AND p.sequence>$4 ORDER BY p.sequence LIMIT 16), charged AS (SELECT *,sum(charge+key_charge) OVER(ORDER BY sequence) AS window_bytes,row_number() OVER(ORDER BY sequence) AS position FROM candidates) SELECT id,epoch,sequence::text,hash,body,deletion,key_hash FROM charged WHERE window_bytes<=8000000 OR position=1 ORDER BY sequence::bigint`,
          [input.groupId, joined, state.epoch, input.after],
        );
        const data = await this.pageContext(client, input.groupId, rows.rows);
        return {
          ...data,
          next: rows.rows.length ? Number(rows.rows.at(-1)?.sequence) : null,
        };
      },
    );
  }
  async acceptedPacket(
    authority: ContactAuthority,
    input: { groupId: string; head: string; id: string; hash: string },
  ): Promise<boolean> {
    return this.groups.withGroupAuthority(authority, input, async (client) => {
      const row = await client.query<{ hash: string }>(
        'SELECT hash FROM hash_talk.group_packets WHERE group_id=$1 AND id=$2 AND sender=$3',
        [input.groupId, input.id, authority.session.accountId],
      );
      if (!row.rows[0]) return false;
      if (row.rows[0].hash !== input.hash)
        throw new AccountError(409, 'Mensagem repetida divergente.');
      return true;
    });
  }
  async recent(
    authority: ContactAuthority,
    input: { groupId: string; head: string; before: number | null },
  ): Promise<unknown> {
    return this.groups.withGroupAuthority(
      authority,
      input,
      async (client, state) => {
        const joined = state.members.find(
          (m) => m.accountId === authority.session.accountId,
        )?.joined;
        const rows = await client.query<PacketRow>(
          `WITH candidates AS (SELECT p.*,coalesce(k.charge,0) AS key_charge FROM hash_talk.group_packets p LEFT JOIN hash_talk.group_key_sets k ON k.hash=p.key_hash WHERE p.group_id=$1 AND p.epoch>=$2 AND p.epoch<=$3 AND ($4::bigint IS NULL OR p.sequence<$4) ORDER BY p.sequence DESC LIMIT 16),charged AS (SELECT *,sum(charge+key_charge) OVER(ORDER BY sequence DESC) AS window_bytes,row_number() OVER(ORDER BY sequence DESC) AS position FROM candidates) SELECT id,epoch,sequence::text,hash,body,deletion,key_hash FROM charged WHERE window_bytes<=8000000 OR position=1 ORDER BY sequence::bigint`,
          [input.groupId, joined, state.epoch, input.before],
        );
        return {
          ...(await this.pageContext(client, input.groupId, rows.rows)),
          next: rows.rows.length ? Number(rows.rows[0]?.sequence) : null,
        };
      },
    );
  }
  async profile(
    authority: ContactAuthority,
    input: { groupId: string; head: string },
  ): Promise<unknown> {
    return this.groups.withGroupAuthority(
      authority,
      input,
      async (client, state) => {
        const joined = state.members.find(
          (m) => m.accountId === authority.session.accountId,
        )?.joined;
        const rows = await client.query<PacketRow>(
          "SELECT id,epoch,sequence::text,hash,body,deletion,key_hash FROM hash_talk.group_packets WHERE group_id=$1 AND epoch>=$2 AND epoch<=$3 AND kind='profile' AND body IS NOT NULL ORDER BY sequence DESC LIMIT 1",
          [input.groupId, joined, state.epoch],
        );
        return this.pageContext(client, input.groupId, rows.rows);
      },
    );
  }
  private async pageContext(
    client: pg.PoolClient,
    groupId: string,
    rows: PacketRow[],
  ) {
    const keys = await client.query<{ body: unknown }>(
      'SELECT body FROM hash_talk.group_key_sets WHERE hash=ANY($1::text[])',
      [[...new Set(rows.map((r) => r.key_hash))]],
    );
    const periods = await this.groups.periods(client, groupId, [
      ...new Set(rows.map((r) => r.epoch)),
    ]);
    const media = await client.query<{ id: string }>(
      "SELECT id FROM hash_talk.group_media WHERE group_id=$1 AND message_id=ANY($2::uuid[]) AND status='accepted'",
      [groupId, rows.map((r) => r.id)],
    );
    const available = new Set(media.rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        id: r.id,
        epoch: r.epoch,
        sequence: Number(r.sequence),
        hash: r.hash,
        packet: r.body,
        deletion: r.deletion,
        unavailableMedia:
          r.body === null
            ? []
            : (groupPacket(r.body).attachments ?? [])
                .filter((ref) => !available.has(ref.id))
                .map((ref) => ref.id),
      })),
      keys: keys.rows.map((r) => groupKeys(r.body)),
      periods,
    };
  }
  async received(
    authority: ContactAuthority,
    input: {
      groupId: string;
      head: string;
      items: { id: string; hash: string }[];
    },
  ): Promise<void> {
    await this.groups.withGroupAuthority(
      authority,
      input,
      async (client, state) => {
        const joined = state.members.find(
          (m) => m.accountId === authority.session.accountId,
        )?.joined;
        if (!joined) unavailable();
        const admitted = await client.query<{ count: number }>(
          `SELECT count(*)::integer AS count FROM hash_talk.group_packets p JOIN jsonb_to_recordset($1::jsonb) AS r(id uuid,hash text) ON p.id=r.id AND p.hash=r.hash WHERE p.group_id=$2 AND p.epoch>=$3 AND p.epoch<=$4 AND ($5::uuid=ANY(p.pending_accounts) OR $5::uuid=ANY(p.received_accounts))`,
          [
            JSON.stringify(input.items),
            input.groupId,
            joined,
            state.epoch,
            authority.session.accountId,
          ],
        );
        if (admitted.rows[0]?.count !== input.items.length) unavailable();
        const result = await client.query<{ sender: string }>(
          `UPDATE hash_talk.group_packets p SET pending_accounts=array_remove(p.pending_accounts,$1::uuid),received_accounts=array_append(p.received_accounts,$1::uuid) FROM jsonb_to_recordset($2::jsonb) AS r(id uuid,hash text) WHERE p.id=r.id AND p.hash=r.hash AND p.group_id=$3 AND p.epoch>=$4 AND p.epoch<=$5 AND $1::uuid=ANY(p.pending_accounts) RETURNING p.sender`,
          [
            authority.session.accountId,
            JSON.stringify(input.items),
            input.groupId,
            joined,
            state.epoch,
          ],
        );
        if (result.rowCount)
          this.contacts.changed(
            client,
            // Only senders' delivery checks changed. Waking every member for
            // every ACK would multiply refreshes by the group's size.
            [...new Set(result.rows.map((row) => row.sender))],
          );
      },
    );
  }
  async usage(
    authority: ContactAuthority,
    input: { groupId: string; head: string },
  ): Promise<{ textBytes: number }> {
    return this.groups.withGroupAuthority(authority, input, async (client) => ({
      textBytes: await groupTextUsage(client, input.groupId),
    }));
  }
}
