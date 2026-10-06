import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import {
  communityPost,
  postContent,
  postCursor,
  postLink,
  postPage,
  postState,
} from '../src/shared/community-posts/index.ts';
const id = () => crypto.randomUUID();
const time = new Date(0).toISOString();
const post = () => ({
  id: id(),
  community: id(),
  author: { id: id(), handle: 'teste_publico', avatar: null },
  title: '',
  text: 'Texto 😄',
  tag: null,
  createdAt: time,
  editedAt: null,
  revision: 1,
  status: 'visible',
  parent: null,
  root: null,
  score: 0,
  replies: 0,
});
await test('posts validam texto, título opcional, UUID de tag e orçamento de entrada', () => {
  assert.deepEqual(
    postContent({ title: '', text: ' Olá\r\nGalera! ', tag: null }),
    { title: '', text: 'Olá\nGalera!', tag: null },
  );
  for (const patch of [
    { text: '' },
    { text: 'x'.repeat(4001) },
    { title: 'x'.repeat(201) },
    { title: 'duas\nlinhas' },
    { text: 'a\u200bb' },
    { tag: 'fora-do-contrato' },
  ])
    assert.throws(
      () => postContent({ title: '', text: 'Válido', tag: null, ...patch }),
      AccountError,
    );
  assert.throws(
    () => postContent({ title: '', text: 'Texto', tag: null, media: '/a.png' }),
    AccountError,
  );
});
await test('páginas de posts têm cursor estável e recusam campos privados ou marcadores com texto retido', () => {
  const value = post();
  assert.deepEqual(communityPost(value), value);
  for (const patch of [
    { wallet: 'privada' },
    { author: { ...value.author, accountId: id() } },
    { status: 'removed' },
    { status: 'deleted' },
  ])
    assert.throws(() => communityPost({ ...value, ...patch }), AccountError);
  assert.equal(
    communityPost({
      ...value,
      status: 'removed',
      author: null,
      text: '',
      tag: null,
    }).status,
    'removed',
  );
  assert.equal(postCursor(`${time}/${value.id}`), `${time}/${value.id}`);
  assert.throws(() => postCursor(`amanhã/${value.id}`), AccountError);
  assert.throws(
    () => postPage({ items: Array.from({ length: 25 }, post), next: null }),
    AccountError,
  );
  assert.throws(
    () =>
      postState({
        post: value,
        own: false,
        manager: false,
        canEdit: false,
        canDelete: false,
        content: { title: '', text: 'Retido', tag: null },
        removal: null,
      }),
    AccountError,
  );
});
await test('links são navegação HTTP(S) explícita; esquemas executáveis, credenciais e controles não viram links', () => {
  assert.equal(
    postLink('https://example.com/a?b=2'),
    'https://example.com/a?b=2',
  );
  for (const link of [
    'javascript:alert(1)',
    'data:text/html,a',
    'file:///etc/passwd',
    'https://user:senha@example.com',
    'https://example.com/\n',
    'https://exam\u200bple.com',
    'https://example.com/' + 'x'.repeat(2048),
  ])
    assert.equal(postLink(link), null);
});
await test('árvore, votos privados e avisos recusam referências incoerentes ou dados fora do contrato', async () => {
  const { postVote, replyNotificationPage } =
    await import('../src/shared/community-posts/index.ts');
  const value = post();
  for (const patch of [
    { parent: value.id, root: id() },
    { parent: id(), root: null },
    { score: NaN },
    { replies: -1 },
    {
      parent: id(),
      root: id(),
      tag: { id: id(), label: 'tag', active: true, revision: 1 },
    },
  ])
    assert.throws(() => communityPost({ ...value, ...patch }), AccountError);
  assert.deepEqual(postVote({ position: -1, revision: 2 }), {
    position: -1,
    revision: 2,
  });
  for (const input of [
    { position: 2, revision: 0 },
    { position: 1, revision: -1 },
    { position: 1, revision: 1, profile: id() },
  ])
    assert.throws(() => postVote(input), AccountError);
  const item = {
    reply: id(),
    post: id(),
    community: id(),
    createdAt: time,
    read: false,
  };
  assert.deepEqual(replyNotificationPage({ items: [item], next: null }).items, [
    item,
  ]);
  assert.throws(
    () =>
      replyNotificationPage({
        items: [{ ...item, wallet: 'privada' }],
        next: null,
      }),
    AccountError,
  );
});
