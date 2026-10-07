import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { AccountError, encode } from '../../src/shared/account/index.ts';
import {
  communityPage,
  communityState,
} from '../../src/shared/communities/index.ts';
import { Database } from '../../src/server/database/index.ts';
import {
  AccountService,
  createAccountHandler,
} from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { PublicProfileService } from '../../src/server/public-profile/index.ts';
import {
  PublicModerationService,
  PublicModerationOperator,
} from '../../src/server/public-moderation/index.ts';
import { publicModerationNotice } from '../../src/shared/public-moderation/index.ts';
import { publicProfileBody } from '../../src/shared/public-profile/index.ts';
import { sign } from '../../src/shared/devices/index.ts';
import {
  CommunityService,
  createCommunityHandler,
} from '../../src/server/communities/index.ts';
import { createWebServer } from '../../src/server/web-host/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { createCommunityAccount } from './community-fixture.ts';
import { checkOperatorPreview } from './moderation-operator-fixture.ts';
import { prepareEvent } from '../../src/client/device-operations/index.ts';
import { freshKeyring } from '../../src/client/device-operations/index.ts';
import { createIdentity } from '../../src/client/device-keys/index.ts';

await test('comunidades: criação aberta, privacidade, gestão, sanções, denúncias e capacidade transacional', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de teste necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  const origin = 'http://127.0.0.1:45121',
    account = new AccountService({ store: db.authentication, origin }),
    devices = new DeviceService(db.devices);
  const profiles = new PublicProfileService(db.publicProfiles, db.devices),
    communities = new CommunityService(db.communities, db.devices);
  const moderation = new PublicModerationService({
    profiles: db.publicProfiles,
    communities: db.communities,
  });
  const host = createWebServer({
    origin,
    assets: new Map(),
    database: db,
    objects: { healthy: () => Promise.resolve(true) },
    communities: createCommunityHandler({
      read: (id) => communities.read(id),
      list: (after) => communities.list(after),
    }),
    account: createAccountHandler({ origin, service: account, communities }),
  });
  const accounts: string[] = [],
    addresses: string[] = [],
    ids: string[] = [];
  await db.migrate();
  await inspector.connect();
  // Drain migration-scheduled legacy candidates before measuring fixture deltas.
  await moderation.initialize();
  t.after(async () => {
    await host.close();
    await moderation.close();
    await inspector.query(
      'DELETE FROM hash_talk.communities WHERE id=ANY($1::uuid[])',
      [ids],
    );
    await inspector.query(
      "DELETE FROM hash_talk.public_moderation WHERE kind='community-photo' AND target=ANY($1::uuid[])",
      [ids],
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
  await new Promise<void>((resolve, reject) => {
    host.server.once('error', reject);
    host.server.listen(45121, '127.0.0.1', resolve);
  });
  const create = () =>
    createCommunityAccount({
      account,
      devices,
      communities,
      profiles,
      accounts,
      addresses,
    });
  const owner = await create(),
    mod = await create(),
    participant = await create(),
    stranger = await create();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  const ownerProfile = await owner.publicIdentity(`o_${suffix}`),
    modProfile = await mod.publicIdentity(`m_${suffix}`),
    participantProfile = await participant.publicIdentity(`p_${suffix}`);
  const meta = {
    name: 'Comunidade sintética',
    description: 'Memes e discussões',
    rules: 'Respeite os participantes.',
  };
  const id = crypto.randomUUID();
  ids.push(id);
  const state = async (person = owner) =>
    communityState(await person.operate('state', { id }));
  const change = async (
    person: typeof owner,
    operation: string,
    data: Record<string, unknown>,
  ) =>
    communityState(
      await person.operate(operation, {
        id,
        ...(operation === 'follow'
          ? {}
          : { revision: (await state(person)).community.revision }),
        ...data,
      }),
    );
  const bad = (status: number) => (error: unknown) =>
    error instanceof AccountError && error.status === status;

  await t.test(
    'criação é gratuita, exige perfil explícito, admite nomes iguais e retry conserva a comunidade',
    async () => {
      await assert.rejects(stranger.operate('create', { id, meta }), bad(403));
      const result = communityState(
        await owner.operate('create', { id, meta }),
      );
      assert.equal(result.role, 'owner');
      assert.equal(result.following, false);
      assert.equal(result.canPost, true);
      assert.equal(result.community.owner?.id, ownerProfile.id);
      assert.deepEqual(
        communityState(await owner.operate('create', { id, meta })),
        result,
      );
      await assert.rejects(
        participant.operate('create', { id, meta }),
        bad(409),
      );
      const duplicate = crypto.randomUUID();
      ids.push(duplicate);
      assert.equal(
        communityState(
          await participant.operate('create', { id: duplicate, meta }),
        ).community.name,
        meta.name,
      );
      assert.equal((await state(participant)).canPost, true);
    },
  );
  await t.test(
    'leitura pública não exige conta; follows não publicam identidade ou lista de usuários',
    async () => {
      const result = await fetch(`${origin}/api/communities/${id}`);
      assert.equal(result.status, 200);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      const data = (await result.json()) as Record<string, unknown>;
      assert.deepEqual(
        Object.keys(data).sort(),
        [
          'id',
          'name',
          'description',
          'rules',
          'revision',
          'archived',
          'avatar',
          'owner',
          'followers',
        ].sort(),
      );
      assert.equal(
        JSON.stringify(data).includes(owner.login.session.accountId),
        false,
      );
      assert.equal(
        JSON.stringify(data).includes(owner.login.session.address),
        false,
      );
      const after = await change(participant, 'follow', { following: true });
      assert.equal(after.following, true);
      assert.equal(after.community.followers, 1);
      assert.equal(
        (await change(participant, 'follow', { following: true })).community
          .followers,
        1,
      );
      const following = communityPage(
        await participant.operate('list', { kind: 'following', after: null }),
      );
      assert.ok(following.items.some((item) => item.id === id));
      const ownerFollowing = communityPage(
        await owner.operate('list', { kind: 'following', after: null }),
      );
      assert.equal(
        ownerFollowing.items.some((item) => item.id === id),
        false,
      );
      const unfollowed = await change(participant, 'follow', {
        following: false,
      });
      assert.equal(unfollowed.canPost, true);
      assert.equal(unfollowed.community.followers, 0);
      const invalid = await fetch(`${origin}/api/communities/${id}/followers`);
      assert.equal(invalid.status, 404);
      await assert.rejects(
        participant.operate('list', { kind: 'followers', after: null }),
        bad(400),
      );
    },
  );
  await t.test(
    'gestão usa funções atuais, revisão concorrente e foto restrita; moderação não recebe dados privados',
    async () => {
      await assert.rejects(
        change(participant, 'edit', {
          meta: { ...meta, name: 'Não autorizado' },
        }),
        bad(403),
      );
      const before = await state();
      const named = await change(owner, 'role', {
        target: modProfile.id,
        moderator: true,
      });
      assert.equal(named.community.revision, before.community.revision + 1);
      assert.equal((await state(mod)).role, 'moderator');
      await assert.rejects(
        change(mod, 'role', { target: participantProfile.id, moderator: true }),
        bad(403),
      );
      const changed = await change(mod, 'edit', {
        meta: { ...meta, name: 'Nome alterado' },
      });
      assert.equal(changed.community.name, 'Nome alterado');
      await assert.rejects(
        owner.operate('edit', {
          id,
          revision: before.community.revision,
          meta,
        }),
        bad(409),
      );
      const bytes = new Uint8Array(
        await readFile(
          new URL('../../src/client/app/icon-192.png', import.meta.url),
        ),
      );
      const own = await change(owner, 'photo', {
        photo: { type: 'image/png', bytes: encode(bytes) },
      });
      assert.deepEqual(own.pendingPhoto?.bytes, bytes);
      assert.equal((await state(mod)).pendingPhoto?.bytes.length, bytes.length);
      assert.equal((await state(participant)).pendingPhoto, null);
      assert.equal((await communities.read(id)).avatar, null);
      const response = await fetch(`${origin}/api/communities/${id}`);
      assert.equal(
        JSON.stringify(await response.json()).includes(encode(bytes)),
        false,
      );
      const oldRevision = own.community.revision;
      assert.equal(
        communityState(
          await owner.operate('photo', {
            id,
            revision: oldRevision - 1,
            photo: { type: 'image/png', bytes: encode(bytes) },
          }),
        ).community.revision,
        oldRevision,
      );
      await change(mod, 'photo', { photo: null });
      const staff = (await mod.operate('staff', { id, after: null })) as {
        items: unknown[];
      };
      assert.equal(staff.items.length, 1);
      assert.equal(
        JSON.stringify(staff).includes(mod.login.session.accountId),
        false,
      );
      await assert.rejects(
        participant.operate('staff', { id, after: null }),
        bad(403),
      );
    },
  );
  await t.test(
    'foto: autoria da análise, contestação restrita, substituição, capacidade líquida e descarte',
    async () => {
      const png = new Uint8Array(
          await readFile(
            new URL('../../src/client/app/icon-192.png', import.meta.url),
          ),
        ),
        bigger = new Uint8Array(
          await readFile(
            new URL('../../src/client/app/icon-512.png', import.meta.url),
          ),
        );
      const model = { hash: 'b'.repeat(64), runtime: 'isolated-contract-test' };
      async function profileOperation(
        person: typeof owner,
        operation: string,
        payload: Record<string, unknown>,
      ) {
        const body = { directory: person.directory, payload };
        return profiles.operate(operation, person.login.session, {
          ...body,
          signature: await sign(
            person.identity.signing,
            publicProfileBody(
              person.login.session.accountId,
              person.login.session.deviceId,
              operation,
              body,
            ),
          ),
        });
      }
      async function notices(person: typeof owner) {
        const data = await profileOperation(person, 'moderation-notices', {
          after: null,
        });
        assert.ok(Array.isArray(data));
        return data.map(publicModerationNotice);
      }
      async function upload(person: typeof owner, bytes: Uint8Array) {
        await change(person, 'photo', {
          photo: { type: 'image/png', bytes: encode(bytes) },
        });
        const pending = (await notices(person)).find(
          (item) => item.target === id && item.status === 'pending',
        );
        assert.ok(pending);
        return pending;
      }
      async function usage() {
        const result = await inspector.query<{ bytes: string }>(
          'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
        );
        return Number(result.rows[0]!.bytes);
      }
      const first = await upload(mod, bigger);
      assert.equal(
        (await notices(owner)).some((item) => item.id === first.id),
        false,
      );
      await change(mod, 'photo', {
        photo: { type: 'image/png', bytes: encode(bigger) },
      });
      assert.deepEqual(
        (await notices(mod)).find((item) => item.id === first.id),
        first,
      );
      const claimed = await db.publicModeration.claim(model);
      assert.ok(claimed);
      assert.equal(claimed.id, first.id);
      assert.equal(claimed.owner, modProfile.id);
      assert.equal(
        claimed.contentHash,
        createHash('sha256').update(bigger).digest('hex'),
      );
      assert.deepEqual(
        (await db.communities.moderationCandidate(claimed))?.bytes,
        bigger,
      );
      await db.publicModeration.finish(
        claimed,
        { ...claimed, frames: 1, expectedFrames: 1, verdict: 'hold' },
        (client, review) => db.communities.bindModeration(client, review),
      );
      await assert.rejects(
        profileOperation(owner, 'moderation-appeal', {
          id: first.id,
          reason: 'Sou dono da comunidade.',
        }),
        bad(404),
      );
      const appealed = await profileOperation(mod, 'moderation-appeal', {
        id: first.id,
        reason: 'Peço revisão do candidato sintético.',
      });
      assert.equal(
        publicModerationNotice(appealed).appeal,
        'Peço revisão do candidato sintético.',
      );
      const operator = new PublicModerationOperator(db, config.objectDirectory);
      assert.ok(
        (await operator.list(null)).some((item) => item.id === first.id),
      );
      assert.deepEqual((await operator.preview(first.id)).bytes, bigger);
      await checkOperatorPreview({
        databaseUrl: config.databaseUrl,
        objectDirectory: config.objectDirectory,
        id: first.id,
        bytes: bigger,
      });
      await assert.rejects(
        operator.review({
          id: first.id,
          verdict: 'allow',
          reason: 'Teste sem conteúdo proibido.',
          confirmsPermitted: false,
        }),
        bad(400),
      );
      const review = {
        id: first.id,
        verdict: 'allow' as const,
        reason: 'Teste sem conteúdo proibido.',
        confirmsPermitted: true,
      };
      assert.equal((await operator.review(review)).status, 'approved');
      assert.deepEqual(
        await operator.review(review),
        await operator.review(review),
      );
      await assert.rejects(operator.preview(first.id), bad(404));
      const limited = new Database(config.databaseUrl, (await usage()) + 1_023);
      try {
        const service = new CommunityService(limited.communities, db.devices);
        const payload = {
          id,
          revision: (await state()).community.revision,
          photo: { type: 'image/png', bytes: encode(png) },
        };
        await service.operate(
          'photo',
          owner.login.session,
          await owner.proof('photo', payload),
        );
      } finally {
        await limited.close();
      }
      assert.deepEqual((await state()).pendingPhoto?.bytes, png);
      assert.equal(
        (await notices(mod)).find((item) => item.id === first.id)?.status,
        'removed',
      );
      const stale = await db.publicModeration.claim(model);
      assert.ok(stale);
      const replacement = await upload(mod, bigger);
      await assert.rejects(
        db.publicModeration.finish(
          stale,
          { ...stale, frames: 1, expectedFrames: 1, verdict: 'allow' },
          (client, review) => db.communities.bindModeration(client, review),
        ),
        bad(409),
      );
      assert.equal(await db.communities.moderationCandidate(stale), null);
      await inspector.query(
        "UPDATE hash_talk.public_moderation SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",
        [replacement.id],
      );
      const before = await usage();
      assert.equal(
        (await state()).pendingPhoto,
        null,
        'Prazo fecha a leitura antes da coleta física.',
      );
      await moderation.clean();
      assert.equal((await state()).pendingPhoto, null);
      assert.equal(before - (await usage()), bigger.length);
      assert.equal(
        (await notices(mod)).find((item) => item.id === replacement.id)?.status,
        'expired',
      );
      const last = await upload(owner, png),
        approved = await db.publicModeration.claim(model);
      assert.ok(approved);
      assert.equal(approved.id, last.id);
      await db.publicModeration.finish(
        approved,
        { ...approved, frames: 1, expectedFrames: 1, verdict: 'allow' },
        (client, review) => db.communities.bindModeration(client, review),
      );
      await inspector.query(
        "UPDATE hash_talk.public_moderation SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",
        [last.id],
      );
      await moderation.clean();
      assert.deepEqual((await state()).pendingPhoto?.bytes, png);
      assert.equal((await communities.read(id)).avatar, null);
      await change(mod, 'photo', { photo: null });
    },
  );
  await t.test(
    'sanções são reversíveis, impedem participação sem depender de seguir e permitem uma contestação',
    async () => {
      await assert.rejects(
        change(mod, 'sanction', {
          record: crypto.randomUUID(),
          target: ownerProfile.id,
          reason: 'Teste',
          days: null,
        }),
        bad(403),
      );
      await assert.rejects(
        change(owner, 'sanction', {
          record: crypto.randomUUID(),
          target: modProfile.id,
          reason: 'Teste',
          days: 1,
        }),
        bad(403),
      );
      const record = crypto.randomUUID();
      await change(mod, 'sanction', {
        record,
        target: participantProfile.id,
        reason: 'Violação da regra local',
        days: 1,
      });
      const suspended = await state(participant);
      assert.equal(suspended.canPost, false);
      assert.equal(suspended.following, false);
      assert.equal(suspended.sanction?.reason, 'Violação da regra local');
      await assert.rejects(
        change(participant, 'follow', { following: true }),
        bad(403),
      );
      await assert.rejects(
        db.communities.withParticipation(
          {
            session: participant.login.session,
            directory: participant.directory,
          },
          id,
          () => Promise.resolve('publicado'),
        ),
        bad(403),
      );
      await assert.rejects(
        mod.operate('appeal', { id, record, text: 'Outro perfil' }),
        bad(403),
      );
      await participant.operate('appeal', {
        id,
        record,
        text: 'Peço revisão.',
      });
      await participant.operate('appeal', {
        id,
        record,
        text: 'Peço revisão.',
      });
      await assert.rejects(
        participant.operate('appeal', {
          id,
          record,
          text: 'Outra contestação',
        }),
        bad(409),
      );
      const ownRecords = (await participant.operate('sanctions', {
        id,
        after: null,
      })) as { items: unknown[] };
      assert.equal(ownRecords.items.length, 1);
      await change(mod, 'decide-sanction', {
        record,
        decision: 'Revisado; sanção retirada.',
        lift: true,
      });
      assert.equal((await state(participant)).canPost, true);
      const published = await db.communities.withParticipation(
        {
          session: participant.login.session,
          directory: participant.directory,
        },
        id,
        () => Promise.resolve('permitido sem seguir'),
      );
      assert.equal(published, 'permitido sem seguir');
      const permanent = crypto.randomUUID();
      await change(mod, 'sanction', {
        record: permanent,
        target: participantProfile.id,
        reason: 'Nova violação',
        days: null,
      });
      assert.equal((await state(participant)).sanction?.until, null);
      await change(owner, 'decide-sanction', {
        record: permanent,
        decision: 'Banimento retirado.',
        lift: true,
      });
      const expired = crypto.randomUUID();
      await change(mod, 'sanction', {
        record: expired,
        target: participantProfile.id,
        reason: 'Suspensão temporária para validar expiração.',
        days: 1,
      });
      await inspector.query(
        "UPDATE hash_talk.community_sanctions SET until_at=now()-interval '1 second' WHERE community_id=$1 AND id=$2",
        [id, expired],
      );
      const afterExpiry = await state(participant);
      assert.equal(afterExpiry.canPost, true);
      assert.equal(afterExpiry.sanction, null);
      await participant.operate('appeal', {
        id,
        record: expired,
        text: 'Peço revisão do registro após expirar a suspensão.',
      });
      const history = (await participant.operate('sanctions', {
        id,
        after: null,
      })) as { items: { id: string; appeal: string | null }[] };
      assert.equal(
        history.items.find((item) => item.id === expired)?.appeal,
        'Peço revisão do registro após expirar a suspensão.',
      );
    },
  );
  await t.test(
    'denúncias conservam acompanhamento e escondem o denunciante dos gestores e visitantes',
    async () => {
      const record = crypto.randomUUID();
      await participant.operate('report', {
        id,
        record,
        reason: 'Revisar a regra da comunidade.',
      });
      await participant.operate('report', {
        id,
        record,
        reason: 'Revisar a regra da comunidade.',
      });
      await assert.rejects(
        participant.operate('reports', { id, after: null, own: false }),
        bad(403),
      );
      const incoming = (await mod.operate('reports', {
        id,
        after: null,
        own: false,
      })) as { items: Record<string, unknown>[] };
      assert.equal(incoming.items[0]?.id, record);
      assert.equal(
        JSON.stringify(incoming).includes(participantProfile.id),
        false,
      );
      assert.deepEqual(
        Object.keys(incoming.items[0]).sort(),
        ['id', 'reason', 'resolved', 'decision'].sort(),
      );
      await change(mod, 'resolve-report', {
        record,
        decision: 'Regra revisada.',
      });
      const own = (await participant.operate('reports', {
        id,
        after: null,
        own: true,
      })) as { items: { decision: string }[] };
      assert.equal(own.items[0]?.decision, 'Regra revisada.');
      const outsiders = (await owner.operate('reports', {
        id,
        after: null,
        own: true,
      })) as { items: unknown[] };
      assert.equal(outsiders.items.length, 0);
    },
  );
  await t.test(
    'transferência exige aceite do ID correto; anterior perde a gestão; arquivo preserva leitura e registros',
    async () => {
      await change(owner, 'transfer-offer', { target: participantProfile.id });
      const offered = await state(participant);
      assert.equal(offered.transfer?.target.id, participantProfile.id);
      assert.equal((await state(mod)).transfer, null);
      assert.equal((await state()).role, 'owner');
      await assert.rejects(
        mod.operate('transfer-accept', {
          id,
          revision: offered.community.revision,
          offer: offered.transfer.id,
        }),
        bad(403),
      );
      await change(owner, 'transfer-offer', { target: null });
      await assert.rejects(
        participant.operate('transfer-accept', {
          id,
          revision: (await state()).community.revision,
          offer: offered.transfer.id,
        }),
        bad(403),
      );
      await change(owner, 'transfer-offer', { target: participantProfile.id });
      const pending = await state(participant);
      await participant.operate('transfer-accept', {
        id,
        revision: pending.community.revision,
        offer: pending.transfer!.id,
      });
      assert.equal((await state()).role, 'participant');
      assert.equal((await state(participant)).role, 'owner');
      await assert.rejects(
        change(owner, 'archive', { archived: true }),
        bad(403),
      );
      await change(participant, 'archive', { archived: true });
      assert.equal((await communities.read(id)).archived, true);
      assert.equal((await state(mod)).canPost, false);
      await assert.rejects(
        db.communities.withParticipation(
          { session: mod.login.session, directory: mod.directory },
          id,
          () => Promise.resolve(true),
        ),
        bad(403),
      );
      await assert.rejects(
        change(mod, 'follow', { following: true }),
        bad(403),
      );
      const reports = (await mod.operate('reports', {
        id,
        after: null,
        own: false,
      })) as { items: unknown[] };
      assert.equal(reports.items.length, 1);
      await change(participant, 'archive', { archived: false });
      assert.equal((await state()).canPost, true);
    },
  );
  await t.test(
    'HTTP de escrita exige origem/CSRF e assinatura; revogação impede gestão por aparelho anterior',
    async () => {
      const payload = { id, following: true },
        proof = await owner.proof('follow', payload);
      const url = `${origin}/api/account/communities/follow`;
      for (const headers of [
        { Origin: origin, 'Content-Type': 'application/json' },
        {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: `hash-talk-session=${owner.login.sessionToken}`,
        },
        {
          Origin: 'https://invalid.example',
          'Content-Type': 'application/json',
          Cookie: `hash-talk-session=${owner.login.sessionToken}`,
          'X-Hash-Talk-CSRF': owner.login.session.csrf,
        },
      ]) {
        const result = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(proof),
        });
        assert.ok(result.status === 401 || result.status === 403);
      }
      await assert.rejects(
        communities.operate('archive', owner.login.session, proof),
      );
      await assert.rejects(
        communities.operate('follow', owner.login.session, {
          ...proof,
          payload: { id, following: false },
        }),
      );
      const challenge = await account.challenge({
        address: owner.wallet.address,
        chainId: 1,
        deviceId: crypto.randomUUID(),
      });
      const recoveredLogin = await account.login(
        {
          id: challenge.id,
          signature: await owner.wallet.signMessage(challenge.message),
        },
        challenge.browserToken,
      );
      const newIdentity = await createIdentity(
        recoveredLogin.session.deviceId,
        'Recuperado',
      );
      const recovered = await prepareEvent({
        accountId: recoveredLogin.session.accountId,
        previous: owner.event,
        kind: 'recover',
        signer: 'recovery',
        signing: owner.recovery.signing,
        root: owner.recovery.root,
        identities: [newIdentity.public],
        ring: freshKeyring(recoveredLogin.session.accountId, owner.ring),
        profile: null,
      });
      await devices.commit(recoveredLogin.session, {
        event: recovered,
        profile: null,
      });
      await assert.rejects(owner.operate('state', { id }), bad(403));
    },
  );
  await t.test(
    'listas são paginadas e capacidade global recusa novas gravações atomicamente, sem cota pessoal',
    async () => {
      for (let i = 0; i < 25; i++) {
        const next = crypto.randomUUID();
        ids.push(next);
        await participant.operate('create', {
          id: next,
          meta: { ...meta, name: `Lista ${i}` },
        });
      }
      const page = communityPage(
        await participant.operate('list', { kind: 'managed', after: null }),
      );
      assert.equal(page.items.length, 24);
      assert.ok(page.next);
      const second = communityPage(
        await participant.operate('list', {
          kind: 'managed',
          after: page.next,
        }),
      );
      assert.equal(
        second.items.some((item) =>
          page.items.some((first) => first.id === item.id),
        ),
        false,
      );
      const usage = await inspector.query<{ bytes: string }>(
        'SELECT used_bytes::text AS bytes FROM hash_talk.content_usage WHERE singleton',
      );
      const limited = new Database(
        config.databaseUrl,
        Number(usage.rows[0]!.bytes),
      );
      try {
        const service = new CommunityService(
          limited.communities,
          limited.devices,
        );
        const next = crypto.randomUUID();
        ids.push(next);
        await assert.rejects(
          service.operate(
            'create',
            participant.login.session,
            await participant.proof('create', { id: next, meta }),
          ),
          bad(503),
        );
        assert.equal(
          (
            await inspector.query(
              'SELECT 1 FROM hash_talk.communities WHERE id=$1',
              [next],
            )
          ).rowCount,
          0,
        );
      } finally {
        await limited.close();
      }
    },
  );
  await t.test(
    'exclusão sintética arquiva comunidade e libera @ sem transferir propriedade/histórico',
    async () => {
      const temporary = await create(),
        handle = `d_${suffix}`,
        publicId = (await temporary.publicIdentity(handle)).id;
      const owned = crypto.randomUUID();
      ids.push(owned);
      await temporary.operate('create', { id: owned, meta });
      for (const table of [
        'device_events',
        'device_directories',
        'login_sessions',
        'login_devices',
      ])
        await inspector.query(
          `DELETE FROM hash_talk.${table} WHERE account_id=$1`,
          [temporary.login.session.accountId],
        );
      await inspector.query('DELETE FROM hash_talk.accounts WHERE id=$1', [
        temporary.login.session.accountId,
      ]);
      const archived = await communities.read(owned);
      assert.equal(archived.archived, true);
      assert.equal(archived.owner, null);
      const replacement = await create();
      assert.notEqual((await replacement.publicIdentity(handle)).id, publicId);
      await assert.rejects(
        replacement.operate('archive', {
          id: owned,
          revision: archived.revision,
          archived: false,
        }),
        bad(403),
      );
    },
  );
});
