import { createHash } from 'node:crypto';
import type pg from 'pg';
import {
  AccountError,
  base64,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { groupCanRead, groupEventHash } from '../../shared/groups/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import {
  groupViewOnceManifest,
  groupViewOnceHash,
  groupViewOnceKeys,
} from '../../shared/group-view-once/index.ts';
import type { GroupViewOnceManifest } from '../../shared/group-view-once/index.ts';
import { viewOnceChunkBytes } from '../../shared/view-once/index.ts';
import type { ContactAuthority } from './contacts.ts';
import type { GroupStore } from './groups.ts';
import type { GroupPacket } from '../../shared/group-messages/index.ts';
import {
  assertGroupContentQuota,
  assertGroupMediaQuota,
} from './group-quota.ts';
import { assertContentCapacity } from './content-capacity.ts';
import type { ContentCapacity } from './content-capacity.ts';

interface Context {
  client: pg.PoolClient;
  state: GroupEvent;
  account: string;
  installed: boolean;
}
interface Payload {
  id: string;
  group_id: string;
  sender: string;
  epoch: number;
  hash: string;
  manifest: GroupViewOnceManifest;
  ciphertext: Buffer;
  ready: boolean;
  attached: boolean;
  expected_bytes: number;
}

/** One shared ciphertext, with a separately consumable wrapped key per member. */
export class GroupViewOnceStore {
  private readonly groups: GroupStore;
  private readonly capacity: ContentCapacity;
  constructor(groups: GroupStore, capacity: ContentCapacity) {
    this.groups = groups;
    this.capacity = capacity;
  }
  operate(
    authority: ContactAuthority,
    operation: string,
    input: Record<string, unknown>,
    installed: boolean,
  ): Promise<unknown> {
    return this.groups.withGroupMembership(
      authority,
      uuid(input['peer']),
      async (client, state) => {
        const context = {
          client,
          state,
          account: authority.session.accountId,
          installed,
        };
        switch (operation) {
          case 'view-once-create':
            return this.create(context, input);
          case 'view-once-part':
            return this.part(context, input);
          case 'view-once-status':
            return this.status(context, input);
          case 'view-once-open':
            return this.open(context, input);
          case 'view-once-cancel':
            return this.cancel(context, input);
          default:
            throw new AccountError(404, 'View-once operation unavailable.');
        }
      },
    );
  }
  private async create(c: Context, input: Record<string, unknown>) {
    keys(input, ['scope', 'peer', 'manifest', 'keys']);
    await this.groups.writable(c.client, c.state.groupId);
    const manifest = groupViewOnceManifest(input['manifest']);
    await this.assertAudience(c, manifest);
    const archives = await groupViewOnceKeys(manifest, input['keys']);
    const hash = await groupViewOnceHash(manifest);
    const previous = await c.client.query<Payload>(
      'SELECT * FROM hash_talk.group_view_once_payloads WHERE id=$1 FOR UPDATE',
      [manifest.id],
    );
    if (previous.rows[0]) {
      const row = previous.rows[0];
      if (row.hash !== hash || row.sender !== c.account)
        throw new AccountError(409, 'View-once identifier already used.');
      return { offset: row.ciphertext.length, ready: row.ready };
    }
    const collision = await c.client.query(
      'SELECT id FROM hash_talk.group_packets WHERE id=$1',
      [manifest.id],
    );
    if (collision.rowCount)
      throw new AccountError(409, 'Message identifier already used.');
    const overhead =
      Buffer.byteLength(JSON.stringify(manifest)) +
      Buffer.byteLength(JSON.stringify(archives)) +
      archives.length * 512 +
      1024;
    const media = inputMedia(manifest);
    await c.client.query(
      `INSERT INTO hash_talk.group_view_once_payloads(id,group_id,sender,epoch,hash,manifest,expected_bytes,charge,text_charge,media_bytes) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,
      [
        manifest.id,
        c.state.groupId,
        c.account,
        manifest.epoch,
        hash,
        JSON.stringify(manifest),
        manifest.bytes,
        manifest.bytes + overhead,
        overhead + (media ? 0 : manifest.bytes),
        media ? manifest.bytes : 0,
      ],
    );
    await c.client.query(
      `INSERT INTO hash_talk.group_view_once_deliveries(message_id,account_id,key) SELECT $1,(r->>'accountId')::uuid,r FROM jsonb_array_elements($2::jsonb) r`,
      [manifest.id, JSON.stringify(archives)],
    );
    await this.quota(c);
    return { offset: 0, ready: false };
  }
  private async assertAudience(
    c: Context,
    manifest: GroupViewOnceManifest,
  ): Promise<void> {
    if (
      manifest.sender !== c.account ||
      manifest.recipient !== c.state.groupId ||
      manifest.epoch !== c.state.epoch ||
      manifest.head !== (await groupEventHash(c.state))
    )
      throw new AccountError(409, 'Group membership changed.');
    const audience = c.state.members
      .filter((m) => m.accountId !== c.account)
      .map((m) => m.accountId)
      .sort();
    if (
      JSON.stringify(audience) !==
      JSON.stringify(manifest.recipients.map((r) => r.accountId).sort())
    )
      throw new AccountError(400, 'Invalid group audience.');
  }
  private async quota(c: Context): Promise<void> {
    await assertContentCapacity(c.client, this.capacity);
    await assertGroupContentQuota(c.client, c.state.groupId);
    await assertGroupMediaQuota(c.client, c.state.groupId);
  }
  private async row(
    c: Context,
    input: Record<string, unknown>,
  ): Promise<Payload> {
    const result = await c.client.query<Payload>(
      'SELECT * FROM hash_talk.group_view_once_payloads WHERE id=$1 AND group_id=$2 FOR UPDATE',
      [uuid(input['id']), c.state.groupId],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.hash !== fingerprint(input['hash']) ||
      !groupCanRead(c.state, c.account, row.epoch)
    )
      throw new AccountError(410, 'This view-once message is unavailable.');
    return row;
  }
  private async part(c: Context, input: Record<string, unknown>) {
    keys(input, ['scope', 'peer', 'id', 'hash', 'offset', 'bytes']);
    await this.groups.writable(c.client, c.state.groupId);
    const row = await this.row(c, input),
      offset = integer(input['offset'], row.expected_bytes),
      bytes = Buffer.from(base64(input['bytes'], viewOnceChunkBytes));
    if (row.sender !== c.account || !bytes.length)
      throw new AccountError(403, 'View-once upload is not authorized.');
    if (offset < row.ciphertext.length) {
      if (!row.ciphertext.subarray(offset, offset + bytes.length).equals(bytes))
        throw new AccountError(409, 'Concurrent view-once upload differs.');
      return { offset: row.ciphertext.length, ready: row.ready };
    }
    if (
      row.attached ||
      offset !== row.ciphertext.length ||
      offset + bytes.length > row.expected_bytes
    )
      throw new AccountError(409, 'View-once upload offset differs.');
    const ciphertext = Buffer.concat([row.ciphertext, bytes]),
      ready = ciphertext.length === row.expected_bytes;
    if (
      ready &&
      createHash('sha256').update(ciphertext).digest('hex') !==
        row.manifest.hash
    )
      throw new AccountError(400, 'View-once upload hash differs.');
    await c.client.query(
      'UPDATE hash_talk.group_view_once_payloads SET ciphertext=$2,ready=$3 WHERE id=$1',
      [row.id, ciphertext, ready],
    );
    return { offset: ciphertext.length, ready };
  }
  private async delivery(c: Context, input: Record<string, unknown>) {
    const row = await this.row(c, input);
    const result = await c.client.query<{
      key: unknown;
      consumed_at: Date | null;
    }>(
      'SELECT key,consumed_at FROM hash_talk.group_view_once_deliveries WHERE message_id=$1 AND account_id=$2 FOR UPDATE',
      [row.id, c.account],
    );
    const delivery = result.rows[0];
    if (!delivery)
      throw new AccountError(410, 'This view-once message is unavailable.');
    if (row.attached) {
      const parent = await c.client.query(
        "SELECT id FROM hash_talk.group_packets WHERE id=$1 AND group_id=$2 AND body->'viewOnce'->>'hash'=$3",
        [row.id, c.state.groupId, row.hash],
      );
      if (parent.rowCount !== 1)
        throw new AccountError(410, 'This view-once message is unavailable.');
    }
    return { row, delivery };
  }
  private async status(c: Context, input: Record<string, unknown>) {
    keys(input, ['scope', 'peer', 'id', 'hash']);
    const { row, delivery } = await this.delivery(c, input);
    return {
      consumed: delivery.consumed_at !== null,
      ready: row.ready && row.attached,
      keyId: delivery.key ? object(delivery.key)['keyId'] : null,
    };
  }
  private async open(c: Context, input: Record<string, unknown>) {
    keys(input, ['scope', 'peer', 'id', 'hash']);
    const { row, delivery } = await this.delivery(c, input);
    if (!row.attached || !row.ready)
      throw new AccountError(410, 'This view-once message is unavailable.');
    if (row.manifest.policy === 'mobile' && !c.installed)
      throw new AccountError(
        403,
        'Open this view-once message in the mobile app.',
      );
    if (!delivery.key || delivery.consumed_at)
      throw new AccountError(410, 'This view-once message was already opened.');
    const { recipients, epoch, head, media, ...identity } = row.manifest;
    void recipients;
    void epoch;
    void head;
    void media;
    const response = {
      header: { ...identity, key: delivery.key },
      manifest: row.manifest,
      bytes: row.ciphertext.toString('base64'),
    };
    await c.client.query(
      'UPDATE hash_talk.group_view_once_deliveries SET key=NULL,consumed_at=clock_timestamp() WHERE message_id=$1 AND account_id=$2',
      [row.id, c.account],
    );
    await c.client.query(
      `UPDATE hash_talk.group_view_once_payloads SET ciphertext=''::bytea,charge=octet_length(manifest::text)+1024,text_charge=octet_length(manifest::text)+1024,media_bytes=0 WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM hash_talk.group_view_once_deliveries WHERE message_id=$1 AND consumed_at IS NULL)`,
      [row.id],
    );
    return response;
  }
  private async cancel(c: Context, input: Record<string, unknown>) {
    keys(input, ['scope', 'peer', 'id', 'hash']);
    const row = await this.row(c, input);
    if (row.sender !== c.account || row.attached)
      throw new AccountError(
        409,
        'A published view-once message cannot be canceled as an upload.',
      );
    await c.client.query(
      'DELETE FROM hash_talk.group_view_once_payloads WHERE id=$1',
      [row.id],
    );
    return { canceled: true };
  }
}
function inputMedia(manifest: GroupViewOnceManifest): boolean {
  return manifest.media;
}

export async function attachGroupViewOnce(
  client: Pick<pg.PoolClient, 'query'>,
  packet: GroupPacket,
): Promise<void> {
  if (!packet.viewOnce) return;
  const row = await client.query(
    `UPDATE hash_talk.group_view_once_payloads SET attached=true,ciphertext=CASE WHEN jsonb_array_length(manifest->'recipients')=0 THEN ''::bytea ELSE ciphertext END,charge=CASE WHEN jsonb_array_length(manifest->'recipients')=0 THEN octet_length(manifest::text)+1024 ELSE charge END,text_charge=CASE WHEN jsonb_array_length(manifest->'recipients')=0 THEN octet_length(manifest::text)+1024 ELSE text_charge END,media_bytes=CASE WHEN jsonb_array_length(manifest->'recipients')=0 THEN 0 ELSE media_bytes END WHERE id=$1 AND group_id=$2 AND sender=$3 AND epoch=$4 AND hash=$5 AND ready RETURNING id`,
    [
      packet.id,
      packet.groupId,
      packet.sender,
      packet.epoch,
      packet.viewOnce.hash,
    ],
  );
  if (row.rowCount !== 1)
    throw new AccountError(
      409,
      'The view-once upload is incomplete or unavailable.',
    );
}
