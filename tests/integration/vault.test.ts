import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { Wallet } from 'ethers';
import { Database } from '../../src/server/database/index.ts';
import { ObjectStore } from '../../src/server/object-store/index.ts';
import { MessageService } from '../../src/server/messages/index.ts';
import { messageBody } from '../../src/shared/messages/index.ts';
import { VaultService } from '../../src/server/vault/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import {
  AccountService,
  createAccountHandler,
} from '../../src/server/account/index.ts';
import { createWebServer } from '../../src/server/web-host/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { encode } from '../../src/shared/account/index.ts';
import {
  commitHash,
  bytesHash,
  vaultQuota,
  operationBytes,
} from '../../src/shared/vault/index.ts';
import type { VaultCommit, VaultChange } from '../../src/shared/vault/index.ts';
import { eventHash, sign } from '../../src/shared/devices/index.ts';
import {
  aesKey,
  createIdentity,
  createRecovery,
  newSecret,
  recoverSecrets,
} from '../../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
  remainingIdentities,
} from '../../src/client/device-operations/index.ts';
import {
  openBlock,
  openManifest,
  sealBlock,
  sealCommit,
} from '../../src/client/vault-crypto/index.ts';

await test('cofre persistente: reservas, isolamento, concorrência, falhas, quota e HTTP', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo necessário.');
  const database = new Database(config.databaseUrl);
  const inspector = new pg.Client({ connectionString: config.databaseUrl });
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), '0xdmme-vault-')),
  );
  const objects = new ObjectStore(directory);
  const origin = 'http://127.0.0.1:45117';
  await database.migrate();
  await inspector.connect();
  await objects.initialize();
  const account = new AccountService({
    store: database.authentication,
    origin,
  });
  const devices = new DeviceService(database.devices);
  const vault = new VaultService({
    store: database.vault,
    devices: database.devices,
    objects,
  });
  const host = createWebServer({
    origin,
    assets: new Map(),
    database,
    objects,
    account: createAccountHandler({ origin, service: account, devices, vault }),
  });
  await new Promise<void>((resolve) =>
    host.server.listen(45117, '127.0.0.1', resolve),
  );
  const ids: string[] = [];
  t.after(async () => {
    await host.close();
    await inspector.query('BEGIN');
    for (const table of [
      'vault_operations',
      'vault_heads',
      'device_links',
      'device_events',
      'device_directories',
      'login_sessions',
      'login_devices',
    ])
      await inspector.query(
        `DELETE FROM hash_talk.${table} WHERE account_id=ANY($1::uuid[])`,
        [ids],
      );
    await inspector.query(
      'DELETE FROM hash_talk.accounts WHERE id=ANY($1::uuid[])',
      [ids],
    );
    await inspector.query('COMMIT');
    await inspector.end();
    await database.close();
    await rm(directory, { recursive: true, force: true });
  });
  const wallet = Wallet.createRandom();
  async function login(signer = wallet) {
    const challenge = await account.challenge({
      ecosystem: 'evm',
      address: signer.address,
      chainId: 1,
      deviceId: crypto.randomUUID(),
    });
    const result = await account.login(
      {
        id: challenge.id,
        signature: await signer.signMessage(challenge.message),
      },
      challenge.browserToken,
    );
    if (!ids.includes(result.session.accountId))
      ids.push(result.session.accountId);
    return result;
  }
  const a = await login();
  const b = await login();
  const outsider = await login(Wallet.createRandom());
  const identity = await createIdentity(a.session.deviceId, 'A');
  const identityB = await createIdentity(b.session.deviceId, 'B');
  const secret = newSecret();
  const recovery = await createRecovery(a.session.accountId, secret);
  const ring = freshKeyring(a.session.accountId);
  const key = await aesKey(ring.keys[0] ?? '');
  let authority = await prepareEvent({
    accountId: a.session.accountId,
    previous: null,
    kind: 'initialize',
    signer: 'recovery',
    signing: recovery.signing,
    root: recovery.root,
    identities: [identity.public],
    ring,
    profile: null,
  });
  await devices.commit(a.session, { event: authority, profile: null });
  const pending = await vault.operate('read', a.session, { after: 0 });
  assert.equal((pending as { sequence: number }).sequence, 0);
  const code = {
    version: 1 as const,
    accountId: a.session.accountId,
    id: crypto.randomUUID(),
    nonce: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 290_000).toISOString(),
    device: identityB.public,
  };
  const { linkProof } = await import('../../src/shared/devices/index.ts');
  await devices.start(b.session, {
    code,
    signature: await sign(identityB.signing, linkProof(code)),
  });
  authority = await prepareEvent({
    accountId: a.session.accountId,
    previous: authority,
    kind: 'link',
    signer: identity.public.id,
    signing: identity.signing,
    root: authority.root,
    identities: [identity.public, identityB.public],
    ring,
    linkId: code.id,
    profile: null,
  });
  await devices.commit(a.session, { event: authority, profile: null });
  const entity = crypto.randomUUID();
  async function prepare(input: {
    previous: VaultCommit | null;
    value: string;
    parents?: string[];
    useB?: boolean;
  }) {
    const id = crypto.randomUUID();
    const epoch = authority.epoch;
    const encryptionKey =
      epoch === 1 ? key : await aesKey(rotated.keys[epoch - 1] ?? '');
    const actor = input.useB ? identityB : identity;
    const descriptor = { accountId: a.session.accountId, id, epoch };
    const bytes = await sealBlock(encryptionKey, descriptor, input.value);
    const change: VaultChange = {
      version: 1,
      entity,
      kind: 'settings',
      parents: input.parents ?? [],
      label: 'preferência fictícia',
    };
    const commit = await sealCommit({
      unsigned: {
        version: 1,
        ...descriptor,
        deviceId: actor.public.id,
        directory: await eventHash(authority),
        authorityRevision: authority.revision,
        sequence: (input.previous?.sequence ?? 0) + 1,
        previous: input.previous ? await commitHash(input.previous) : null,
        block: { hash: await bytesHash(bytes), bytes: bytes.length },
      },
      change,
      key: encryptionKey,
      sign: (proof) => sign(actor.signing, proof),
    });
    return { commit, bytes };
  }
  async function upload(
    value: Awaited<ReturnType<typeof prepare>>,
    session = a.session,
  ) {
    await vault.operate('reserve', session, { commit: value.commit });
    return vault.operate('upload', session, {
      commit: value.commit,
      ciphertext: encode(value.bytes),
    });
  }
  const first = await prepare({ previous: null, value: 'base' });
  await t.test(
    'reserva antecede bytes; aceitação é idempotente e não duplica cota',
    async () => {
      await assert.rejects(
        vault.operate('upload', a.session, {
          commit: first.commit,
          ciphertext: encode(first.bytes),
        }),
        /Reserve/,
      );
      await vault.operate('reserve', a.session, { commit: first.commit });
      const before = (await vault.operate('read', a.session, { after: 0 })) as {
        used: number;
        pending: unknown[];
      };
      assert.equal(before.pending.length, 1);
      await upload(first);
      const accepted = (await vault.operate('read', a.session, {
        after: 0,
      })) as { used: number; sequence: number };
      assert.equal(accepted.sequence, 1);
      assert.equal(accepted.used, before.used);
      await upload(first);
      assert.equal(
        (
          (await vault.operate('read', a.session, { after: 0 })) as {
            used: number;
          }
        ).used,
        accepted.used,
      );
    },
  );
  await t.test(
    'conta/aparelho pendente, CSRF, origem e upload sem reserva são rejeitados',
    async () => {
      await assert.rejects(
        vault.operate('object', outsider.session, { id: first.commit.id }),
      );
      const pendingDevice = await login();
      await assert.rejects(
        vault.operate('read', pendingDevice.session, { after: 0 }),
        /não autorizado/,
      );
      const headers = {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: `hash-talk-session=${a.sessionToken}`,
        'X-Hash-Talk-CSRF': a.session.csrf,
      };
      const denied = await fetch(`${origin}/api/account/vault/upload`, {
        method: 'POST',
        headers: { ...headers, 'X-0xdmme-Vault-Id': crypto.randomUUID() },
        body: '{}',
      });
      assert.equal(denied.status, 409);
      for (const h of [
        { ...headers, 'X-Hash-Talk-CSRF': '0'.repeat(64) },
        { ...headers, Origin: 'http://untrusted.invalid' },
      ])
        assert.equal(
          (
            await fetch(`${origin}/api/account/vault/read`, {
              method: 'POST',
              headers: h,
              body: '{"after":0}',
            })
          ).status,
          403,
        );
      const response = await fetch(`${origin}/api/account/vault/read`, {
        method: 'POST',
        headers,
        body: '{"after":0}',
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    },
  );
  const concurrentA = await prepare({
    previous: first.commit,
    value: 'edição A',
    parents: [first.commit.id],
  });
  const concurrentB = await prepare({
    previous: first.commit,
    value: 'edição B',
    parents: [first.commit.id],
    useB: true,
  });
  await t.test(
    'concorrência conserva vencedor confirmado e edição concorrente pode formar outra versão',
    async () => {
      await Promise.all([
        vault.operate('reserve', a.session, { commit: concurrentA.commit }),
        vault.operate('reserve', b.session, { commit: concurrentB.commit }),
      ]);
      await upload(concurrentA);
      await assert.rejects(
        vault.operate('upload', b.session, {
          commit: concurrentB.commit,
          ciphertext: encode(concurrentB.bytes),
        }),
        /mudou/,
      );
      await vault.operate('discard', b.session, { id: concurrentB.commit.id });
      const rebased = await prepare({
        previous: concurrentA.commit,
        value: 'edição B',
        parents: [first.commit.id],
        useB: true,
      });
      await upload(rebased, b.session);
      const state = (await vault.operate('read', a.session, { after: 0 })) as {
        commits: VaultCommit[];
      };
      assert.equal(state.commits.length, 3);
      const deltas = await Promise.all(
        state.commits.map((c) => openManifest(key, c)),
      );
      assert.deepEqual(deltas[1]?.parents, deltas[2]?.parents);
      assert.notEqual(state.commits[1]?.id, state.commits[2]?.id);
    },
  );
  let last =
    (
      (await vault.operate('read', a.session, { after: 0 })) as {
        commits: VaultCommit[];
      }
    ).commits.at(-1) ?? first.commit;
  await t.test(
    'upload interrompido/corrompido e reinício não promovem dados incompletos',
    async () => {
      const next = await prepare({ previous: last, value: 'retomável' });
      await vault.operate('reserve', a.session, { commit: next.commit });
      await assert.rejects(
        vault.operate('upload', a.session, {
          commit: next.commit,
          ciphertext: encode(next.bytes.slice(1)),
        }),
        /incompleto/,
      );
      const writer = await database.vault.beginUpload(
        a.session,
        next.commit,
        await commitHash(next.commit),
      );
      assert.ok(writer);
      await objects.put(next.bytes);
      const reopened = new Database(config.databaseUrl);
      await reopened.vault.resumeInterrupted();
      await reopened.close();
      assert.equal(
        (
          (await vault.operate('read', a.session, {
            after: last.sequence,
          })) as { commits: unknown[] }
        ).commits.length,
        0,
      );
      await upload(next);
      last = next.commit;
      await writeFile(join(directory, next.commit.block.hash), 'corrupt');
      await assert.rejects(
        vault.operate('object', a.session, { id: next.commit.id }),
        /Integridade|Objeto/,
      );
      await writeFile(join(directory, next.commit.block.hash), next.bytes);
      assert.equal(
        await openBlock(
          key,
          next.commit,
          await objects.read(next.commit.block.hash),
        ),
        'retomável',
      );
    },
  );
  await t.test(
    'reserva cheia é recusada atomicamente sem apagar versões aceitas; leituras não cobram',
    async () => {
      const next = await prepare({
        previous: last,
        value: 'x'.repeat(3_000_000),
      });
      // Synthetic occupied ledger follows the quota without allocating equivalent files.
      const current = (await vault.operate('read', a.session, {
        after: 0,
      })) as { used: number };
      const records = Math.floor((vaultQuota - current.used - 1) / 3_010_000);
      await inspector.query(
        `INSERT INTO hash_talk.vault_operations(account_id,id,hash,object_hash,commit,charge,state,sequence)
      SELECT $1::uuid,gen_random_uuid(),repeat(md5($1::uuid::text||'quota-fixture'||i),2),repeat(md5($1::uuid::text||'quota-object'||i),2),'{}',3010000,'accepted',50000+i FROM generate_series(1,$2::integer) i`,
        [a.session.accountId, records],
      );
      try {
        const before = (await vault.operate('read', a.session, {
          after: 0,
        })) as { used: number };
        assert.ok(before.used < vaultQuota);
        await assert.rejects(
          vault.operate('reserve', a.session, { commit: next.commit }),
          /Cofre cheio/,
        );
        assert.equal(
          (
            (await vault.operate('read', a.session, { after: 0 })) as {
              used: number;
            }
          ).used,
          before.used,
        );
        assert.equal(
          (
            await inspector.query(
              'SELECT id FROM hash_talk.vault_operations WHERE account_id=$1 AND id=$2',
              [a.session.accountId, next.commit.id],
            )
          ).rowCount,
          0,
        );
        assert.equal(
          await openBlock(
            key,
            first.commit,
            await objects.read(first.commit.block.hash),
          ),
          'base',
        );
      } finally {
        await inspector.query(
          'DELETE FROM hash_talk.vault_operations WHERE account_id=$1 AND sequence>50000',
          [a.session.accountId],
        );
      }
      await assert.rejects(
        vault.operate('discard', a.session, { id: first.commit.id }),
        /confirmada/,
      );
      const before = (await vault.operate('read', a.session, { after: 0 })) as {
        used: number;
      };
      await vault.operate('object', b.session, { id: first.commit.id });
      assert.equal(
        (
          (await vault.operate('read', b.session, { after: 0 })) as {
            used: number;
          }
        ).used,
        before.used,
      );
    },
  );
  await t.test(
    'limpeza de reserva abandonada preserva aceitos, upload ativo e rascunho retomável',
    async () => {
      const expired = await prepare({
        previous: last,
        value: 'rascunho antigo',
      });
      const active = await prepare({ previous: last, value: 'upload ativo' });
      await vault.operate('reserve', a.session, { commit: expired.commit });
      await vault.operate('reserve', a.session, { commit: active.commit });
      await objects.put(expired.bytes);
      const writer = await database.vault.beginUpload(
        a.session,
        active.commit,
        await commitHash(active.commit),
      );
      assert.ok(writer);
      await inspector.query(
        "UPDATE hash_talk.vault_operations SET reserved_at=now()-interval '25 hours' WHERE account_id=$1",
        [a.session.accountId],
      );
      const before = (await vault.operate('read', a.session, { after: 0 })) as {
        used: number;
      };
      await Promise.all([vault.cleanExpired(), vault.cleanExpired()]);
      const after = (await vault.operate('read', a.session, { after: 0 })) as {
        used: number;
      };
      assert.equal(before.used - after.used, operationBytes(expired.commit));
      await assert.rejects(objects.read(expired.commit.block.hash));
      assert.equal(
        await openBlock(
          key,
          first.commit,
          await objects.read(first.commit.block.hash),
        ),
        'base',
      );
      assert.equal(
        (
          await inspector.query<{ state: string }>(
            'SELECT state FROM hash_talk.vault_operations WHERE account_id=$1 AND id=$2',
            [a.session.accountId, active.commit.id],
          )
        ).rows[0]?.state,
        'writing',
      );
      await database.vault.releaseUpload(
        a.session.accountId,
        active.commit.id,
        writer ?? '',
      );
      // The client still has its ciphertext; retry recreates the expired reservation.
      await upload(expired);
      last = expired.commit;
      await vault.cleanExpired();
    },
  );
  await t.test(
    'capacidade global conta uso real, serializa contas e libera apenas reservas descartadas',
    async () => {
      const otherIdentity = await createIdentity(
        outsider.session.deviceId,
        'Outro',
      );
      const otherRecovery = await createRecovery(
        outsider.session.accountId,
        newSecret(),
      );
      const otherRing = freshKeyring(outsider.session.accountId);
      const otherAuthority = await prepareEvent({
        accountId: outsider.session.accountId,
        previous: null,
        kind: 'initialize',
        signer: 'recovery',
        signing: otherRecovery.signing,
        root: otherRecovery.root,
        identities: [otherIdentity.public],
        ring: otherRing,
        profile: null,
      });
      await devices.commit(outsider.session, {
        event: otherAuthority,
        profile: null,
      });
      const one = await prepare({ previous: last, value: 'global' });
      const descriptor = {
        accountId: outsider.session.accountId,
        id: crypto.randomUUID(),
        epoch: 1,
      };
      const otherKey = await aesKey(otherRing.keys[0] ?? '');
      const bytes = await sealBlock(otherKey, descriptor, 'global');
      const two = await sealCommit({
        unsigned: {
          version: 1,
          ...descriptor,
          deviceId: otherIdentity.public.id,
          directory: await eventHash(otherAuthority),
          authorityRevision: 1,
          sequence: 1,
          previous: null,
          block: { hash: await bytesHash(bytes), bytes: bytes.length },
        },
        change: {
          version: 1,
          entity: crypto.randomUUID(),
          kind: 'test',
          parents: [],
          label: 'global',
        },
        key: otherKey,
        sign: (proof) => sign(otherIdentity.signing, proof),
      });
      const usage = await inspector.query<{ used_bytes: string }>(
        'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton',
      );
      const baseline = Number(usage.rows[0]?.used_bytes);
      const capped = new Database(
        config.databaseUrl,
        baseline + Math.max(operationBytes(one.commit), operationBytes(two)),
      );
      try {
        const service = new VaultService({
          store: capped.vault,
          devices: database.devices,
          objects,
        });
        const results = await Promise.allSettled([
          service.operate('reserve', a.session, { commit: one.commit }),
          service.operate('reserve', outsider.session, { commit: two }),
        ]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        assert.ok(results.some((r) => r.status === 'rejected'));
        const winner =
          results[0]?.status === 'fulfilled'
            ? { session: a.session, id: one.commit.id }
            : { session: outsider.session, id: two.id };
        await service.operate('discard', winner.session, { id: winner.id });
        assert.equal(
          Number(
            (
              await inspector.query<{ used_bytes: string }>(
                'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton',
              )
            ).rows[0]?.used_bytes,
          ),
          baseline,
        );
        for (let cycle = 0; cycle < 20; cycle++) {
          await service.operate('reserve', outsider.session, { commit: two });
          await service.operate('discard', outsider.session, { id: two.id });
        }
        const metrics = await database.maintenanceSnapshot();
        assert.ok(metrics.oldestTransactionSeconds < 1);
        assert.ok(metrics.poolConnections <= 4);
        const calculated = await inspector.query<{
          actual: string;
          used: string;
        }>(
          `SELECT used_bytes::text AS used,(
            coalesce((SELECT sum(charge) FROM hash_talk.vault_operations),0)
            +coalesce((SELECT sum(octet_length(profile_ciphertext)+524) FROM hash_talk.accounts),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.message_attachments),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.personal_removals),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.message_recovery_keys),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.message_packets),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.matrix_devices),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.matrix_one_time_keys),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.matrix_envelopes),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.daily_controls),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.message_reads),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.conversation_controls),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.device_presence),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.push_subscriptions),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.push_controls),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.public_profiles),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.communities),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.community_follows),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.community_moderators),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.community_sanctions),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.community_reports),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.call_controls),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.groups),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.group_events),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.group_members),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.group_consents),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.group_creation_window),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.group_key_sets),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.group_packets),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.group_matrix_envelopes),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.group_media),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.group_cleanups),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.group_controls),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.group_reads),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.status_posts),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.status_recipients),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.status_pages),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.status_media),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.organizations),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.representative_credentials),0)
            +coalesce((SELECT sum(charge) FROM hash_talk.organization_domains),0)
          )::text AS actual FROM hash_talk.content_usage WHERE singleton`,
        );
        assert.equal(calculated.rows[0]?.used, calculated.rows[0]?.actual);
      } finally {
        await capped.close();
      }
    },
  );
  const rotated = freshKeyring(a.session.accountId, ring);
  await t.test(
    'revogação cancela upload concorrente e recuperação abre todas as versões confirmadas',
    async () => {
      const next = await prepare({
        previous: last,
        value: 'antes da revogação',
        useB: true,
      });
      await vault.operate('reserve', b.session, { commit: next.commit });
      const writer = await database.vault.beginUpload(
        b.session,
        next.commit,
        await commitHash(next.commit),
      );
      assert.ok(writer);
      await objects.put(next.bytes);
      authority = await prepareEvent({
        accountId: a.session.accountId,
        previous: authority,
        kind: 'revoke',
        signer: identity.public.id,
        signing: identity.signing,
        root: authority.root,
        identities: remainingIdentities(authority, b.session.deviceId),
        ring: rotated,
        profile: null,
      });
      await devices.commit(a.session, { event: authority, profile: null });
      await assert.rejects(
        database.vault.finishUpload({
          session: b.session,
          commit: next.commit,
          hash: await commitHash(next.commit),
          writer: writer ?? '',
        }),
      );
      await database.vault.releaseUpload(
        a.session.accountId,
        next.commit.id,
        writer ?? '',
      );
      await vault.operate('discard', a.session, { id: next.commit.id });
      await assert.rejects(
        vault.operate('object', b.session, { id: first.commit.id }),
        /não autorizado/,
      );
      const latest = await prepare({
        previous: last,
        value: 'época nova',
        parents: [last.id],
      });
      await upload(latest);
      last = latest.commit;
      const restored = await recoverSecrets(authority, secret);
      const all = (await vault.operate('read', a.session, { after: 0 })) as {
        commits: VaultCommit[];
      };
      for (const commit of all.commits) {
        const recoveredKey = await aesKey(
          restored.ring.keys[commit.epoch - 1] ?? '',
        );
        await openManifest(recoveredKey, commit);
        await openBlock(
          recoveredKey,
          commit,
          await objects.read(commit.block.hash),
        );
      }
      await assert.rejects(
        vault.operate('read', a.session, { after: last.sequence + 1 }),
        /checkpoint/,
      );
    },
  );
  await t.test(
    'backup: limpeza de versão conserva cadeia/checkpoint e recusa acesso ao objeto',
    async () => {
      const service = new MessageService(database, database.devices, objects);
      const current = await database.devices.current(a.session.accountId);
      assert.ok(current);
      const selected = {
        kind: 'vault',
        id: first.commit.id,
        hash: await commitHash(first.commit),
      };
      const payload = {
        backup: 'c'.repeat(64),
        revision: current.revision,
        items: [selected],
      };
      const proof = {
        deviceId: a.session.deviceId,
        directory: current.head,
        payload,
      };
      const input = {
        ...proof,
        signature: await sign(
          identity.signing,
          messageBody(
            a.session.accountId,
            a.session.deviceId,
            'personal-clean',
            proof,
          ),
        ),
      };
      const before = await vault.operate('read', a.session, { after: 0 });
      const cleaned = await service.operate('personal-clean', a.session, input);
      assert.equal((cleaned as { status: string }).status, 'cleaned');
      await assert.rejects(
        vault.operate('object', a.session, { id: first.commit.id }),
        { status: 410 },
      );
      const after = await vault.operate('read', a.session, { after: 0 });
      assert.equal(
        (after as { head: string }).head,
        (before as { head: string }).head,
      );
      const commits = (after as { commits: VaultCommit[] }).commits;
      assert.ok(commits.some((c) => c.id === first.commit.id));
      await assert.rejects(objects.read(first.commit.block.hash));
      const again = await service.operate('personal-clean', a.session, input);
      assert.equal((again as { released: number }).released, 0);
    },
  );
});
