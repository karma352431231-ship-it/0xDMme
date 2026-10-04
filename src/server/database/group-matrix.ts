import type pg from 'pg';
import { AccountError, object } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import { matrixUser } from '../../shared/messages/index.ts';
import type { MatrixBinding } from '../../shared/messages/index.ts';
import type { GroupEvent } from '../../shared/groups/index.ts';
import type { ContactAuthority } from './contacts.ts';

export interface GroupEnvelope {
  account: string;
  device: string;
  content: Record<string, unknown>;
}
function unavailable(): never {
  throw new AccountError(403, 'Chaves fora da participação autorizada.');
}
export function assertGroupAccounts(
  state: GroupEvent,
  accounts: readonly string[],
): void {
  const members = new Set(state.members.map((m) => m.accountId));
  if (accounts.some((account) => !members.has(account))) unavailable();
}
export async function queryGroupKeys(
  client: pg.PoolClient,
  accounts: string[],
): Promise<unknown> {
  const rows = await client.query<{ binding: MatrixBinding }>(
    `SELECT m.binding FROM hash_talk.matrix_devices m JOIN hash_talk.device_directories d ON d.account_id=m.account_id WHERE m.account_id=ANY($1::uuid[]) AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.event->'devices') member WHERE member->>'id'=m.device_id::text) ORDER BY m.account_id,m.device_id`,
    [accounts],
  );
  const devices: Record<string, Record<string, unknown>> = Object.fromEntries(
    accounts.map((account) => [matrixUser(account), {}]),
  );
  for (const row of rows.rows) {
    const values = (devices[matrixUser(row.binding.accountId)] ??= {});
    values[row.binding.deviceId] = row.binding.public;
  }
  return {
    bindings: rows.rows.map((row) => row.binding),
    response: { device_keys: devices, failures: {} },
  };
}
export async function assertGroupDevices(
  client: pg.PoolClient,
  requests: { account: string; device: string }[],
): Promise<void> {
  const rows = await client.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM jsonb_to_recordset($1::jsonb) AS r(account uuid,device text) JOIN hash_talk.device_directories d ON d.account_id=r.account WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(d.event->'devices') member WHERE member->>'id'=r.device)`,
    [JSON.stringify(requests)],
  );
  if (rows.rows[0]?.count !== requests.length) unavailable();
}
export async function claimGroupKeys(
  client: pg.PoolClient,
  requests: { account: string; device: string }[],
): Promise<unknown> {
  await assertGroupDevices(client, requests);
  const rows = await client.query<{
    account: string;
    device: string;
    id: string;
    body: unknown;
    fallback: boolean;
  }>(
    `SELECT r.account,r.device,k.id,k.body,k.fallback FROM jsonb_to_recordset($1::jsonb) AS r(account uuid,device uuid) CROSS JOIN LATERAL (SELECT id,body,fallback FROM hash_talk.matrix_one_time_keys WHERE account_id=r.account AND device_id=r.device ORDER BY fallback,id LIMIT 1 FOR UPDATE) k`,
    [JSON.stringify(requests)],
  );
  const keys: Record<string, Record<string, unknown>> = {};
  for (const row of rows.rows) {
    const devices = (keys[matrixUser(row.account)] ??= {});
    devices[row.device] = { [row.id]: row.body };
  }
  await client.query(
    `DELETE FROM hash_talk.matrix_one_time_keys k USING jsonb_to_recordset($1::jsonb) AS r(account uuid,device uuid,id text,fallback boolean) WHERE k.account_id=r.account AND k.device_id=r.device AND k.id=r.id AND NOT r.fallback`,
    [
      JSON.stringify(
        rows.rows.map((r) => ({
          account: r.account,
          device: r.device,
          id: r.id,
          fallback: r.fallback,
        })),
      ),
    ],
  );
  return { one_time_keys: keys, failures: {} };
}
interface StoredEnvelope {
  account: string;
  device: string;
  body: unknown;
  hash: string;
  charge: number;
}
async function envelopeRows(
  authority: ContactAuthority,
  envelopes: GroupEnvelope[],
): Promise<StoredEnvelope[]> {
  return Promise.all(
    envelopes.map(async (envelope) => {
      const body = {
        type: 'm.room.encrypted',
        sender: matrixUser(authority.session.accountId),
        content: envelope.content,
      };
      return {
        account: envelope.account,
        device: envelope.device,
        body,
        hash: await digest(canonical(body)),
        charge: Buffer.byteLength(JSON.stringify(body)) + 512,
      };
    }),
  );
}
/** Membership/account locks are already held by GroupStore; admission is bulk and idempotent. */
export async function putGroupEnvelopes(
  client: pg.PoolClient,
  authority: ContactAuthority,
  input: { state: GroupEvent; id: string; envelopes: GroupEnvelope[] },
): Promise<void> {
  assertGroupAccounts(
    input.state,
    input.envelopes.map((e) => e.account),
  );
  await assertGroupDevices(
    client,
    input.envelopes.map((e) => ({ account: e.account, device: e.device })),
  );
  await checkEnvelopeBindings(client, authority, input.envelopes);
  const rows = await envelopeRows(authority, input.envelopes),
    serialized = JSON.stringify(rows);
  const conflict = await client.query(
    `SELECT 1 FROM hash_talk.group_matrix_envelopes e JOIN jsonb_to_recordset($1::jsonb) AS r(account uuid,device uuid,hash text) ON e.account_id=r.account AND e.device_id=r.device WHERE e.group_id=$2 AND e.sender=$3 AND e.id=$4 AND (e.hash<>r.hash OR e.epoch<>$5) LIMIT 1`,
    [
      serialized,
      input.state.groupId,
      authority.session.accountId,
      input.id,
      input.state.epoch,
    ],
  );
  if (conflict.rowCount)
    throw new AccountError(409, 'Envelope de grupo repetido divergente.');
  await client.query(
    `INSERT INTO hash_talk.group_matrix_envelopes(group_id,epoch,sender,id,account_id,device_id,body,hash,charge) SELECT $1,$2,$3,$4,r.account,r.device,r.body,r.hash,r.charge FROM jsonb_to_recordset($5::jsonb) AS r(account uuid,device uuid,body jsonb,hash text,charge integer) ON CONFLICT DO NOTHING`,
    [
      input.state.groupId,
      input.state.epoch,
      authority.session.accountId,
      input.id,
      serialized,
    ],
  );
}
async function checkEnvelopeBindings(
  client: pg.PoolClient,
  authority: ContactAuthority,
  envelopes: GroupEnvelope[],
): Promise<void> {
  const requests = [
    {
      account: authority.session.accountId,
      device: authority.session.deviceId,
    },
    ...envelopes.map((e) => ({ account: e.account, device: e.device })),
  ];
  const rows = await client.query<{ binding: MatrixBinding }>(
    `SELECT DISTINCT m.binding FROM hash_talk.matrix_devices m JOIN jsonb_to_recordset($1::jsonb) AS r(account uuid,device uuid) ON m.account_id=r.account AND m.device_id=r.device`,
    [JSON.stringify(requests)],
  );
  const bindings = new Map(
    rows.rows.map((r) => [
      `${r.binding.accountId}/${r.binding.deviceId}`,
      r.binding,
    ]),
  );
  const origin = bindings.get(
    `${authority.session.accountId}/${authority.session.deviceId}`,
  )?.public.keys[`curve25519:${authority.session.deviceId}`];
  if (!origin) unavailable();
  for (const envelope of envelopes) {
    const curve = bindings.get(`${envelope.account}/${envelope.device}`)?.public
      .keys[`curve25519:${envelope.device}`];
    if (
      !curve ||
      envelope.content['sender_key'] !== origin ||
      Object.keys(object(envelope.content['ciphertext']))[0] !== curve
    )
      unavailable();
  }
}
