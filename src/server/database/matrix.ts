import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import {
  canonical,
  digest,
  directoryEvent,
} from '../../shared/devices/index.ts';
import { matrixUser } from '../../shared/messages/index.ts';
import type { MatrixBinding } from '../../shared/messages/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import { assertContentCapacity, assertVaultQuota } from './vault-quota.ts';
import { assertGroupContentQuota } from './group-quota.ts';
import type { GroupStore } from './groups.ts';
import {
  assertGroupAccounts,
  queryGroupKeys,
  claimGroupKeys,
  putGroupEnvelopes,
} from './group-matrix.ts';
import type { GroupEnvelope } from './group-matrix.ts';
export interface MatrixUpload {
  binding: MatrixBinding;
  keys: Record<string, Record<string, unknown>>;
  fallback: Record<string, Record<string, unknown>>;
}
/** Matrix-shaped transport only; account consent replaces a homeserver's room ACLs. */
export class MatrixStore {
  private readonly contacts: ContactStore;
  private readonly capacity: number;
  private readonly groups: GroupStore;
  constructor(contacts: ContactStore, capacity: number, groups: GroupStore) {
    this.contacts = contacts;
    this.capacity = capacity;
    this.groups = groups;
  }
  async groupQuery(
    authority: ContactAuthority,
    input: { groupId: string; head: string; accounts: string[] },
  ): Promise<unknown> {
    return this.groups.withGroupAuthority(
      authority,
      input,
      async (client, state) => {
        assertGroupAccounts(state, input.accounts);
        return queryGroupKeys(client, input.accounts);
      },
    );
  }
  async groupClaim(
    authority: ContactAuthority,
    input: {
      groupId: string;
      head: string;
      requests: { account: string; device: string }[];
    },
  ): Promise<unknown> {
    return this.groups.withGroupAuthority(
      authority,
      input,
      async (client, state) => {
        assertGroupAccounts(
          state,
          input.requests.map((r) => r.account),
        );
        return claimGroupKeys(client, input.requests);
      },
    );
  }
  async groupSend(
    authority: ContactAuthority,
    input: {
      groupId: string;
      head: string;
      id: string;
      envelopes: GroupEnvelope[];
    },
  ): Promise<unknown> {
    return this.groups.withGroupAuthority(
      authority,
      input,
      async (client, state) => {
        await putGroupEnvelopes(client, authority, {
          state,
          id: input.id,
          envelopes: input.envelopes,
        });
        await assertGroupContentQuota(client, input.groupId);
        await assertContentCapacity(client, this.capacity);
        this.contacts.changed(client, [
          ...new Set(input.envelopes.map((e) => e.account)),
        ]);
        return {};
      },
    );
  }
  async groupInbox(
    authority: ContactAuthority,
    after: number,
  ): Promise<unknown> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const rows = await client.query<{
        group_id: string;
        epoch: number;
        sequence: string;
        body: unknown;
      }>(
        `SELECT group_id,epoch,sequence::text,body FROM hash_talk.group_matrix_envelopes WHERE account_id=$1 AND device_id=$2 AND sequence>$3 AND body IS NOT NULL ORDER BY sequence LIMIT 16`,
        [authority.session.accountId, authority.session.deviceId, after],
      );
      const allowed = await this.groups.allowedPeriods(
        client,
        authority.session.accountId,
        rows.rows.map((r) => ({ groupId: r.group_id, epoch: r.epoch })),
      );
      const keys = await client.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM hash_talk.matrix_one_time_keys WHERE account_id=$1 AND device_id=$2 AND NOT fallback',
        [authority.session.accountId, authority.session.deviceId],
      );
      return {
        items: rows.rows
          .filter((r) => allowed.has(`${r.group_id}:${r.epoch}`))
          .map((r) => ({ sequence: Number(r.sequence), event: r.body })),
        next:
          rows.rows.length === 16 ? Number(rows.rows.at(-1)?.sequence) : null,
        oneTimeKeys: keys.rows[0]?.count ?? 0,
      };
    });
  }
  async groupReceived(
    authority: ContactAuthority,
    sequences: number[],
  ): Promise<void> {
    await this.contacts.withMessageAuthority(authority, async (client) => {
      await client.query(
        'UPDATE hash_talk.group_matrix_envelopes SET body=NULL,charge=512 WHERE account_id=$1 AND device_id=$2 AND sequence=ANY($3::bigint[]) AND body IS NOT NULL',
        [authority.session.accountId, authority.session.deviceId, sequences],
      );
    });
  }
  private async peerAllowed(
    client: pg.PoolClient,
    authority: ContactAuthority,
    account: string,
  ): Promise<void> {
    if (
      authority.session.accountId !== account &&
      !(await this.contacts.messageDeliveryAllowed(
        client,
        authority.session.accountId,
        account,
      ))
    )
      throw new AccountError(403, 'Contato sem consentimento atual.');
  }
  async upload(
    authority: ContactAuthority,
    input: MatrixUpload,
  ): Promise<unknown> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const { accountId, deviceId } = authority.session;
      const previous = await client.query<{ binding: MatrixBinding }>(
        'SELECT binding FROM hash_talk.matrix_devices WHERE account_id=$1 AND device_id=$2',
        [accountId, deviceId],
      );
      if (
        previous.rows[0] &&
        canonical(previous.rows[0].binding.public) !==
          canonical(input.binding.public)
      )
        throw new AccountError(
          409,
          'Chaves Matrix deste aparelho mudaram. Autorize uma nova identidade de aparelho.',
        );
      await client.query(
        'INSERT INTO hash_talk.matrix_devices(account_id,device_id,binding,charge) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(account_id,device_id) DO UPDATE SET binding=excluded.binding,charge=excluded.charge WHERE hash_talk.matrix_devices.binding<>excluded.binding',
        [
          accountId,
          deviceId,
          JSON.stringify(input.binding),
          Buffer.byteLength(JSON.stringify(input.binding)) + 512,
        ],
      );
      for (const [id, key] of Object.entries(input.keys))
        await this.putKey(client, authority, { id, key, fallback: false });
      await this.uploadFallback(client, authority, input);
      const count = await client.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM hash_talk.matrix_one_time_keys WHERE account_id=$1 AND device_id=$2 AND NOT fallback',
        [accountId, deviceId],
      );
      if ((count.rows[0]?.count ?? 0) > 100)
        throw new AccountError(413, 'Lote de chaves Matrix excedido.');
      await assertVaultQuota(client, accountId);
      await assertContentCapacity(client, this.capacity);
      return {
        one_time_key_counts: { signed_curve25519: count.rows[0]?.count ?? 0 },
      };
    });
  }
  private async uploadFallback(
    client: pg.PoolClient,
    authority: ContactAuthority,
    input: MatrixUpload,
  ): Promise<void> {
    const { accountId, deviceId } = authority.session;
    if (Object.keys(input.fallback).length) {
      await client.query(
        'DELETE FROM hash_talk.matrix_one_time_keys WHERE account_id=$1 AND device_id=$2 AND fallback',
        [accountId, deviceId],
      );
      for (const [id, key] of Object.entries(input.fallback))
        await this.putKey(client, authority, { id, key, fallback: true });
    }
  }
  private async putKey(
    client: pg.PoolClient,
    authority: ContactAuthority,
    input: { id: string; key: Record<string, unknown>; fallback: boolean },
  ): Promise<void> {
    const previous = await client.query<{ body: unknown }>(
      'SELECT body FROM hash_talk.matrix_one_time_keys WHERE account_id=$1 AND device_id=$2 AND id=$3',
      [authority.session.accountId, authority.session.deviceId, input.id],
    );
    if (
      previous.rows[0] &&
      canonical(previous.rows[0].body) !== canonical(input.key)
    )
      throw new AccountError(
        409,
        'Chave descartável repetida com conteúdo diferente.',
      );
    await client.query(
      'INSERT INTO hash_talk.matrix_one_time_keys(account_id,device_id,id,body,fallback,charge) VALUES($1,$2,$3,$4::jsonb,$5,$6) ON CONFLICT DO NOTHING',
      [
        authority.session.accountId,
        authority.session.deviceId,
        input.id,
        JSON.stringify(input.key),
        input.fallback,
        Buffer.byteLength(JSON.stringify(input.key)) + 512,
      ],
    );
  }
  async query(
    authority: ContactAuthority,
    accounts: string[],
  ): Promise<unknown> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const bindings: MatrixBinding[] = [];
      const devices: Record<string, Record<string, unknown>> = {};
      for (const account of accounts) {
        await this.peerAllowed(client, authority, account);
        const result = await client.query<{ binding: MatrixBinding }>(
          `SELECT m.binding FROM hash_talk.matrix_devices m JOIN hash_talk.device_directories d ON d.account_id=m.account_id WHERE m.account_id=$1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.event->'devices') member WHERE member->>'id'=m.device_id::text)`,
          [account],
        );
        const userDevices: Record<string, unknown> = {};
        devices[matrixUser(account)] = userDevices;
        for (const row of result.rows) {
          bindings.push(row.binding);
          userDevices[row.binding.deviceId] = row.binding.public;
        }
      }
      return { bindings, response: { device_keys: devices, failures: {} } };
    });
  }
  async claim(
    authority: ContactAuthority,
    requests: { account: string; device: string }[],
  ): Promise<unknown> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const keys: Record<string, Record<string, unknown>> = {};
      for (const item of requests) {
        await this.peerAllowed(client, authority, item.account);
        const device = await client.query(
          `SELECT 1 FROM hash_talk.device_directories d,jsonb_array_elements(d.event->'devices') member WHERE d.account_id=$1 AND member->>'id'=$2`,
          [item.account, item.device],
        );
        if (!device.rowCount)
          throw new AccountError(403, 'Aparelho destinatário revogado.');
        const result = await client.query<{
          id: string;
          body: unknown;
          fallback: boolean;
        }>(
          'SELECT id,body,fallback FROM hash_talk.matrix_one_time_keys WHERE account_id=$1 AND device_id=$2 ORDER BY fallback,id LIMIT 1 FOR UPDATE',
          [item.account, item.device],
        );
        const key = result.rows[0];
        if (!key) continue;
        const user = matrixUser(item.account);
        keys[user] ??= {};
        keys[user][item.device] = { [key.id]: key.body };
        if (!key.fallback)
          await client.query(
            'DELETE FROM hash_talk.matrix_one_time_keys WHERE account_id=$1 AND device_id=$2 AND id=$3',
            [item.account, item.device, key.id],
          );
      }
      return { one_time_keys: keys, failures: {} };
    });
  }
  async send(
    authority: ContactAuthority,
    id: string,
    envelopes: {
      account: string;
      device: string;
      content: Record<string, unknown>;
    }[],
  ): Promise<unknown> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      await client.query(
        'SELECT id FROM hash_talk.accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [[...new Set(envelopes.map((e) => e.account))].sort()],
      );
      for (const envelope of envelopes)
        await this.admitEnvelope(client, authority, { id, ...envelope });
      await assertContentCapacity(client, this.capacity);
      return {};
    });
  }
  private async admitEnvelope(
    client: pg.PoolClient,
    authority: ContactAuthority,
    input: {
      id: string;
      account: string;
      device: string;
      content: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.peerAllowed(client, authority, input.account);
    await client.query(
      'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
      [input.account],
    );
    const directory = await client.query<{ event: unknown }>(
      'SELECT event FROM hash_talk.device_directories WHERE account_id=$1',
      [input.account],
    );
    const event = directory.rows[0]?.event;
    if (
      !event ||
      !directoryEvent(event).devices.some((d) => d.id === input.device)
    )
      throw new AccountError(403, 'Aparelho destinatário revogado.');
    const body = {
      type: 'm.room.encrypted',
      sender: matrixUser(authority.session.accountId),
      content: input.content,
    };
    const serialized = JSON.stringify(body),
      hash = await digest(canonical(body));
    const binding = await client.query<{ binding: MatrixBinding }>(
      'SELECT binding FROM hash_talk.matrix_devices WHERE account_id=$1 AND device_id=$2',
      [authority.session.accountId, authority.session.deviceId],
    );
    if (
      binding.rows[0]?.binding.public.keys[
        `curve25519:${authority.session.deviceId}`
      ] !== input.content['sender_key']
    )
      throw new AccountError(403, 'Envelope de outra identidade Olm.');
    const previous = await client.query<{ hash: string }>(
      'SELECT hash FROM hash_talk.matrix_envelopes WHERE sender=$1 AND id=$2 AND account_id=$3 AND device_id=$4',
      [authority.session.accountId, input.id, input.account, input.device],
    );
    if (previous.rows[0]) {
      if (previous.rows[0].hash !== hash)
        throw new AccountError(409, 'Envelope repetido divergente.');
      return;
    }
    await client.query(
      'INSERT INTO hash_talk.matrix_envelopes(sender,id,account_id,device_id,body,hash,charge) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',
      [
        authority.session.accountId,
        input.id,
        input.account,
        input.device,
        serialized,
        hash,
        Buffer.byteLength(serialized) + 512,
      ],
    );
    await assertVaultQuota(client, input.account);
  }
  async inbox(authority: ContactAuthority): Promise<unknown> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      const result = await client.query<{ sequence: string; body: unknown }>(
        `SELECT e.sequence::text,e.body FROM hash_talk.matrix_envelopes e WHERE e.account_id=$1 AND e.device_id=$2 AND e.body IS NOT NULL AND (e.sender=$1 OR EXISTS(SELECT 1 FROM hash_talk.contact_relations r WHERE r.lo=least(e.sender,$1::uuid) AND r.hi=greatest(e.sender,$1::uuid) AND r.state='approved')) ORDER BY e.sequence LIMIT 16`,
        [authority.session.accountId, authority.session.deviceId],
      );
      const count = await client.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM hash_talk.matrix_one_time_keys WHERE account_id=$1 AND device_id=$2 AND NOT fallback',
        [authority.session.accountId, authority.session.deviceId],
      );
      return {
        items: result.rows.map((r) => ({
          sequence: Number(r.sequence),
          event: r.body,
        })),
        oneTimeKeys: count.rows[0]?.count ?? 0,
      };
    });
  }
  async received(
    authority: ContactAuthority,
    sequences: number[],
  ): Promise<void> {
    return this.contacts.withMessageAuthority(authority, async (client) => {
      await client.query(
        'UPDATE hash_talk.matrix_envelopes SET body=NULL,charge=512 WHERE account_id=$1 AND device_id=$2 AND sequence=ANY($3::bigint[]) AND body IS NOT NULL',
        [authority.session.accountId, authority.session.deviceId, sequences],
      );
    });
  }
}
