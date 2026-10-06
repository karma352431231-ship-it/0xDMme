import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { initAsync } from '@matrix-org/matrix-sdk-crypto-wasm';
import { Database } from '../../src/server/database/index.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { PublicProfileService } from '../../src/server/public-profile/index.ts';
import { CommunityService } from '../../src/server/communities/index.ts';
import { MessageService } from '../../src/server/messages/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { messageBody } from '../../src/shared/messages/index.ts';
import { vaultQuota } from '../../src/shared/vault/index.ts';
import { sign, eventHash } from '../../src/shared/devices/index.ts';
import { createIdentity } from '../../src/client/device-keys/index.ts';
import {
  freshKeyring,
  prepareEvent,
} from '../../src/client/device-operations/index.ts';
import {
  socialPage,
  socialRelation,
} from '../../src/shared/social-dm/index.ts';
import { MessageCrypto } from '../../src/client/message-crypto/index.ts';
import {
  createRecoveryKey,
  openRecoveryKey,
  openRoomKey,
} from '../../src/client/message-recovery/index.ts';
import { createCommunityAccount } from './community-fixture.ts';
import { groupParticipant } from '../fixtures/group-participant.ts';

await test('corte 7: consentimento próprio, E2EE e isolamento de IDs/autoridade', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  const account = new AccountService({
      store: db.authentication,
      origin: 'http://127.0.0.1:45127',
    }),
    devices = new DeviceService(db.devices),
    profiles = new PublicProfileService(db.publicProfiles, db.devices),
    communities = new CommunityService(db.communities, db.devices),
    messages = new MessageService(db, db.devices);
  const accounts: string[] = [],
    addresses: string[] = [];
  await db.migrate();
  await inspector.connect();
  await initAsync();
  t.after(async () => {
    await inspector.query(
      'DELETE FROM hash_talk.social_messages WHERE sender IN (SELECT id FROM hash_talk.public_profiles WHERE account_id=ANY($1::uuid[])) OR recipient IN (SELECT id FROM hash_talk.public_profiles WHERE account_id=ANY($1::uuid[]))',
      [accounts],
    );
    for (const table of [
      'device_events',
      'device_directories',
      'login_sessions',
      'login_devices',
    ])
      await inspector.query(
        `DELETE FROM hash_talk.${table} WHERE account_id=ANY($1::uuid[])`,
        [accounts],
      );
    await inspector.query(
      'DELETE FROM hash_talk.accounts WHERE id=ANY($1::uuid[])',
      [accounts],
    );
    await inspector.query(
      'DELETE FROM hash_talk.login_challenges WHERE address=ANY($1::text[])',
      [addresses],
    );
    await inspector.end();
    await db.close();
  });
  const make = () =>
    createCommunityAccount({
      account,
      devices,
      profiles,
      communities,
      accounts,
      addresses,
    });
  const alice = await make(),
    bob = await make(),
    outsider = await make();
  const ap = await alice.publicIdentity(
      `dm_${crypto.randomUUID().slice(0, 8)}`,
    ),
    bp = await bob.publicIdentity(`dm_${crypto.randomUUID().slice(0, 8)}`),
    op = await outsider.publicIdentity(`dm_${crypto.randomUUID().slice(0, 8)}`);
  type Participant = typeof alice;
  async function operate(
    p: Participant,
    operation: string,
    payload: Record<string, unknown>,
  ) {
    if (operation === 'block' && payload['revision'] === undefined) {
      const state = await operate(p, 'state', { peer: payload['peer'] });
      payload = {
        ...payload,
        revision: state === null ? 0 : socialRelation(state).blockRevision,
      };
    }
    const proof = {
      deviceId: p.login.session.deviceId,
      directory: p.directory,
      payload,
    };
    return messages.operate(`dm-${operation}`, p.login.session, {
      ...proof,
      signature: await sign(
        p.identity.signing,
        messageBody(
          p.login.session.accountId,
          p.login.session.deviceId,
          `dm-${operation}`,
          proof,
        ),
      ),
    });
  }
  const a = await groupParticipant({
      accountId: ap.id,
      deviceName: 'Aparelho de DMs',
    }),
    b = await groupParticipant({
      accountId: bp.id,
      deviceName: 'Aparelho de DMs',
    });
  await t.test(
    'contato privado não dá consentimento social; pedido não contém dados privados',
    async () => {
      await inspector.query(
        "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'approved')",
        [alice.login.session.accountId, bob.login.session.accountId],
      );
      await assert.rejects(
        operate(alice, 'directory', { peer: bp.id, after: 0 }),
        { status: 403 },
      );
      const requested = socialRelation(
        await operate(alice, 'request', { peer: bp.id }),
      );
      assert.equal(requested.canSend, false);
      assert.equal(
        socialRelation(await operate(alice, 'request', { peer: bp.id }))
          .revision,
        requested.revision,
      );
      for (const value of [
        bob.login.session.accountId,
        bob.login.session.deviceId,
        bob.wallet.address,
        bob.identity.public.signing,
      ])
        assert.equal(JSON.stringify(requested).includes(value), false);
      await assert.rejects(
        operate(alice, 'decide', { peer: bp.id, revision: 1, accept: true }),
        { status: 403 },
      );
      await operate(bob, 'decide', { peer: ap.id, revision: 1, accept: true });
      await operate(bob, 'decide', { peer: ap.id, revision: 1, accept: true });
      assert.equal(
        socialRelation(await operate(alice, 'state', { peer: bp.id })).canSend,
        true,
      );
    },
  );
  await t.test(
    'diretório e tipos privados não podem entrar no contexto social',
    async () => {
      await assert.rejects(operate(alice, 'register', { event: alice.event }), {
        status: 400,
      });
      await operate(alice, 'register', { event: a.directory });
      await operate(bob, 'register', { event: b.directory });
      const peer = await operate(alice, 'directory', { peer: bp.id, after: 0 });
      for (const value of [
        bob.login.session.accountId,
        bob.login.session.deviceId,
        bob.identity.public.signing,
        bob.event.root.signing,
        bob.wallet.address,
      ])
        assert.equal(JSON.stringify(peer).includes(value), false);
      await assert.rejects(
        operate(outsider, 'directory', { peer: bp.id, after: 0 }),
        { status: 403 },
      );
      await assert.rejects(operate(alice, 'call', { peer: bp.id }), {
        status: 404,
      });
    },
  );
  const ar = await createRecoveryKey(a.authority),
    br = await createRecoveryKey(b.authority);
  await operate(alice, 'recovery-register', { key: ar });
  await operate(bob, 'recovery-register', { key: br });
  const am = await MessageCrypto.create({
      accountId: ap.id,
      deviceId: a.deviceId,
      store: null,
      transport: (operation, payload) => operate(alice, operation, payload),
    }),
    bm = await MessageCrypto.create({
      accountId: bp.id,
      deviceId: b.deviceId,
      store: null,
      transport: (operation, payload) => operate(bob, operation, payload),
    });
  t.after(() => {
    am.close();
    bm.close();
  });
  await am.prepare(a.authority);
  await bm.prepare(b.authority);
  const packet = await am.encrypt({
    authority: a.authority,
    peerHistory: [b.directory],
    recovery: [ar, br],
    id: crypto.randomUUID(),
    text: 'DM sintética https://0xdmme.app',
  });
  await t.test(
    'publicação idempotente e recuperação usam SDK real e nenhuma identidade privada',
    async () => {
      const beforeA = (
          await db.vault.page(alice.login.session, alice.directory, 0)
        ).used,
        beforeB = (await db.vault.page(bob.login.session, bob.directory, 0))
          .used;
      await operate(alice, 'publish', { packet });
      const afterA = (
          await db.vault.page(alice.login.session, alice.directory, 0)
        ).used,
        afterB = (await db.vault.page(bob.login.session, bob.directory, 0))
          .used;
      const logical = Buffer.byteLength(JSON.stringify(packet)) + 512;
      assert.equal(afterA - beforeA, logical);
      assert.equal(afterB - beforeB, logical);
      await operate(alice, 'publish', { packet });
      assert.equal(
        (await db.vault.page(alice.login.session, alice.directory, 0)).used,
        afterA,
      );
      assert.equal(
        (await db.vault.page(bob.login.session, bob.directory, 0)).used,
        afterB,
      );
      const page = (await operate(bob, 'page', {
        peer: ap.id,
        before: null,
      })) as { items: { packet: typeof packet }[] };
      assert.equal(page.items.length, 1);
      const archive = packet.archives.find((k) => k.accountId === bp.id);
      assert.ok(archive);
      const key = await openRecoveryKey(br, b.authority);
      try {
        assert.equal(
          await bm.decrypt({
            packet: page.items[0]!.packet,
            senderEvent: a.directory,
            exported: openRoomKey(key, archive),
          }),
          'DM sintética https://0xdmme.app',
        );
      } finally {
        key.free();
      }
      await assert.rejects(
        operate(alice, 'publish', { packet: { ...packet, kind: 'profile' } }),
        { status: 400 },
      );
      await assert.rejects(
        operate(outsider, 'page', { peer: ap.id, before: null }),
        { status: 403 },
      );
      const result = await inspector.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM hash_talk.social_messages WHERE id=$1',
        [packet.id],
      );
      assert.equal(result.rows[0]?.count, 1);
      await assert.rejects(
        inspector.query('DELETE FROM hash_talk.public_profiles WHERE id=$1', [
          ap.id,
        ]),
        { code: '23503' },
      );
    },
  );
  await t.test(
    'cofre pessoal cheio recusa a DM antes da aceitação e reverte sua gravação',
    async () => {
      const another = await am.encrypt({
        authority: a.authority,
        peerHistory: [b.directory],
        recovery: [ar, br],
        id: crypto.randomUUID(),
        text: 'Não aceitar com cofre cheio',
      });
      const original = await inspector.query<{ personal_charge: number }>(
        'SELECT personal_charge FROM hash_talk.social_messages WHERE id=$1',
        [packet.id],
      );
      await inspector.query(
        'UPDATE hash_talk.social_messages SET personal_charge=$2 WHERE id=$1',
        [packet.id, vaultQuota],
      );
      try {
        await assert.rejects(operate(alice, 'publish', { packet: another }), {
          status: 413,
        });
      } finally {
        await inspector.query(
          'UPDATE hash_talk.social_messages SET personal_charge=$2 WHERE id=$1',
          [packet.id, original.rows[0]?.personal_charge],
        );
      }
      const rows = await inspector.query(
        'SELECT 1 FROM hash_talk.social_messages WHERE id=$1',
        [another.id],
      );
      assert.equal(rows.rowCount, 0);
    },
  );
  await t.test(
    'bloqueio social impede conteúdo/chaves sem mudar o contato privado',
    async () => {
      await operate(bob, 'block', { peer: ap.id, blocked: true });
      await assert.rejects(
        operate(alice, 'page', { peer: bp.id, before: null }),
        { status: 403 },
      );
      await assert.rejects(
        operate(alice, 'matrix-query', {
          sdk: { device_keys: { [`@${bp.id}:0xdmme.app`]: [] } },
        }),
        { status: 403 },
      );
      const privateConsent = await inspector.query(
        "SELECT 1 FROM hash_talk.contact_relations WHERE lo=least($1::uuid,$2::uuid) AND hi=greatest($1::uuid,$2::uuid) AND state='approved'",
        [alice.login.session.accountId, bob.login.session.accountId],
      );
      assert.equal(privateConsent.rowCount, 1);
      await operate(bob, 'block', { peer: ap.id, blocked: false });
      assert.equal(
        socialPage(await operate(alice, 'list', { after: null })).items[0]
          ?.canSend,
        false,
      );
      const fresh = socialRelation(
        await operate(bob, 'request', { peer: ap.id }),
      );
      await assert.rejects(
        operate(bob, 'decide', { peer: ap.id, revision: 1, accept: true }),
        { status: 403 },
      );
      await operate(alice, 'decide', {
        peer: bp.id,
        revision: fresh.revision,
        accept: true,
      });
    },
  );
  await t.test(
    'capacidade global recusa nova solicitação sem efeito parcial',
    async () => {
      const small = new Database(config.databaseUrl, 1),
        service = new MessageService(small, small.devices);
      try {
        const payload = { peer: op.id },
          proof = {
            deviceId: alice.login.session.deviceId,
            directory: alice.directory,
            payload,
          };
        await assert.rejects(
          service.operate('dm-request', alice.login.session, {
            ...proof,
            signature: await sign(
              alice.identity.signing,
              messageBody(
                alice.login.session.accountId,
                alice.login.session.deviceId,
                'dm-request',
                proof,
              ),
            ),
          }),
          { status: 503 },
        );
        assert.equal(await operate(alice, 'state', { peer: op.id }), null);
      } finally {
        await small.close();
      }
    },
  );
  await t.test(
    'bloquear um perfil sem solicitação não cria consentimento e permite desbloquear pela lista',
    async () => {
      await operate(alice, 'block', { peer: op.id, blocked: true });
      assert.equal(
        socialRelation(await operate(alice, 'state', { peer: op.id })).blocked,
        true,
      );
      assert.equal(
        socialPage(await operate(alice, 'list', { after: null })).items.find(
          (row) => row.peer.id === op.id,
        )?.blocked,
        true,
      );
      await assert.rejects(operate(outsider, 'request', { peer: ap.id }), {
        status: 403,
      });
      await operate(alice, 'block', { peer: op.id, blocked: false });
      assert.equal(
        socialRelation(await operate(alice, 'state', { peer: op.id })).blocked,
        false,
      );
      const revision = socialRelation(
        await operate(alice, 'state', { peer: op.id }),
      ).blockRevision;
      await operate(alice, 'block', { peer: op.id, blocked: true, revision });
      await operate(alice, 'block', { peer: op.id, blocked: true, revision });
      await assert.rejects(
        operate(alice, 'block', {
          peer: op.id,
          blocked: false,
          revision: revision - 1,
        }),
        { status: 409 },
      );
      assert.equal(
        socialRelation(await operate(alice, 'state', { peer: op.id })).blocked,
        true,
      );
      await operate(alice, 'block', { peer: op.id, blocked: false });
    },
  );
  await t.test(
    'recuperação privada revoga o aparelho antigo e atualiza a identidade social sem perder consentimento/histórico',
    async () => {
      const challenge = await account.challenge({
        address: alice.wallet.address,
        chainId: 1,
        deviceId: crypto.randomUUID(),
      });
      const login = await account.login(
        {
          id: challenge.id,
          signature: await alice.wallet.signMessage(challenge.message),
        },
        challenge.browserToken,
      );
      const identity = await createIdentity(
          login.session.deviceId,
          'Recuperado sintético',
        ),
        ring = freshKeyring(login.session.accountId, alice.ring);
      const event = await prepareEvent({
        accountId: login.session.accountId,
        previous: alice.event,
        kind: 'recover',
        signer: 'recovery',
        signing: alice.recovery.signing,
        root: alice.recovery.root,
        identities: [identity.public],
        ring,
        profile: null,
      });
      await devices.commit(login.session, { event, profile: null });
      await assert.rejects(operate(alice, 'list', { after: null }), {
        status: 403,
      });
      await assert.rejects(
        operate(bob, 'matrix-query', {
          sdk: { device_keys: { [`@${ap.id}:0xdmme.app`]: [] } },
        }),
        { status: 409 },
      );
      const recovered = {
        ...alice,
        login,
        identity,
        ring,
        event,
        directory: await eventHash(event),
      };
      const publicDevice = await createIdentity(
        crypto.randomUUID(),
        'Aparelho de DMs',
      );
      const updated = await prepareEvent({
        accountId: ap.id,
        previous: a.directory,
        kind: 'recover',
        signer: 'recovery',
        signing: a.recovery.signing,
        root: a.directory.root,
        identities: [publicDevice.public],
        ring: freshKeyring(ap.id, a.ring),
        profile: null,
      });
      await operate(recovered, 'register', { event: updated });
      assert.equal(
        socialRelation(await operate(recovered, 'state', { peer: bp.id }))
          .canSend,
        true,
      );
      const page = (await operate(recovered, 'page', {
        peer: bp.id,
        before: null,
      })) as { items: unknown[] };
      assert.equal(page.items.length, 1);
      const peerKeys = (await operate(bob, 'matrix-query', {
        sdk: { device_keys: { [`@${ap.id}:0xdmme.app`]: [] } },
      })) as { bindings: unknown[] };
      assert.equal(peerKeys.bindings.length, 0);
    },
  );
});
