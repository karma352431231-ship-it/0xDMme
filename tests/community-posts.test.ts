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
  tags: [],
  createdAt: time,
  editedAt: null,
  revision: 1,
  status: 'visible',
  parent: null,
  root: null,
  score: 0,
  replies: 0,
});
await test('posts validam texto, tags em lista sem repetição, até cinco, e orçamento de entrada', () => {
  assert.deepEqual(
    postContent({ title: '', text: ' Olá\r\nGalera! ', tags: [] }),
    { title: '', text: 'Olá\nGalera!', tags: [] },
  );
  const tags = Array.from({ length: 5 }, id);
  assert.deepEqual(
    postContent({ title: 'Só título', text: '', tags }).tags,
    tags,
  );
  for (const patch of [
    { text: '' },
    { text: 'x'.repeat(4001) },
    { title: 'x'.repeat(201) },
    { title: 'duas\nlinhas' },
    { text: 'a\u200bb' },
    { tags: ['fora-do-contrato'] },
    { tags: [tags[0], tags[0]] },
    { tags: [...tags, id()] },
    { tags: null },
  ])
    assert.throws(
      () => postContent({ title: '', text: 'Válido', tags: [], ...patch }),
      AccountError,
    );
  assert.throws(
    () => postContent({ title: '', text: 'Text', tags: [], media: '/a.png' }),
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
      tags: [],
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
        content: { title: '', text: 'Retido', tags: [] },
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
  const { postVote, replyNotificationPage, replyPreview } =
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
      tags: [{ id: id(), label: 'tag', active: true, revision: 1 }],
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
    preview: {
      author: 'ana',
      text: 'Concordo!',
      media: false,
      status: 'visible',
    },
  };
  assert.deepEqual(replyNotificationPage({ items: [item], next: null }).items, [
    item,
  ]);
  // A hidden reply may not carry its author or text in the preview.
  for (const preview of [
    { author: 'ana', text: '', media: false, status: 'removed' },
    { author: null, text: 'segredo', media: false, status: 'deleted' },
    { author: null, text: 'x'.repeat(281), media: false, status: 'visible' },
  ])
    assert.throws(
      () =>
        replyNotificationPage({ items: [{ ...item, preview }], next: null }),
      AccountError,
    );
  assert.deepEqual(replyPreview({ ...value, status: 'removed' }), {
    author: null,
    text: '',
    media: false,
    status: 'removed',
  });
  assert.equal(replyPreview(undefined), null);
  assert.throws(
    () =>
      replyNotificationPage({
        items: [{ ...item, wallet: 'privada' }],
        next: null,
      }),
    AccountError,
  );
});
