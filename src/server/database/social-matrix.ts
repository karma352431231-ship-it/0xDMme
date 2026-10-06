import { AccountError } from '../../shared/account/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import { canonical, digest, eventHash } from '../../shared/devices/index.ts';
import {
  matrixUser,
  verifyMatrixBinding,
} from '../../shared/messages/index.ts';
import type { MatrixBinding } from '../../shared/messages/index.ts';
import type { ContactAuthority } from './contacts.ts';
import type { MatrixUpload } from './matrix.ts';
import type { SocialContext, SocialDmStore } from './social-dm.ts';
import type { SocialCryptoStore } from './social-crypto.ts';

type Envelope = {
  account: string;
  device: string;
  content: Record<string, unknown>;
};
export class SocialMatrixStore {
  private readonly social: SocialDmStore;
  private readonly crypto: SocialCryptoStore;
  constructor(social: SocialDmStore, crypto: SocialCryptoStore) {
    this.social = social;
    this.crypto = crypto;
  }
  private async allow(
    context: SocialContext,
    profiles: string[],
  ): Promise<Map<string, DirectoryEvent>> {
    const unique = [...new Set(profiles)];
    if (unique.length > 2)
      throw new AccountError(
        400,
        'Transporte de DM exige contexto individual.',
      );
    const result = new Map<string, DirectoryEvent>();
    for (const profile of unique) {
      await this.social.requireConsent(context, profile);
      result.set(profile, await this.crypto.ready(context, profile));
    }
    return result;
  }
  async upload(authority: ContactAuthority, input: MatrixUpload) {
    return this.social.withActor(authority, async (context) => {
      const event = await this.crypto.ready(context),
        device = await this.crypto.ownDevice(context);
      await verifyMatrixBinding(input.binding, event);
      if (
        input.binding.accountId !== context.actor.id ||
        input.binding.deviceId !== device ||
        input.binding.directory !== (await eventHash(event))
      )
        throw new AccountError(403, 'Vínculo Matrix de outra DM.');
      const previous = await context.client.query<{ binding: MatrixBinding }>(
        'SELECT binding FROM hash_talk.social_matrix_devices WHERE profile_id=$1 AND device_id=$2',
        [context.actor.id, device],
      );
      if (
        previous.rows[0] &&
        canonical(previous.rows[0].binding.public) !==
          canonical(input.binding.public)
      )
        throw new AccountError(409, 'Chaves do aparelho de DMs mudaram.');
      const serialized = JSON.stringify(input.binding);
      await context.client.query(
        'INSERT INTO hash_talk.social_matrix_devices(profile_id,device_id,binding,charge) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(profile_id,device_id) DO UPDATE SET binding=excluded.binding,charge=excluded.charge WHERE hash_talk.social_matrix_devices.binding<>excluded.binding',
        [
          context.actor.id,
          device,
          serialized,
          Buffer.byteLength(serialized) + 512,
        ],
      );
      for (const [id, body] of Object.entries(input.keys))
        await this.key(context, { device, id, body, fallback: false });
      for (const [id, body] of Object.entries(input.fallback)) {
        await context.client.query(
          'DELETE FROM hash_talk.social_matrix_keys WHERE profile_id=$1 AND device_id=$2 AND fallback AND id<>$3',
          [context.actor.id, device, id],
        );
        await this.key(context, { device, id, body, fallback: true });
      }
      const count = await this.count(context, device);
      if (count > 100)
        throw new AccountError(413, 'Lote de chaves de DMs excedido.');
      await this.social.limits(context);
      return {
        response: { one_time_key_counts: { signed_curve25519: count } },
      };
    });
  }
  private async key(
    context: SocialContext,
    input: {
      device: string;
      id: string;
      body: Record<string, unknown>;
      fallback: boolean;
    },
  ): Promise<void> {
    const old = await context.client.query<{ body: unknown }>(
      'SELECT body FROM hash_talk.social_matrix_keys WHERE profile_id=$1 AND device_id=$2 AND id=$3',
      [context.actor.id, input.device, input.id],
    );
    if (old.rows[0] && canonical(old.rows[0].body) !== canonical(input.body))
      throw new AccountError(409, 'Chave de sessão de DM substituída.');
    const serialized = JSON.stringify(input.body);
    await context.client.query(
      'INSERT INTO hash_talk.social_matrix_keys(profile_id,device_id,id,fallback,body,charge) VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT DO NOTHING',
      [
        context.actor.id,
        input.device,
        input.id,
        input.fallback,
        serialized,
        Buffer.byteLength(serialized) + 512,
      ],
    );
  }
  private async count(context: SocialContext, device: string): Promise<number> {
    const result = await context.client.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM hash_talk.social_matrix_keys WHERE profile_id=$1 AND device_id=$2 AND NOT fallback',
      [context.actor.id, device],
    );
    return result.rows[0]?.count ?? 0;
  }
  async query(authority: ContactAuthority, profiles: string[]) {
    return this.social.withActor(authority, async (context) => {
      await this.allow(context, profiles);
      const rows = await context.client.query<{
        profile_id: string;
        device_id: string;
        binding: MatrixBinding;
      }>(
        'SELECT profile_id,device_id,binding FROM hash_talk.social_matrix_devices WHERE profile_id=ANY($1::uuid[])',
        [profiles],
      );
      const devices: Record<string, Record<string, unknown>> = {},
        bindings: MatrixBinding[] = [];
      for (const profile of profiles) {
        const event = await this.crypto.ready(context, profile),
          user = matrixUser(profile);
        devices[user] = {};
        for (const row of rows.rows.filter(
          (r) =>
            r.profile_id === profile &&
            event.devices.some((d) => d.id === r.device_id),
        )) {
          devices[user][row.device_id] = row.binding.public;
          bindings.push(row.binding);
        }
      }
      return { response: { device_keys: devices, failures: {} }, bindings };
    });
  }
  async claim(
    authority: ContactAuthority,
    requests: { account: string; device: string }[],
  ) {
    return this.social.withActor(authority, async (context) => {
      const directories = await this.allow(
        context,
        requests.map((r) => r.account),
      );
      for (const request of requests)
        if (
          !directories
            .get(request.account)
            ?.devices.some((d) => d.id === request.device)
        )
          throw new AccountError(403, 'Aparelho de DM indisponível.');
      if (
        new Set(requests.map((r) => `${r.account}:${r.device}`)).size !==
        requests.length
      )
        throw new AccountError(400, 'Aparelho repetido no lote.');
      const rows = await context.client.query<{
        account: string;
        device: string;
        id: string;
        body: unknown;
        fallback: boolean;
      }>(
        `SELECT r.account,r.device,k.id,k.body,k.fallback FROM jsonb_to_recordset($1::jsonb) r(account uuid,device uuid) JOIN LATERAL (SELECT id,body,fallback FROM hash_talk.social_matrix_keys WHERE profile_id=r.account AND device_id=r.device ORDER BY fallback,id LIMIT 1 FOR UPDATE) k ON true`,
        [JSON.stringify(requests)],
      );
      const result: Record<
        string,
        Record<string, Record<string, unknown>>
      > = {};
      for (const row of rows.rows) {
        const user = matrixUser(row.account);
        result[user] ??= {};
        result[user][row.device] = { [row.id]: row.body };
      }
      await context.client.query(
        'DELETE FROM hash_talk.social_matrix_keys k USING jsonb_to_recordset($1::jsonb) r(account uuid,device uuid,id text) WHERE k.profile_id=r.account AND k.device_id=r.device AND k.id=r.id AND NOT k.fallback',
        [JSON.stringify(rows.rows.filter((r) => !r.fallback))],
      );
      return { response: { one_time_keys: result, failures: {} } };
    });
  }
  async send(
    authority: ContactAuthority,
    input: { id: string; envelopes: Envelope[] },
  ) {
    return this.social.withActor(authority, async (context) => {
      const profiles = input.envelopes.map((e) => e.account),
        directories = await this.allow(context, profiles),
        device = await this.crypto.ownDevice(context);
      const bindings = await context.client.query<{
        profile_id: string;
        device_id: string;
        binding: MatrixBinding;
      }>(
        'SELECT profile_id,device_id,binding FROM hash_talk.social_matrix_devices WHERE profile_id=ANY($1::uuid[])',
        [[...new Set([context.actor.id, ...profiles])]],
      );
      const byDevice = new Map(
        bindings.rows.map((row) => [
          `${row.profile_id}:${row.device_id}`,
          row.binding,
        ]),
      );
      const senderKey = byDevice.get(`${context.actor.id}:${device}`)?.public
        .keys[`curve25519:${device}`];
      const rows = await Promise.all(
        input.envelopes.map(async (envelope) => {
          this.assertEnvelope({
            envelope,
            directory: directories.get(envelope.account),
            binding: byDevice.get(`${envelope.account}:${envelope.device}`),
            senderKey,
          });
          const body = {
            sender: matrixUser(context.actor.id),
            type: 'm.room.encrypted',
            content: envelope.content,
          };
          return {
            recipient: envelope.account,
            device_id: envelope.device,
            body,
            hash: await digest(canonical(body)),
            charge: Buffer.byteLength(JSON.stringify(body)) + 512,
          };
        }),
      );
      const existing = await context.client.query(
        `SELECT 1 FROM hash_talk.social_matrix_envelopes e JOIN jsonb_to_recordset($4::jsonb) r(recipient uuid,device_id uuid,hash text) ON r.recipient=e.recipient AND r.device_id=e.device_id WHERE e.sender=$1 AND e.sender_device=$2 AND e.txn=$3 AND e.hash<>r.hash LIMIT 1`,
        [context.actor.id, device, input.id, JSON.stringify(rows)],
      );
      if (existing.rowCount)
        throw new AccountError(409, 'Retry de envelope divergente.');
      await context.client.query(
        'INSERT INTO hash_talk.social_matrix_envelopes(sender,sender_device,txn,recipient,device_id,hash,body,charge) SELECT $1,$2,$3,r.recipient,r.device_id,r.hash,r.body,r.charge FROM jsonb_to_recordset($4::jsonb) r(recipient uuid,device_id uuid,hash text,body jsonb,charge integer) ON CONFLICT DO NOTHING',
        [context.actor.id, device, input.id, JSON.stringify(rows)],
      );
      await this.social.limits(context, [context.actor.id, ...profiles]);
      return { response: {} };
    });
  }
  private assertEnvelope(input: {
    envelope: Envelope;
    directory: DirectoryEvent | undefined;
    binding: MatrixBinding | undefined;
    senderKey: string | undefined;
  }): void {
    const { envelope, directory, binding, senderKey } = input;
    if (
      !directory?.devices.some((d) => d.id === envelope.device) ||
      envelope.content['sender_key'] !== senderKey
    )
      throw new AccountError(403, 'Envelope de outro aparelho/contexto.');
    const curve = binding?.public.keys[`curve25519:${envelope.device}`];
    if (
      !curve ||
      !Object.hasOwn(envelope.content['ciphertext'] as object, curve)
    )
      throw new AccountError(403, 'Destino criptográfico divergente.');
  }
  async inbox(authority: ContactAuthority) {
    return this.social.withActor(authority, async (context) => {
      const device = await this.crypto.ownDevice(context);
      const rows = await context.client.query<{
        sequence: string;
        body: unknown;
      }>(
        `SELECT e.sequence::text,e.body FROM hash_talk.social_matrix_envelopes e WHERE recipient=$1 AND device_id=$2 AND body IS NOT NULL AND (sender=$1 OR EXISTS(SELECT 1 FROM hash_talk.social_relations r WHERE r.lo=least(e.sender,e.recipient) AND r.hi=greatest(e.sender,e.recipient) AND r.state='approved')) AND NOT EXISTS(SELECT 1 FROM hash_talk.social_blocks b WHERE b.blocked AND ((b.actor=e.sender AND b.target=e.recipient) OR (b.actor=e.recipient AND b.target=e.sender))) ORDER BY sequence LIMIT 16`,
        [context.actor.id, device],
      );
      return {
        items: rows.rows.map((r) => ({
          sequence: Number(r.sequence),
          event: r.body,
        })),
        oneTimeKeys: await this.count(context, device),
      };
    });
  }
  async received(
    authority: ContactAuthority,
    sequences: number[],
  ): Promise<void> {
    await this.social.withActor(authority, async (context) => {
      const device = await this.crypto.ownDevice(context);
      await context.client.query(
        'UPDATE hash_talk.social_matrix_envelopes SET body=NULL,charge=512 WHERE recipient=$1 AND device_id=$2 AND sequence=ANY($3::bigint[]) AND body IS NOT NULL',
        [context.actor.id, device, sequences],
      );
    });
  }
}
