import type pg from 'pg';
import {
  AccountError,
  base64,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import { bytesHash, integer } from '../../shared/vault/index.ts';
import type { BackupTarget } from '../../shared/backups/index.ts';
import type { ContactAuthority } from './contacts.ts';
import type { PublicProfileStore } from './public-profile.ts';
import type { SocialContext, SocialDmStore } from './social-dm.ts';
import type {
  MessagePacket,
  RecoveryKey,
} from '../../shared/messages/index.ts';

export interface SocialSnapshot {
  anchor: number;
  removals: number;
  directory: string;
  profile: string;
}
export class SocialHistoryStore {
  private readonly social: SocialDmStore;
  private readonly profiles: PublicProfileStore;
  constructor(social: SocialDmStore, profiles: PublicProfileStore) {
    this.social = social;
    this.profiles = profiles;
  }
  async secret(a: ContactAuthority, raw?: unknown) {
    return this.social.withActor(a, async (context) => {
      if (raw !== undefined) {
        const body = object(raw);
        keys(body, ['id', 'epoch', 'hash', 'bytes', 'ciphertext']);
        uuid(body['id']);
        integer(body['epoch'], 128);
        fingerprint(body['hash']);
        const ciphertext = base64(body['ciphertext'], 2048);
        if (
          ciphertext.length < 29 ||
          body['bytes'] !== ciphertext.length ||
          (await bytesHash(ciphertext)) !== body['hash']
        )
          throw new AccountError(400, 'Cápsula de identidade de DM inválida.');
        const text = JSON.stringify(body);
        await context.client.query(
          'INSERT INTO hash_talk.social_personal_secrets(profile_id,body,charge) VALUES($1,$2::jsonb,$3) ON CONFLICT DO NOTHING',
          [context.actor.id, text, Buffer.byteLength(text) + 512],
        );
        await this.social.limits(context);
      }
      const rows = await context.client.query<{ body: unknown }>(
        'SELECT body FROM hash_talk.social_personal_secrets WHERE profile_id=$1',
        [context.actor.id],
      );
      return rows.rows[0]?.body ?? null;
    });
  }
  async snapshot(a: ContactAuthority): Promise<SocialSnapshot | null> {
    if (!(await this.social.optionalProfile(a))) return null;
    return this.social.withActor(a, async (context) => {
      const rows = await context.client.query<{
        anchor: string;
        removals: string;
      }>(
        `SELECT coalesce((SELECT max(sequence) FROM hash_talk.social_messages WHERE sender=$1 OR recipient=$1),0)::text AS anchor,(SELECT count(*) FROM hash_talk.personal_removals WHERE account_id=$2 AND kind='dm-message')::text AS removals`,
        [context.actor.id, a.session.accountId],
      );
      return {
        anchor: Number(rows.rows[0]?.anchor ?? 0),
        removals: Number(rows.rows[0]?.removals ?? 0),
        directory: a.directory,
        profile: context.actor.id,
      };
    });
  }
  private async stable(
    context: SocialContext,
    snapshot: SocialSnapshot,
  ): Promise<void> {
    const count = await context.client.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='dm-message'",
      [context.authority.session.accountId],
    );
    if (
      snapshot.directory !== context.authority.directory ||
      snapshot.profile !== context.actor.id ||
      Number(count.rows[0]?.n) !== snapshot.removals
    )
      throw new AccountError(
        409,
        'Histórico de DMs mudou durante a leitura. Retome a sincronização.',
      );
  }
  async page(
    a: ContactAuthority,
    input: { snapshot: SocialSnapshot; after: number },
  ) {
    return this.social.withActor(a, async (context) => {
      await this.stable(context, input.snapshot);
      const rows = await context.client.query<{
        id: string;
        hash: string;
        sequence: string;
        body: MessagePacket;
        received: boolean;
      }>(
        `WITH bounded AS (
        SELECT m.* FROM hash_talk.social_messages m WHERE (sender=$1 OR recipient=$1) AND sequence>$2 AND sequence<=$3 AND body IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals r WHERE r.account_id=$4 AND r.kind='dm-message' AND r.id=m.id) ORDER BY sequence LIMIT 16
      ), candidates AS (
        SELECT id,hash,sequence,body,EXISTS(SELECT 1 FROM hash_talk.social_receipts r WHERE r.message_id=m.id AND r.profile_id=$1 AND r.device_id=$5 AND r.received) AS received,sum(charge) OVER(ORDER BY sequence) AS total,row_number() OVER(ORDER BY sequence) AS position
        FROM bounded m
      ) SELECT id,hash,sequence::text,body,received FROM candidates WHERE total<=8000000 OR position=1 ORDER BY sequence LIMIT 16`,
        [
          context.actor.id,
          input.after,
          input.snapshot.anchor,
          a.session.accountId,
          a.session.deviceId,
        ],
      );
      const allowed = await this.social.deliveryBatch(
        context,
        rows.rows.map((row) =>
          row.body.sender === context.actor.id
            ? row.body.recipient
            : row.body.sender,
        ),
      );
      const canRead = (row: (typeof rows.rows)[number]) =>
        row.received ||
        allowed.has(
          row.body.sender === context.actor.id
            ? row.body.recipient
            : row.body.sender,
        );
      const last = rows.rows.at(-1),
        next = last ? Number(last.sequence) : null;
      const recovery = await context.client.query<{ body: RecoveryKey }>(
        'SELECT body FROM hash_talk.social_recovery WHERE profile_id=$1 AND id=ANY($2::uuid[])',
        [
          context.actor.id,
          rows.rows
            .filter(canRead)
            .flatMap((r) =>
              r.body.archives
                .filter((k) => k.accountId === context.actor.id)
                .map((k) => k.keyId),
            ),
        ],
      );
      const authors = await this.profiles.identities(
        context.client,
        rows.rows.flatMap((r) => [r.body.sender, r.body.recipient]),
      );
      return {
        items: rows.rows.map((row) => ({
          id: row.id,
          hash: row.hash,
          sequence: Number(row.sequence),
          ...(canRead(row) ? { packet: row.body } : { unavailable: 423 }),
        })),
        recovery: recovery.rows.map((r) => r.body),
        profiles: [...authors.values()],
        next,
      };
    });
  }
  async history(
    a: ContactAuthority,
    input: { message: string; after: number },
  ) {
    return this.social.withActor(a, async (context) => {
      const owned = await this.owned(context.client, a, input.message);
      const through = owned.body.senderRevision;
      const rows = await context.client.query<{ body: DirectoryEvent }>(
        'SELECT body FROM hash_talk.social_directories WHERE profile_id=$1 AND revision>$2 AND revision<=$3 ORDER BY revision LIMIT 8',
        [owned.sender, input.after, through],
      );
      return {
        profile: owned.sender,
        through,
        events: rows.rows.map((r) => r.body),
      };
    });
  }
  private async participant(c: pg.PoolClient, account: string, id: string) {
    const actor = await this.profiles.identity(c, account);
    const rows = await c.query<{
      hash: string;
      sender: string;
      recipient: string;
      body: MessagePacket | null;
    }>(
      "SELECT hash,sender,recipient,body FROM hash_talk.social_messages WHERE id=$1 AND (sender=$2 OR recipient=$2) AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals r WHERE r.account_id=$3 AND r.kind='dm-message' AND r.id=$1)",
      [id, actor.id, account],
    );
    const row = rows.rows[0];
    if (!row?.body)
      throw new AccountError(
        410,
        'Mensagem de DM indisponível no cofre pessoal.',
      );
    return { ...row, body: row.body, actor: actor.id };
  }
  async owned(c: pg.PoolClient, a: ContactAuthority, id: string) {
    const row = await this.participant(c, a.session.accountId, id);
    const prior = await c.query(
      'SELECT 1 FROM hash_talk.social_receipts WHERE message_id=$1 AND profile_id=$2 AND device_id=$3 AND received',
      [id, row.actor, a.session.deviceId],
    );
    if (!prior.rowCount) {
      const allowed = await this.social.withDeliveryClient(
        c,
        a,
        row.actor === row.sender ? row.recipient : row.sender,
      );
      if (!allowed)
        throw new AccountError(
          423,
          'Entrega de DM suspensa. É necessário novo consentimento.',
        );
    }
    return row;
  }
  async received(
    a: ContactAuthority,
    items: { id: string; hash: string }[],
  ): Promise<void> {
    await this.social.withActor(a, async (context) => {
      for (const item of items) {
        const row = await this.owned(context.client, a, item.id);
        if (row.hash !== item.hash)
          throw new AccountError(409, 'Confirmação de DM divergente.');
        await context.client.query(
          'INSERT INTO hash_talk.social_receipts(message_id,profile_id,device_id,received) VALUES($1,$2,$3,true) ON CONFLICT(message_id,profile_id,device_id) DO UPDATE SET received=true WHERE NOT hash_talk.social_receipts.received',
          [item.id, context.actor.id, a.session.deviceId],
        );
      }
      await this.social.limits(context);
    });
  }
  async clean(
    c: pg.PoolClient,
    account: string,
    item: BackupTarget,
  ): Promise<number> {
    const row = await this.participant(c, account, item.id);
    if (row.hash !== item.hash)
      throw new AccountError(
        409,
        'Mensagem de DM divergente da seleção de limpeza.',
      );
    await c.query(
      'UPDATE hash_talk.social_messages SET sender_charge=CASE WHEN sender=$2 THEN 0 ELSE sender_charge END,recipient_charge=CASE WHEN recipient=$2 THEN 0 ELSE recipient_charge END WHERE id=$1',
      [item.id, row.actor],
    );
    await c.query(
      'UPDATE hash_talk.social_media SET sender_charge=CASE WHEN sender=$2 THEN 0 ELSE sender_charge END,recipient_charge=CASE WHEN recipient=$2 THEN 0 ELSE recipient_charge END WHERE message_id=$1',
      [item.id, row.actor],
    );
    await c.query(
      'DELETE FROM hash_talk.social_receipts WHERE message_id=$1 AND profile_id=$2',
      [item.id, row.actor],
    );
    return 0;
  }
  async collect(c: pg.PoolClient, id: string): Promise<void> {
    const row = await c.query<{ sender: string; recipient: string }>(
      'SELECT sender,recipient FROM hash_talk.social_messages WHERE id=$1',
      [id],
    );
    const message = row.rows[0];
    if (!message) return;
    const accounts = await Promise.all(
      [message.sender, message.recipient].map((profile) =>
        this.profiles.accountFor(c, profile),
      ),
    );
    const cleared = await c.query(
      "UPDATE hash_talk.social_messages m SET body=NULL,personal_collected=true,charge=512 WHERE id=$1 AND body IS NOT NULL AND (SELECT count(*) FROM hash_talk.personal_removals r WHERE r.kind='dm-message' AND r.id=m.id AND r.account_id=ANY($2::uuid[]))=2",
      [id, accounts],
    );
    if (cleared.rowCount)
      await c.query(
        "UPDATE hash_talk.social_media SET status='deleting',writer=NULL WHERE message_id=$1 AND status='accepted'",
        [id],
      );
  }
}
