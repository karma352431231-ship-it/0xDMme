import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ObjectStore } from '../../src/server/object-store/index.ts';
import {
  sealFile,
  openFile,
} from '../../src/client/attachment-crypto/index.ts';
import { encode } from '../../src/shared/account/index.ts';
import { voiceWav } from '../../src/client/voice-audio/index.ts';
import { cleanupSelection } from '../../src/shared/backups/index.ts';
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
import {
  sealLocal,
  openLocal,
} from '../../src/client/message-storage/index.ts';
import type { VaultAuthority } from '../../src/client/vault-authority/index.ts';
import { bytesHash } from '../../src/shared/vault/index.ts';
import {
  createIdentity,
  aesKey,
  newSecret,
} from '../../src/client/device-keys/index.ts';
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

await test('cortes 7–8: consentimento, E2EE, mídia e cofre social', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  const directory = await realpath(
      await mkdtemp(join(tmpdir(), '0xdmme-dm8-')),
    ),
    objects = new ObjectStore(directory);
  await objects.initialize();
  const account = new AccountService({
      store: db.authentication,
      origin: 'http://127.0.0.1:45127',
    }),
    devices = new DeviceService(db.devices),
    profiles = new PublicProfileService(db.publicProfiles, db.devices),
    communities = new CommunityService(db.communities, db.devices),
    messages = new MessageService(db, db.devices, objects);
  const accounts: string[] = [],
    addresses: string[] = [];
  await db.migrate();
  await inspector.connect();
  await initAsync();
  t.after(async () => {
    await messages.close();
    await inspector.query(
      'DELETE FROM hash_talk.social_receipts WHERE profile_id IN (SELECT id FROM hash_talk.public_profiles WHERE account_id=ANY($1::uuid[]))',
      [accounts],
    );
    await inspector.query(
      'DELETE FROM hash_talk.social_media WHERE sender IN (SELECT id FROM hash_talk.public_profiles WHERE account_id=ANY($1::uuid[])) OR recipient IN (SELECT id FROM hash_talk.public_profiles WHERE account_id=ANY($1::uuid[]))',
      [accounts],
    );
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
    await rm(directory, { recursive: true, force: true });
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
  function privateAuthority(p: Participant): VaultAuthority {
    return {
      session: p.login.session,
      offline: false,
      directory: p.directory,
      epoch: p.ring.epoch,
      events: [p.event],
      key: (epoch) => aesKey(p.ring.keys[epoch - 1]!),
      sign: (proof) => sign(p.identity.signing, proof),
    };
  }
  const privateSecret = newSecret(),
    wrappedSecret = await sealLocal(
      privateAuthority(alice),
      crypto.randomUUID(),
      privateSecret,
    ),
    capsule = {
      id: wrappedSecret.id,
      epoch: wrappedSecret.epoch,
      hash: wrappedSecret.block.hash,
      bytes: wrappedSecret.block.bytes,
      ciphertext: encode(wrappedSecret.bytes),
    };
  await t.test(
    'cápsula de recuperação de DM é opaca, idempotente e isolada entre contas',
    async () => {
      assert.deepEqual(
        await operate(alice, 'secret-save', { capsule }),
        capsule,
      );
      assert.deepEqual(
        await operate(alice, 'secret-save', { capsule }),
        capsule,
      );
      assert.equal(await operate(bob, 'secret-get', {}), null);
      assert.equal(
        await openLocal(privateAuthority(alice), wrappedSecret),
        privateSecret,
      );
      await assert.rejects(openLocal(privateAuthority(bob), wrappedSecret));
      await assert.rejects(
        operate(alice, 'secret-save', {
          capsule: { ...capsule, hash: await bytesHash(new Uint8Array([1])) },
        }),
        { status: 400 },
      );
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
      const original = await inspector.query<{ recipient_charge: number }>(
        'SELECT recipient_charge FROM hash_talk.social_messages WHERE id=$1',
        [packet.id],
      );
      await inspector.query(
        'UPDATE hash_talk.social_messages SET recipient_charge=$2 WHERE id=$1',
        [packet.id, vaultQuota],
      );
      try {
        await assert.rejects(operate(alice, 'publish', { packet: another }), {
          status: 413,
        });
      } finally {
        await inspector.query(
          'UPDATE hash_talk.social_messages SET recipient_charge=$2 WHERE id=$1',
          [packet.id, original.rows[0]?.recipient_charge],
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
    'corte 8: GIF e voz transferem por partes, retomam sem duplicar cota e entram na limpeza pessoal',
    async () => {
      const gif = Uint8Array.from(
        Buffer.from(
          'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAkQBADs=',
          'base64',
        ),
      );
      const audio = voiceWav([new Int16Array(1600)]);
      for (const [media, bytes, type, voice] of [
        ['gif', gif, 'image/gif', null],
        ['voice', audio, 'audio/wav', { sampleRate: 16000, samples: 1600 }],
      ] as const) {
        const sealed = await sealFile(bytes),
          id = crypto.randomUUID();
        const reserve = {
          message: id,
          peer: bp.id,
          refs: [sealed.file.ref],
          media,
        };
        await operate(alice, 'attachment-reserve', reserve);
        await operate(alice, 'attachment-reserve', reserve);
        await assert.rejects(
          operate(outsider, 'attachment-part', {
            id: sealed.file.ref.id,
            index: 0,
            ciphertext: encode(sealed.bytes),
          }),
          { status: 404 },
        );
        await operate(alice, 'attachment-part', {
          id: sealed.file.ref.id,
          index: 0,
          ciphertext: encode(sealed.bytes),
        });
        await operate(alice, 'attachment-part', {
          id: sealed.file.ref.id,
          index: 0,
          ciphertext: encode(sealed.bytes),
        });
        await operate(alice, 'attachment-finish', { id: sealed.file.ref.id });
        const content = {
          version: voice ? 2 : 1,
          ...(voice ? { voice } : {}),
          name: media === 'gif' ? 'teste.gif' : 'voz.wav',
          type,
          caption: '',
          image: media === 'gif',
          file: sealed.file,
          thumbnail: null,
        };
        const mediaPacket = await am.encrypt({
          authority: a.authority,
          peerHistory: [b.directory],
          recovery: [ar, br],
          id,
          text: JSON.stringify(content),
          kind: 'attachment',
          socialMedia: media,
        });
        await operate(alice, 'publish', { packet: mediaPacket });
        await assert.rejects(
          operate(outsider, 'attachment-get', {
            message: id,
            id: sealed.file.ref.id,
            index: 0,
          }),
          { status: 410 },
        );
        const got = (await operate(bob, 'attachment-get', {
          message: id,
          id: sealed.file.ref.id,
          index: 0,
        })) as { ciphertext: string };
        assert.deepEqual(
          await openFile(
            sealed.file,
            Uint8Array.from(Buffer.from(got.ciphertext, 'base64')),
          ),
          bytes,
        );
        const hash = (
          await inspector.query<{ hash: string }>(
            'SELECT hash FROM hash_talk.social_messages WHERE id=$1',
            [id],
          )
        ).rows[0]!.hash;
        await operate(bob, 'received', { items: [{ id, hash }] });
        const clean = async (owner: Participant) => {
          const payload = {
            backup: 'a'.repeat(64),
            revision: 1,
            items: [{ kind: 'dm-message', id, hash }],
          };
          const proof = {
            deviceId: owner.login.session.deviceId,
            directory: owner.directory,
            payload,
            signature: await sign(
              owner.identity.signing,
              messageBody(
                owner.login.session.accountId,
                owner.login.session.deviceId,
                'personal-clean',
                { directory: owner.directory, payload },
              ),
            ),
          };
          cleanupSelection(proof);
          return messages.operate('personal-clean', owner.login.session, proof);
        };
        await clean(alice);
        await clean(alice);
        assert.deepEqual(await operate(alice, 'secret-get', {}), capsule);
        await assert.rejects(
          operate(alice, 'attachment-get', {
            message: id,
            id: sealed.file.ref.id,
            index: 0,
          }),
          { status: 410 },
        );
        assert.deepEqual(
          (
            (await operate(bob, 'attachment-get', {
              message: id,
              id: sealed.file.ref.id,
              index: 0,
            })) as { ciphertext: string }
          ).ciphertext,
          got.ciphertext,
        );
        await clean(bob);
        const cleared = await inspector.query<{ body: unknown }>(
          'SELECT body FROM hash_talk.social_messages WHERE id=$1',
          [id],
        );
        assert.equal(cleared.rows[0]?.body, null);
        await assert.rejects(objects.readSocialAttachment(sealed.file.ref.id));
      }
    },
  );
  await t.test(
    'snapshot não entrega corpo a aparelho sem consentimento; ACK distingue cópia já recebida',
    async () => {
      const snapshot = await operate(bob, 'personal-snapshot', {});
      const page = (await operate(bob, 'personal-page', {
        snapshot,
        after: 0,
      })) as { items: { id: string; packet?: unknown }[] };
      assert.ok(page.items.some((row) => row.id === packet.id && row.packet));
      const hash = (
        await inspector.query<{ hash: string }>(
          'SELECT hash FROM hash_talk.social_messages WHERE id=$1',
          [packet.id],
        )
      ).rows[0]!.hash;
      await operate(bob, 'received', { items: [{ id: packet.id, hash }] });
    },
  );
  await t.test(
    'bloqueio social impede conteúdo/chaves sem mudar o contato privado',
    async () => {
      await operate(bob, 'block', { peer: ap.id, blocked: true });
      const snapshot = await operate(bob, 'personal-snapshot', {});
      const received = (await operate(bob, 'personal-page', {
        snapshot,
        after: 0,
      })) as { items: { id: string; packet?: unknown }[] };
      assert.ok(
        received.items.some((row) => row.id === packet.id && row.packet),
      );
      const freshDevice = {
        ...bob,
        login: {
          ...bob.login,
          session: { ...bob.login.session, deviceId: crypto.randomUUID() },
        },
      };
      await assert.rejects(
        operate(freshDevice, 'personal-page', { snapshot, after: 0 }),
        { status: 403 },
      );
      const senderSnapshot = await operate(alice, 'personal-snapshot', {});
      const sent = (await operate(alice, 'personal-page', {
        snapshot: senderSnapshot,
        after: 0,
      })) as { items: { id: string; packet?: unknown }[] };
      assert.ok(sent.items.some((row) => row.id === packet.id && row.packet));
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
      assert.deepEqual(await operate(recovered, 'secret-get', {}), capsule);
      assert.equal(
        await openLocal(privateAuthority(recovered), wrappedSecret),
        privateSecret,
      );
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
