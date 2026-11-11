import type { GroupViewOnceStore } from './group-view-once.ts';
import { createHash } from 'node:crypto';
import type pg from 'pg';
import {
  AccountError,
  base64,
  keys,
  uuid,
} from '../../shared/account/index.ts';
import { digest, fingerprint } from '../../shared/devices/index.ts';
import type { MessagePacket } from '../../shared/messages/index.ts';
import { integer } from '../../shared/vault/index.ts';
import {
  viewOnceChunkBytes,
  viewOnceHeader,
  viewOnceHeaderBody,
  viewOnceScope,
} from '../../shared/view-once/index.ts';
import type {
  ViewOnceScope,
  ViewOnceHeader,
} from '../../shared/view-once/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import type { SocialDmStore } from './social-dm.ts';
import type { PublicProfileStore } from './public-profile.ts';
import { assertContentCapacity } from './content-capacity.ts';
import type { ContentCapacity } from './content-capacity.ts';
import { assertVaultQuota } from './vault-quota.ts';

interface Context {
  client: pg.PoolClient;
  scope: ViewOnceScope;
  actor: string;
  peer: string;
  account: string;
  peerAccount: string;
  installed: boolean;
}
interface PayloadRow {
  id: string;
  hash: string;
  scope: ViewOnceScope;
  policy: 'mobile' | 'file';
  sender: string;
  recipient: string;
  sender_actor: string;
  recipient_actor: string;
  expected_bytes: number;
  header: ViewOnceHeader | null;
  ciphertext: Buffer;
  ready: boolean;
  attached: boolean;
  consumed_at: Date | null;
}

export async function attachViewOncePayload(
  client: pg.PoolClient,
  packet: MessagePacket,
  scope: ViewOnceScope,
): Promise<void> {
  if (!packet.viewOnce) return;
  const found = await client.query(
    `UPDATE hash_talk.view_once_payloads SET attached=true
      WHERE id=$1 AND scope=$2 AND sender_actor=$3 AND recipient_actor=$4
      AND hash=$5 AND ready AND consumed_at IS NULL RETURNING id`,
    [packet.id, scope, packet.sender, packet.recipient, packet.viewOnce.hash],
  );
  if (found.rowCount !== 1)
    throw new AccountError(
      409,
      'The view-once upload is incomplete or unavailable.',
    );
}

/** Payloads never join message history, attachment exports or recovery pages. */
export class ViewOnceStore {
  private groups: GroupViewOnceStore | null = null;
  setGroups(groups: GroupViewOnceStore): void {
    this.groups = groups;
  }
  private readonly contacts: ContactStore;
  private readonly social: SocialDmStore;
  private readonly profiles: PublicProfileStore;
  private readonly capacity: ContentCapacity;
  constructor(
    contacts: ContactStore,
    social: SocialDmStore,
    profiles: PublicProfileStore,
    capacity: ContentCapacity,
  ) {
    this.contacts = contacts;
    this.social = social;
    this.profiles = profiles;
    this.capacity = capacity;
  }

  operate(
    authority: ContactAuthority,
    operation: string,
    input: Record<string, unknown>,
    installed: boolean,
  ): Promise<unknown> {
    const scope = viewOnceScope(input['scope']);
    if (scope === 'group') {
      if (!this.groups)
        throw new AccountError(503, 'Group delivery unavailable.');
      return this.groups.operate(authority, operation, input, installed);
    }
    const peer = uuid(input['peer']);
    const actions: Record<string, (context: Context) => Promise<unknown>> = {
      'view-once-create': (context) => this.create(context, input),
      'view-once-part': (context) => this.part(context, input),
      'view-once-open': (context) => this.open(context, input),
      'view-once-status': (context) => this.status(context, input),
      'view-once-cancel': (context) => this.cancel(context, input),
    };
    const action = Object.hasOwn(actions, operation)
      ? actions[operation]
      : undefined;
    if (!action)
      throw new AccountError(404, 'View-once operation unavailable.');
    if (scope === 'private')
      return this.contacts.withMessageConsent(authority, peer, (client) =>
        action({
          client,
          scope,
          actor: authority.session.accountId,
          peer,
          account: authority.session.accountId,
          peerAccount: peer,
          installed,
        }),
      );
    return this.social.withConversationAuthority(
      authority,
      peer,
      async (context) => {
        await this.social.requireConversation(context, peer);
        return action({
          client: context.client,
          scope,
          actor: context.actor.id,
          peer,
          account: authority.session.accountId,
          peerAccount: await this.profiles.accountFor(context.client, peer),
          installed,
        });
      },
    );
  }

  private async create(context: Context, input: Record<string, unknown>) {
    keys(input, ['scope', 'peer', 'header']);
    const header = viewOnceHeader(input['header']);
    this.assertHeader(context, header);
    const hash = await digest(viewOnceHeaderBody(header));
    const previous = await context.client.query<PayloadRow>(
      'SELECT * FROM hash_talk.view_once_payloads WHERE id=$1 FOR UPDATE',
      [header.id],
    );
    const old = previous.rows[0];
    if (old) {
      this.assertAudience(context, old);
      if (old.sender !== context.account || old.hash !== hash)
        throw new AccountError(409, 'View-once identifier already used.');
      if (old.consumed_at)
        throw new AccountError(
          410,
          'This view-once message was already opened.',
        );
      return { offset: old.ciphertext.length, ready: old.ready };
    }
    const collision = await context.client.query(
      'SELECT id FROM hash_talk.message_packets WHERE id=$1 UNION ALL SELECT id FROM hash_talk.social_messages WHERE id=$1',
      [header.id],
    );
    if (collision.rowCount)
      throw new AccountError(409, 'Message identifier already used.');
    const charge =
      header.bytes + Buffer.byteLength(JSON.stringify(header)) + 1024;
    await context.client.query(
      `INSERT INTO hash_talk.view_once_payloads
        (id,scope,policy,sender,recipient,sender_actor,recipient_actor,hash,header,
         expected_bytes,charge,sender_charge,recipient_charge)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$11,$11)`,
      [
        header.id,
        context.scope,
        header.policy,
        context.account,
        context.peerAccount,
        context.actor,
        context.peer,
        hash,
        JSON.stringify(header),
        header.bytes,
        charge,
      ],
    );
    await assertContentCapacity(context.client, this.capacity);
    await assertVaultQuota(context.client, context.account);
    await assertVaultQuota(context.client, context.peerAccount);
    return { offset: 0, ready: false };
  }

  private assertHeader(context: Context, header: ViewOnceHeader): void {
    if (
      header.scope !== context.scope ||
      header.sender !== context.actor ||
      header.recipient !== context.peer ||
      (context.scope === 'public' && header.bytes > 4_100_000)
    )
      throw new AccountError(
        400,
        'View-once package differs from its conversation.',
      );
  }

  private assertAudience(context: Context, row: PayloadRow): void {
    const sender =
      row.sender === context.account &&
      row.sender_actor === context.actor &&
      row.recipient === context.peerAccount &&
      row.recipient_actor === context.peer;
    const recipient =
      row.recipient === context.account &&
      row.recipient_actor === context.actor &&
      row.sender === context.peerAccount &&
      row.sender_actor === context.peer;
    if (row.scope !== context.scope || (!sender && !recipient))
      throw new AccountError(404, 'View-once message unavailable.');
  }

  private async row(context: Context, id: string): Promise<PayloadRow> {
    const result = await context.client.query<PayloadRow>(
      'SELECT * FROM hash_talk.view_once_payloads WHERE id=$1 FOR UPDATE',
      [id],
    );
    const row = result.rows[0];
    if (!row)
      throw new AccountError(410, 'This view-once message is unavailable.');
    this.assertAudience(context, row);
    return row;
  }

  private async part(context: Context, input: Record<string, unknown>) {
    keys(input, ['scope', 'peer', 'id', 'hash', 'offset', 'bytes']);
    const row = await this.row(context, uuid(input['id']));
    const offset = integer(input['offset'], row.expected_bytes);
    const bytes = Buffer.from(base64(input['bytes'], viewOnceChunkBytes));
    if (
      !bytes.length ||
      row.sender !== context.account ||
      row.hash !== fingerprint(input['hash'])
    )
      throw new AccountError(403, 'View-once upload is not authorized.');
    if (row.consumed_at)
      throw new AccountError(410, 'This view-once message was already opened.');
    await assertContentCapacity(context.client, this.capacity);
    const combined = this.appendPart(row, offset, bytes);
    const ready = combined.length === row.expected_bytes;
    await context.client.query(
      'UPDATE hash_talk.view_once_payloads SET ciphertext=$2,ready=$3 WHERE id=$1',
      [row.id, combined, ready],
    );
    return { offset: combined.length, ready };
  }

  private appendPart(row: PayloadRow, offset: number, bytes: Buffer): Buffer {
    if (offset < row.ciphertext.length) {
      if (!row.ciphertext.subarray(offset, offset + bytes.length).equals(bytes))
        throw new AccountError(409, 'Concurrent view-once upload differs.');
      return row.ciphertext;
    }
    if (
      row.attached ||
      offset !== row.ciphertext.length ||
      offset + bytes.length > row.expected_bytes
    )
      throw new AccountError(409, 'View-once upload offset differs.');
    const combined = Buffer.concat([row.ciphertext, bytes]);
    const ready = combined.length === row.expected_bytes;
    if (
      ready &&
      createHash('sha256').update(combined).digest('hex') !== row.header?.hash
    )
      throw new AccountError(400, 'View-once upload hash differs.');
    return combined;
  }

  private async parent(
    context: Context,
    id: string,
    hash: string,
  ): Promise<void> {
    const table =
      context.scope === 'private' ? 'message_packets' : 'social_messages';
    const result = await context.client.query(
      `SELECT id FROM hash_talk.${table} WHERE id=$1 AND sender=$2 AND recipient=$3
        AND body->'viewOnce'->>'hash'=$4
        AND NOT EXISTS (SELECT 1 FROM hash_talk.personal_removals
          WHERE account_id=$5 AND kind=$6 AND id=$1)
        FOR SHARE`,
      [
        id,
        context.peer,
        context.actor,
        hash,
        context.account,
        context.scope === 'private' ? 'message' : 'dm-message',
      ],
    );
    if (result.rowCount !== 1)
      throw new AccountError(410, 'This view-once message is unavailable.');
  }

  private async open(context: Context, input: Record<string, unknown>) {
    keys(input, ['scope', 'peer', 'id', 'hash']);
    const id = uuid(input['id']);
    const hash = fingerprint(input['hash']);
    await this.parent(context, id, hash);
    const row = await this.row(context, id);
    if (
      row.hash !== hash ||
      row.recipient !== context.account ||
      !row.ready ||
      !row.attached
    )
      throw new AccountError(404, 'View-once message unavailable.');
    if (row.policy === 'mobile' && !context.installed)
      throw new AccountError(
        403,
        'Open this view-once message in the mobile app.',
      );
    if (row.consumed_at || !row.header)
      throw new AccountError(410, 'This view-once message was already opened.');
    const result = {
      header: row.header,
      bytes: row.ciphertext.toString('base64'),
    };
    await context.client.query(
      `UPDATE hash_talk.view_once_payloads SET consumed_at=clock_timestamp(),
        header=NULL,ciphertext=''::bytea,charge=512,sender_charge=256,recipient_charge=256 WHERE id=$1`,
      [id],
    );
    return result;
  }

  private async status(context: Context, input: Record<string, unknown>) {
    keys(input, ['scope', 'peer', 'id', 'hash']);
    const row = await this.row(context, uuid(input['id']));
    if (row.hash !== fingerprint(input['hash']))
      throw new AccountError(404, 'View-once message unavailable.');
    return {
      consumed: row.consumed_at !== null,
      ready: row.ready && row.attached,
      keyId: row.header?.key.keyId ?? null,
    };
  }
  clean(): Promise<unknown> {
    return this.contacts.withMaintenance((client) =>
      client.query(
        `WITH groups AS (DELETE FROM hash_talk.group_view_once_payloads WHERE id IN (SELECT id FROM hash_talk.group_view_once_payloads WHERE NOT attached AND created_at < clock_timestamp()-interval '24 hours' ORDER BY created_at LIMIT 64)) DELETE FROM hash_talk.view_once_payloads
        WHERE id IN (SELECT id FROM hash_talk.view_once_payloads WHERE NOT attached AND created_at < clock_timestamp()-interval '24 hours' ORDER BY created_at LIMIT 64)`,
      ),
    );
  }

  private async cancel(context: Context, input: Record<string, unknown>) {
    keys(input, ['scope', 'peer', 'id', 'hash']);
    const row = await this.row(context, uuid(input['id']));
    if (
      row.sender !== context.account ||
      row.hash !== fingerprint(input['hash']) ||
      row.attached
    )
      throw new AccountError(
        409,
        'A published view-once message cannot be canceled as an upload.',
      );
    await context.client.query(
      'DELETE FROM hash_talk.view_once_payloads WHERE id=$1',
      [row.id],
    );
    return { canceled: true };
  }
}
