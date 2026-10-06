import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { AccountError } from '../../src/shared/account/index.ts';
import { communityState } from '../../src/shared/communities/index.ts';
import {
  communityPost,
  postState,
  privatePostPage,
  tagPage,
} from '../../src/shared/community-posts/index.ts';
import { Database } from '../../src/server/database/index.ts';
import { vaultUsage } from '../../src/server/database/vault-quota.ts';
import {
  AccountService,
  createAccountHandler,
} from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { PublicProfileService } from '../../src/server/public-profile/index.ts';
import {
  CommunityService,
  createCommunityHandler,
} from '../../src/server/communities/index.ts';
import { createWebServer } from '../../src/server/web-host/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { createCommunityAccount } from './community-fixture.ts';

await test('posts: publicação aberta, tags locais, privacidade, revisão, exclusão e moderação transacionais', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Banco exclusivo de testes necessário.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl }),
    origin = 'http://127.0.0.1:45122',
    account = new AccountService({ store: db.authentication, origin }),
    devices = new DeviceService(db.devices),
    profiles = new PublicProfileService(db.publicProfiles, db.devices),
    communities = new CommunityService(
      db.communities,
      db.devices,
      db.communityPosts,
    ),
    accounts: string[] = [],
    addresses: string[] = [],
    ids: string[] = [];
  const host = createWebServer({
    origin,
    assets: new Map(),
    database: db,
    objects: { healthy: () => Promise.resolve(true) },
    communities: createCommunityHandler({
      read: (id) => communities.read(id),
      list: (after) => communities.list(after),
      post: (id, post) => communities.post(id, post),
      postPage: (id, after, tag) => communities.postPage(id, after, tag),
      replies: (id, parent, after) => communities.replies(id, parent, after),
      tags: (id, after) => communities.tags(id, after),
    }),
    account: createAccountHandler({ origin, service: account, communities }),
  });
  await db.migrate();
  await inspector.connect();
  t.after(async () => {
    await host.close();
    await inspector.query(
      'DELETE FROM hash_talk.communities WHERE id=ANY($1::uuid[])',
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
    host.server.listen(45122, '127.0.0.1', resolve);
  });
  const make = () =>
      createCommunityAccount({
        account,
        devices,
        communities,
        profiles,
        accounts,
        addresses,
      }),
    owner = await make(),
    author = await make(),
    outsider = await make(),
    unpublished = await make();
  const ownerProfile = await owner.publicIdentity(
      `p4_${crypto.randomUUID().slice(0, 8)}`,
    ),
    authorProfile = await author.publicIdentity(
      `p4_${crypto.randomUUID().slice(0, 8)}`,
    );
  const outsiderProfile = await outsider.publicIdentity(
    `p4_${crypto.randomUUID().slice(0, 8)}`,
  );
  const id = crypto.randomUUID(),
    other = crypto.randomUUID();
  ids.push(id, other);
  for (const community of ids)
    await owner.operate('create', {
      id: community,
      meta: {
        name: 'Posts sintéticos',
        description: 'Somente teste.',
        rules: 'Respeite as regras.',
      },
    });
  const tags = await communities.tags(id, null),
    initial = tags.items.find((tag) => tag.label === 'Memes')!,
    post = crypto.randomUUID(),
    content = {
      title: '',
      text: 'Um post 😄 https://example.com/teste',
      tag: initial.id,
    };
  const own = async (who = author, postId = post) =>
    postState(await who.operate('post-state', { id, post: postId }));
  const bad = (status: number) => (error: unknown) =>
    error instanceof AccountError && error.status === status;
  async function govern(operation: string, data: Record<string, unknown>) {
    const current = communityState(await owner.operate('state', { id }));
    return owner.operate(operation, {
      id,
      revision: current.community.revision,
      ...data,
    });
  }
  await t.test(
    'qualquer perfil autorizado publica sem seguir; dados pessoais e formatos futuros não entram na resposta',
    async () => {
      const before = await vaultUsage(
        inspector,
        author.login.session.accountId,
      );
      await assert.rejects(
        unpublished.operate('post-create', {
          id,
          post: crypto.randomUUID(),
          content,
        }),
        bad(403),
      );
      const created = postState(
        await author.operate('post-create', { id, post, content }),
      );
      assert.equal(created.post.author?.id, authorProfile.id);
      assert.equal(created.post.title, '');
      assert.equal(created.canEdit, true);
      assert.equal(
        communityState(await author.operate('state', { id })).following,
        false,
      );
      await author.operate('post-create', { id, post, content });
      const listed = await communities.postPage(id, null, null);
      assert.equal(listed.items.length, 1);
      const response = await fetch(
          `${origin}/api/communities/${id}/posts/${post}`,
        ),
        publicValue = communityPost(await response.json());
      assert.equal(response.status, 200);
      assert.equal(publicValue.text, content.text);
      const serialized = JSON.stringify(publicValue);
      for (const secret of [
        author.login.session.accountId,
        author.login.session.deviceId,
        author.wallet.address.toLowerCase(),
        author.login.session.csrf,
      ])
        assert.equal(serialized.includes(secret), false);
      assert.equal(
        await vaultUsage(inspector, author.login.session.accountId),
        before,
      );
      await assert.rejects(
        author.operate('post-create', {
          id,
          post: crypto.randomUUID(),
          content: { ...content, media: '/original.gif' },
        }),
        bad(400),
      );
      await assert.rejects(
        outsider.operate('post-create', { id, post, content }),
        bad(409),
      );
    },
  );
  await t.test(
    'tags pertencem à comunidade, têm revisão e desativação sem apagar a classificação antiga',
    async () => {
      assert.deepEqual(tags.items.map((tag) => tag.label).sort(), [
        'Discussão',
        'Memes',
        'Opinião',
      ]);
      const newTag = crypto.randomUUID();
      await assert.rejects(
        author.operate('tag-create', { id, tag: newTag, label: 'Teste' }),
        bad(403),
      );
      await owner.operate('tag-create', { id, tag: newTag, label: 'Teste' });
      await owner.operate('tag-create', { id, tag: newTag, label: 'Teste' });
      await assert.rejects(
        owner.operate('tag-create', {
          id,
          tag: crypto.randomUUID(),
          label: 'teste',
        }),
        bad(409),
      );
      const otherTag = (await communities.tags(other, null)).items[0]!;
      await assert.rejects(
        author.operate('post-create', {
          id,
          post: crypto.randomUUID(),
          content: { ...content, tag: otherTag.id },
        }),
        bad(400),
      );
      await owner.operate('tag-edit', {
        id,
        tag: initial.id,
        revision: initial.revision,
        label: 'Memes antigos',
        active: false,
      });
      await assert.rejects(
        owner.operate('tag-edit', {
          id,
          tag: initial.id,
          revision: initial.revision,
          label: 'Conflito',
          active: true,
        }),
        bad(409),
      );
      assert.equal(
        (await communities.post(id, post)).tag?.label,
        'Memes antigos',
      );
      await assert.rejects(
        author.operate('post-create', {
          id,
          post: crypto.randomUUID(),
          content,
        }),
        bad(400),
      );
      await author.operate('post-edit', {
        id,
        post,
        revision: (await own()).post.revision,
        content: { ...content, text: 'Texto novo mantendo tag desativada.' },
      });
      assert.equal((await own()).post.tag?.active, false);
      const managed = tagPage(
        await owner.operate('tag-list', { id, after: null }),
      );
      assert.equal(managed.items.length, 4);
      for (let i = 0; i < 25; i++)
        await owner.operate('tag-create', {
          id: other,
          tag: crypto.randomUUID(),
          label: `Tag ${i}`,
        });
      const first = await communities.tags(other, null),
        second = await communities.tags(other, first.next);
      assert.equal(first.items.length, 24);
      assert.equal(second.items.length, 4);
      assert.equal(second.next, null);
      assert.equal(
        new Set([...first.items, ...second.items].map((tag) => tag.id)).size,
        28,
      );
      const managedFirst = tagPage(
          await owner.operate('tag-list', { id: other, after: null }),
        ),
        managedSecond = tagPage(
          await owner.operate('tag-list', {
            id: other,
            after: managedFirst.next,
          }),
        );
      assert.deepEqual(
        new Set(
          [...managedFirst.items, ...managedSecond.items].map((tag) => tag.id),
        ),
        new Set([...first.items, ...second.items].map((tag) => tag.id)),
      );
    },
  );
  await t.test(
    'edições concorrentes não sobrescrevem; gestores não editam o texto de outro autor',
    async () => {
      await assert.rejects(
        owner.operate('post-edit', {
          id,
          post,
          revision: (await own()).post.revision,
          content,
        }),
        bad(403),
      );
      const revision = (await own()).post.revision,
        results = await Promise.allSettled(
          ['Primeira edição', 'Segunda edição'].map((text) =>
            author.operate('post-edit', {
              id,
              post,
              revision,
              content: { ...content, text },
            }),
          ),
        );
      assert.equal(
        results.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      const failed = results.find((result) => result.status === 'rejected');
      assert.ok(failed?.status === 'rejected' && bad(409)(failed.reason));
      const state = await own();
      assert.equal(state.post.revision, revision + 1);
      assert.ok(state.post.editedAt);
    },
  );
  let removal = crypto.randomUUID();
  await t.test(
    'ocultação é reversível; texto/motivos restritos e uma contestação por remoção',
    async () => {
      await assert.rejects(
        author.operate('post-hide', {
          id,
          post,
          revision: (await own()).post.revision,
          record: removal,
          reason: 'Teste',
        }),
        bad(403),
      );
      await owner.operate('post-hide', {
        id,
        post,
        revision: (await own()).post.revision,
        record: removal,
        reason: 'Regra local.',
      });
      const publicValue = await communities.post(id, post);
      assert.equal(publicValue.status, 'removed');
      assert.equal(publicValue.text, '');
      assert.equal(publicValue.author, null);
      assert.equal(
        (await communities.postPage(id, null, null)).items.length,
        0,
      );
      const outside = await own(outsider);
      assert.equal(outside.content, null);
      assert.equal(outside.removal, null);
      await assert.rejects(
        outsider.operate('post-page', {
          id,
          scope: 'removed',
          after: null,
          tag: null,
        }),
        bad(403),
      );
      const ownPage = privatePostPage(
        await author.operate('post-page', {
          id,
          scope: 'own',
          after: null,
          tag: null,
        }),
      );
      assert.ok(ownPage.items[0]?.content?.text);
      await assert.rejects(
        author.operate('post-edit', {
          id,
          post,
          revision: (await own()).post.revision,
          content,
        }),
        bad(409),
      );
      await assert.rejects(
        outsider.operate('post-appeal', {
          id,
          post,
          record: removal,
          text: 'Intruso',
        }),
        bad(403),
      );
      await author.operate('post-appeal', {
        id,
        post,
        record: removal,
        text: 'Peço revisão.',
      });
      await author.operate('post-appeal', {
        id,
        post,
        record: removal,
        text: 'Peço revisão.',
      });
      await assert.rejects(
        author.operate('post-appeal', {
          id,
          post,
          record: removal,
          text: 'Outra contestação',
        }),
        bad(409),
      );
      await owner.operate('post-decide', {
        id,
        post,
        revision: (await own()).post.revision,
        record: removal,
        decision: 'Regra permanece.',
        restore: false,
      });
      await owner.operate('post-decide', {
        id,
        post,
        revision: (await own()).post.revision,
        record: removal,
        decision: 'Revisado, restaurado.',
        restore: true,
      });
      assert.equal((await communities.post(id, post)).status, 'visible');
      assert.equal((await own()).removal, null);
      const old = removal;
      removal = crypto.randomUUID();
      await owner.operate('post-hide', {
        id,
        post,
        revision: (await own()).post.revision,
        record: removal,
        reason: 'Outra análise.',
      });
      await owner.operate('post-hide', {
        id,
        post,
        revision: 1,
        record: old,
        reason: 'Regra local.',
      });
      assert.equal((await own()).removal?.id, removal);
      await assert.rejects(
        outsider.operate('post-moderations', { id, post, after: null }),
        bad(403),
      );
    },
  );
  await t.test(
    'acesso ao texto oculto acompanha a função atual de moderador e é revogado ao removê-la',
    async () => {
      await govern('role', { target: outsiderProfile.id, moderator: true });
      const state = await own(outsider);
      assert.equal(state.manager, true);
      assert.ok(state.content?.text);
      assert.equal(state.canEdit, false);
      const page = privatePostPage(
        await outsider.operate('post-page', {
          id,
          scope: 'removed',
          after: null,
          tag: null,
        }),
      );
      assert.equal(page.items[0]?.post.id, post);
      await govern('role', { target: outsiderProfile.id, moderator: false });
      assert.equal((await own(outsider)).content, null);
      await assert.rejects(
        outsider.operate('post-page', {
          id,
          scope: 'removed',
          after: null,
          tag: null,
        }),
        bad(403),
      );
    },
  );
  await t.test(
    'exclusão limpa o texto ativo, preserva marcador/histórico e impede restauração',
    async () => {
      await assert.rejects(
        owner.operate('post-delete', {
          id,
          post,
          revision: (await own()).post.revision,
        }),
        bad(403),
      );
      await author.operate('post-delete', {
        id,
        post,
        revision: (await own()).post.revision,
      });
      await author.operate('post-delete', { id, post, revision: 1 });
      assert.equal((await communities.post(id, post)).status, 'deleted');
      const stored = await inspector.query<{
        text: string;
        title: string;
        tag_id: string | null;
        active_removal: string | null;
      }>(
        'SELECT title,text,tag_id,active_removal FROM hash_talk.community_posts WHERE id=$1',
        [post],
      );
      assert.deepEqual(stored.rows[0], {
        title: '',
        text: '',
        tag_id: null,
        active_removal: null,
      });
      assert.equal((await own()).content, null);
      await assert.rejects(
        owner.operate('post-decide', {
          id,
          post,
          revision: (await own()).post.revision,
          record: removal,
          decision: 'Restaurar',
          restore: true,
        }),
        bad(409),
      );
      const history = (await author.operate('post-moderations', {
        id,
        post,
        after: null,
      })) as { items: unknown[] };
      assert.equal(history.items.length, 2);
    },
  );
  await t.test(
    'arquivamento e sanção bloqueiam publicar/editar, sem impedir exclusão própria',
    async () => {
      const next = crypto.randomUUID(),
        value = { title: '', text: 'Outro texto.', tag: null };
      await author.operate('post-create', { id, post: next, content: value });
      await govern('archive', { archived: true });
      await assert.rejects(
        author.operate('post-create', {
          id,
          post: crypto.randomUUID(),
          content: value,
        }),
        bad(403),
      );
      await assert.rejects(
        author.operate('post-edit', {
          id,
          post: next,
          revision: 1,
          content: value,
        }),
        bad(403),
      );
      await govern('sanction', {
        record: crypto.randomUUID(),
        target: authorProfile.id,
        reason: 'Suspensão sintética.',
        days: null,
      });
      await author.operate('post-delete', { id, post: next, revision: 1 });
      await govern('archive', { archived: false });
      await assert.rejects(
        author.operate('post-create', {
          id,
          post: crypto.randomUUID(),
          content: value,
        }),
        bad(403),
      );
    },
  );
  await t.test(
    'paginação por horário/UUID, filtro de tags e capacidade global com rollback, sem cota pessoal',
    async () => {
      const selectedTag = (await communities.tags(id, null)).items[0]!,
        created: string[] = [];
      for (let i = 0; i < 25; i++) {
        const next = crypto.randomUUID();
        created.push(next);
        await owner.operate('post-create', {
          id,
          post: next,
          content: { title: '', text: `Página ${i}`, tag: selectedTag.id },
        });
      }
      const first = await communities.postPage(id, null, selectedTag.id);
      assert.equal(first.items.length, 24);
      assert.ok(first.next);
      const second = await communities.postPage(id, first.next, selectedTag.id);
      assert.equal(second.items.length, 1);
      assert.equal(second.next, null);
      assert.deepEqual(
        new Set([...first.items, ...second.items].map((item) => item.id)),
        new Set(created),
      );
      const limited = new Database(config.databaseUrl, 0);
      t.after(() => limited.close());
      const service = new CommunityService(
          limited.communities,
          limited.devices,
          limited.communityPosts,
        ),
        next = crypto.randomUUID(),
        data = {
          id,
          post: next,
          content: { title: '', text: 'Sem capacidade.', tag: null },
        };
      await assert.rejects(
        service.operate(
          'post-create',
          owner.login.session,
          await owner.proof('post-create', data),
        ),
        bad(503),
      );
      assert.equal(
        (
          await inspector.query(
            'SELECT 1 FROM hash_talk.community_posts WHERE id=$1',
            [next],
          )
        ).rowCount,
        0,
      );
      const deletion = { id, post: created[0], revision: 1 };
      await service.operate(
        'post-delete',
        owner.login.session,
        await owner.proof('post-delete', deletion),
      );
      assert.equal((await communities.post(id, created[0])).status, 'deleted');
    },
  );
  await t.test(
    'rotas públicas recusam filtros inválidos; transporte/prova e sessão são verificados',
    async () => {
      for (const suffix of [
        'posts?after=inválido',
        'posts?tag=invalido',
        'posts?tag=&tag=',
        'tags?unknown=1',
      ])
        assert.equal(
          (await fetch(`${origin}/api/communities/${id}/${suffix}`)).status,
          400,
        );
      const data = { id, post },
        proof = await owner.proof('post-state', data),
        headers = {
          Origin: origin,
          Cookie: `hash-talk-session=${owner.login.sessionToken}`,
          'X-Hash-Talk-CSRF': owner.login.session.csrf,
          'Content-Type': 'application/json',
        };
      assert.equal(
        (
          await fetch(`${origin}/api/account/communities/post-state`, {
            method: 'POST',
            headers,
            body: JSON.stringify(proof),
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await fetch(`${origin}/api/account/communities/post-state`, {
            method: 'POST',
            headers: { ...headers, Origin: 'https://invalid.example' },
            body: JSON.stringify(proof),
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(`${origin}/api/account/communities/post-state`, {
            method: 'POST',
            headers: { ...headers, 'X-Hash-Talk-CSRF': 'inválido' },
            body: JSON.stringify(proof),
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(`${origin}/api/account/communities/post-state`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              ...proof,
              payload: { id, post: crypto.randomUUID() },
            }),
          })
        ).status,
        409,
      );
      await account.logout(owner.login.sessionToken);
      await assert.rejects(owner.operate('post-state', data), bad(401));
      assert.equal((await communities.post(id, post)).status, 'deleted');
      assert.ok(ownerProfile.id);
    },
  );
});
