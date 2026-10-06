import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import {
  canonical,
  digest,
  directoryEvent,
  eventHash,
  verifyTransition,
} from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import {
  verifyPacket,
  verifyRecoveryKey,
} from '../../shared/messages/index.ts';
import type {
  MessagePacket,
  RecoveryKey,
} from '../../shared/messages/index.ts';
import { socialDirectory, socialPacket } from '../../shared/social-dm/index.ts';
import type { ContactAuthority } from './contacts.ts';
import type { PublicProfileStore } from './public-profile.ts';
import type { SocialMediaStore } from './social-media.ts';
import type { SocialContext, SocialDmStore } from './social-dm.ts';

export class SocialCryptoStore {
  private readonly social: SocialDmStore;
  private readonly profiles: PublicProfileStore;
  private media: SocialMediaStore | null = null;
  constructor(social: SocialDmStore, profiles: PublicProfileStore) {
    this.social = social;
    this.profiles = profiles;
  }
  setMedia(media: SocialMediaStore): void {
    this.media = media;
  }
  async current(
    client: pg.PoolClient,
    profile: string,
  ): Promise<DirectoryEvent | null> {
    const result = await client.query<{ body: DirectoryEvent }>(
      'SELECT body FROM hash_talk.social_directories WHERE profile_id=$1 ORDER BY revision DESC LIMIT 1',
      [profile],
    );
    return result.rows[0]?.body ?? null;
  }
  async activeDevices(
    client: pg.PoolClient,
    profile: string,
  ): Promise<string[]> {
    const account = await this.profiles.accountFor(client, profile);
    const result = await client.query<{ device_id: string }>(
      `SELECT s.device_id FROM hash_talk.social_devices s JOIN hash_talk.device_directories d ON d.account_id=$2 WHERE s.profile_id=$1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.event->'devices') v WHERE v->>'id'=s.private_device::text)`,
      [profile, account],
    );
    return result.rows.map((row) => row.device_id);
  }
  async ready(
    context: SocialContext,
    profile = context.actor.id,
  ): Promise<DirectoryEvent> {
    const event = await this.current(context.client, profile),
      active = await this.activeDevices(context.client, profile);
    if (!event || event.devices.some((d) => !active.includes(d.id)))
      throw new AccountError(
        409,
        'Aparelhos das DMs precisam ser atualizados pelo participante.',
      );
    return event;
  }
  async ownDevice(context: SocialContext): Promise<string> {
    const result = await context.client.query<{ device_id: string }>(
      'SELECT device_id FROM hash_talk.social_devices WHERE profile_id=$1 AND private_device=$2',
      [context.actor.id, context.authority.session.deviceId],
    );
    const device = result.rows[0]?.device_id;
    const event = await this.ready(context);
    if (!device || !event.devices.some((d) => d.id === device))
      throw new AccountError(403, 'Aparelho sem identidade de DM atual.');
    return device;
  }
  async directory(
    authority: ContactAuthority,
    input: { peer: string | null; after: number },
  ) {
    return this.social.withActor(authority, async (context) => {
      const profile = input.peer ?? context.actor.id;
      await this.social.requireConsent(context, profile);
      const rows = await context.client.query<{ body: DirectoryEvent }>(
        'SELECT body FROM hash_talk.social_directories WHERE profile_id=$1 AND revision>$2 ORDER BY revision LIMIT 9',
        [profile, input.after],
      );
      const device =
        profile === context.actor.id
          ? await context.client.query<{ device_id: string }>(
              'SELECT device_id FROM hash_talk.social_devices WHERE profile_id=$1 AND private_device=$2',
              [profile, authority.session.deviceId],
            )
          : null;
      const page = rows.rows.slice(0, 8).map((r) => socialDirectory(r.body));
      return {
        profile,
        events: page,
        next: rows.rows.length > 8 ? (page.at(-1)?.revision ?? null) : null,
        device: device?.rows[0]?.device_id ?? null,
        active:
          profile === context.actor.id
            ? await this.activeDevices(context.client, profile)
            : null,
      };
    });
  }
  async register(authority: ContactAuthority, raw: unknown) {
    const event = socialDirectory(raw);
    return this.social.withActor(authority, async (context) => {
      if (event.accountId !== context.actor.id)
        throw new AccountError(403, 'Diretório de outro perfil público.');
      const previous = await this.current(context.client, context.actor.id);
      if (previous && canonical(previous) === canonical(event)) return event;
      await verifyTransition(previous, event);
      const privateRow = await context.client.query<{ event: unknown }>(
        'SELECT event FROM hash_talk.device_directories WHERE account_id=$1',
        [authority.session.accountId],
      );
      const privateEvent = directoryEvent(privateRow.rows[0]?.event);
      this.assertIndependent(event, privateEvent);
      await this.registerDevice(context, event, previous);
      const serialized = JSON.stringify(event);
      await context.client.query(
        'INSERT INTO hash_talk.social_directories(profile_id,revision,body,hash,charge) VALUES($1,$2,$3::jsonb,$4,$5)',
        [
          context.actor.id,
          event.revision,
          serialized,
          await eventHash(event),
          Buffer.byteLength(serialized) + 512,
        ],
      );
      await this.social.limits(context);
      return event;
    });
  }
  private async registerDevice(
    context: SocialContext,
    event: DirectoryEvent,
    previous: DirectoryEvent | null,
  ): Promise<void> {
    const added = event.devices.filter(
      (d) => !previous?.devices.some((old) => old.id === d.id),
    );
    const existing = await context.client.query<{ device_id: string }>(
      'SELECT device_id FROM hash_talk.social_devices WHERE profile_id=$1 AND private_device=$2',
      [context.actor.id, context.authority.session.deviceId],
    );
    const alias = existing.rows[0]?.device_id;
    this.assertNewAlias(event, added, alias);
    if (added[0]) {
      if (alias)
        await context.client.query(
          'DELETE FROM hash_talk.social_devices WHERE profile_id=$1 AND private_device=$2',
          [context.actor.id, context.authority.session.deviceId],
        );
      await context.client.query(
        'INSERT INTO hash_talk.social_devices(profile_id,device_id,private_device) VALUES($1,$2,$3)',
        [context.actor.id, added[0].id, context.authority.session.deviceId],
      );
    }
    const active = await this.activeDevices(context.client, context.actor.id);
    if (
      (event.kind !== 'revoke' &&
        event.devices.some((d) => !active.includes(d.id))) ||
      !event.devices.some((d) => d.id === (added[0]?.id ?? alias))
    )
      throw new AccountError(
        403,
        'Diretório inclui aparelho sem autorização atual.',
      );
    if (previous && event.kind === 'revoke' && event.signer !== alias)
      throw new AccountError(403, 'Revogação assinada por outro aparelho.');
  }
  private assertNewAlias(
    event: DirectoryEvent,
    added: DirectoryEvent['devices'],
    alias: string | undefined,
  ): void {
    if (
      added.length > 1 ||
      (added.length &&
        alias &&
        (event.kind !== 'recover' || event.devices.some((d) => d.id === alias)))
    )
      throw new AccountError(409, 'Identidade de aparelho já registrada.');
  }
  private assertIndependent(
    event: DirectoryEvent,
    privateEvent: DirectoryEvent,
  ): void {
    const privateIds = new Set([
      privateEvent.accountId,
      ...privateEvent.devices.map((d) => d.id),
      ...privateEvent.revoked,
    ]);
    const privateKeys = new Set([
      privateEvent.root.signing,
      privateEvent.root.wrapping,
      ...privateEvent.devices.flatMap((d) => [d.signing, d.wrapping]),
    ]);
    if (
      [
        event.accountId,
        ...event.devices.map((d) => d.id),
        ...event.revoked,
      ].some((id) => privateIds.has(id)) ||
      [
        event.root.signing,
        event.root.wrapping,
        ...event.devices.flatMap((d) => [d.signing, d.wrapping]),
      ].some((key) => privateKeys.has(key))
    )
      throw new AccountError(
        403,
        'DM exige identidade e chaves independentes.',
      );
  }
  async recovery(
    authority: ContactAuthority,
    input: { peer?: string; id?: string; key?: unknown },
  ) {
    return this.social.withActor(authority, async (context) => {
      const profile = input.peer ?? context.actor.id;
      await this.social.requireConsent(context, profile);
      if (input.id && profile !== context.actor.id)
        throw new AccountError(403, 'Recuperação histórica restrita ao dono.');
      const current = await this.ready(context, profile);
      if (input.key !== undefined) {
        await this.registerRecovery(context, current, input.key);
      }
      const result = await context.client.query<{ body: RecoveryKey }>(
        `SELECT body FROM hash_talk.social_recovery WHERE profile_id=$1 AND ${input.id ? 'id=$2' : 'epoch=$2'}`,
        [profile, input.id ?? current.epoch],
      );
      return result.rows[0]?.body ?? null;
    });
  }
  private async registerRecovery(
    context: SocialContext,
    current: DirectoryEvent,
    raw: unknown,
  ): Promise<void> {
    const key = await verifyRecoveryKey(raw, current),
      device = await this.ownDevice(context);
    if (key.accountId !== context.actor.id || key.deviceId !== device)
      throw new AccountError(403, 'Recuperação de outra identidade.');
    const serialized = JSON.stringify(key);
    await context.client.query(
      'INSERT INTO hash_talk.social_recovery(profile_id,epoch,id,body,charge) VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(profile_id,epoch) DO NOTHING',
      [
        context.actor.id,
        key.epoch,
        key.id,
        serialized,
        Buffer.byteLength(serialized) + 512,
      ],
    );
    await this.social.limits(context);
  }
  async publish(authority: ContactAuthority, raw: unknown) {
    const packet = socialPacket(raw);
    return this.social.withActor(authority, async (context) => {
      await this.social.requireConsent(context, packet.recipient);
      const sender = await this.ready(context),
        recipient = await this.ready(context, packet.recipient),
        device = await this.ownDevice(context);
      if (
        packet.sender !== context.actor.id ||
        packet.deviceId !== device ||
        packet.senderDirectory !== (await eventHash(sender)) ||
        packet.recipientDirectory !== (await eventHash(recipient)) ||
        packet.recipientRevision !== recipient.revision
      )
        throw new AccountError(
          409,
          'Identidade ou aparelhos mudaram. Refaça a cifragem.',
        );
      await verifyPacket(packet, sender);
      await this.assertRecovery(context, packet, [sender, recipient]);
      const hash = await digest(canonical(packet));
      const existing = await context.client.query<{
        hash: string;
        sender: string;
        body: unknown;
      }>('SELECT hash,sender,body FROM hash_talk.social_messages WHERE id=$1', [
        packet.id,
      ]);
      if (existing.rows[0]) {
        if (
          existing.rows[0].hash !== hash ||
          existing.rows[0].sender !== context.actor.id ||
          !existing.rows[0].body
        )
          throw new AccountError(409, 'Identificador de DM já utilizado.');
        return { status: 'accepted', hash };
      }
      await this.admitMedia(context, packet);
      const body = JSON.stringify(packet),
        charge = Buffer.byteLength(body) + 512;
      await context.client.query(
        'INSERT INTO hash_talk.social_messages(id,sender,recipient,hash,body,charge,sender_charge,recipient_charge) VALUES($1,$2,$3,$4,$5::jsonb,$6,$6,$6)',
        [packet.id, packet.sender, packet.recipient, hash, body, charge],
      );
      await context.client.query(
        'INSERT INTO hash_talk.social_receipts(message_id,profile_id,device_id,received) VALUES($1,$2,$3,true) ON CONFLICT DO NOTHING',
        [packet.id, packet.sender, authority.session.deviceId],
      );
      await this.social.limits(context, [packet.sender, packet.recipient]);
      await this.social.changed(context, [packet.sender, packet.recipient]);
      return { status: 'accepted', hash };
    });
  }
  private async admitMedia(
    context: SocialContext,
    packet: MessagePacket,
  ): Promise<void> {
    if (!this.media)
      throw new AccountError(503, 'Preservação da mídia de DMs indisponível.');
    await this.media.admit(context.client, packet);
  }
  async accepted(
    authority: ContactAuthority,
    id: string,
    hash: string,
  ): Promise<boolean> {
    return this.social.withActor(authority, async (context) => {
      const result = await context.client.query<{
        sender: string;
        hash: string;
      }>('SELECT sender,hash FROM hash_talk.social_messages WHERE id=$1', [id]);
      const row = result.rows[0];
      if (!row) return false;
      if (row.sender !== context.actor.id || row.hash !== hash)
        throw new AccountError(
          409,
          'Recibo de DM de outro remetente ou conteúdo.',
        );
      const removed = await context.client.query(
        "SELECT 1 FROM hash_talk.personal_removals WHERE account_id=$1 AND kind='dm-message' AND id=$2",
        [authority.session.accountId, id],
      );
      if (removed.rowCount)
        throw new AccountError(410, 'DM removida do cofre pessoal.');
      return true;
    });
  }
  private async assertRecovery(
    context: SocialContext,
    packet: MessagePacket,
    events: DirectoryEvent[],
  ) {
    const keys = await context.client.query<{
      profile_id: string;
      id: string;
      epoch: number;
    }>(
      'SELECT profile_id,id,epoch FROM hash_talk.social_recovery WHERE id=ANY($1::uuid[])',
      [packet.archives.map((a) => a.keyId)],
    );
    if (
      packet.archives.some(
        (a) =>
          !keys.rows.some(
            (k) =>
              k.id === a.keyId &&
              k.profile_id === a.accountId &&
              events.some(
                (e) => e.accountId === k.profile_id && e.epoch === k.epoch,
              ),
          ),
      )
    )
      throw new AccountError(409, 'Recuperação de DM desatualizada.');
  }
  async messages(
    authority: ContactAuthority,
    input: { peer: string; before: number | null },
  ) {
    return this.social.withActor(authority, async (context) => {
      await this.social.requireConsent(context, input.peer);
      const rows = await context.client.query<{
        sequence: string;
        body: MessagePacket;
      }>(
        `SELECT sequence::text,body FROM hash_talk.social_messages WHERE ((sender=$1 AND recipient=$2) OR (sender=$2 AND recipient=$1)) AND ($3::bigint IS NULL OR sequence<$3) AND body IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals r WHERE r.account_id=$4 AND r.kind='dm-message' AND r.id=hash_talk.social_messages.id) ORDER BY sequence DESC LIMIT 17`,
        [
          context.actor.id,
          input.peer,
          input.before,
          authority.session.accountId,
        ],
      );
      const page = rows.rows.slice(0, 16);
      return {
        items: page.map((row) => ({
          sequence: Number(row.sequence),
          packet: socialPacket(row.body),
        })),
        next: rows.rows.length > 16 ? Number(page.at(-1)?.sequence) : null,
      };
    });
  }
}
