import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import {
  profileSummary,
  profileFollow,
  profileBanner,
  profileActivityFilter,
  profileDescriptionText,
} from '../src/shared/profile-social/index.ts';
import { feedPage } from '../src/shared/community-discovery/index.ts';

const profile = { id: crypto.randomUUID(), handle: 'sintetico', avatar: null };
const summary = {
  profile,
  description: 'Texto público 🙂',
  banner: null,
  createdAt: null,
  conversations: 0,
  posts: 0,
  replies: 0,
  communities: 0,
  followers: 0,
};
await test('página pública preserva idade desconhecida e rejeita dados privados ou banner de outro alvo', () => {
  assert.deepEqual(profileSummary(summary), summary);
  assert.throws(
    () => profileSummary({ ...summary, wallet: 'privada' }),
    AccountError,
  );
  assert.throws(
    () =>
      profileSummary({
        ...summary,
        profile: { ...profile, accountId: crypto.randomUUID() },
      }),
    AccountError,
  );
  assert.throws(
    () =>
      profileSummary({
        ...summary,
        banner: `/api/public-media/profile-banner/${crypto.randomUUID()}/${crypto.randomUUID()}`,
      }),
    AccountError,
  );
  assert.throws(() => profileSummary({ ...summary, posts: -1 }), AccountError);
});
await test('relações rejeitam revisões negativas e campos extras; abas não incluem listas privadas', () => {
  assert.deepEqual(profileFollow({ following: false, revision: 0 }), {
    following: false,
    revision: 0,
  });
  assert.throws(
    () => profileFollow({ following: true, revision: -1 }),
    AccountError,
  );
  assert.throws(
    () => profileFollow({ following: true, revision: 1, target: profile.id }),
    AccountError,
  );
  assert.deepEqual(profileBanner({ revision: 0, banner: null }), {
    revision: 0,
    banner: null,
  });
  assert.throws(
    () => profileActivityFilter({ profile: profile.id, tab: 'saved' }),
    AccountError,
  );
});
await test('resposta no perfil exige comunidade, raiz e pai corretos; raiz excluída não expõe a discussão', () => {
  const community = crypto.randomUUID(),
    root = crypto.randomUUID(),
    reply = crypto.randomUUID();
  const post = {
    id: root,
    community,
    author: profile,
    title: 'Original',
    text: 'Texto',
    tag: null,
    createdAt: '2026-10-10T12:00:00.000Z',
    editedAt: null,
    revision: 1,
    status: 'visible',
    parent: null,
    root: null,
    score: 0,
    replies: 0,
    views: 0,
  };
  const entry = {
    post: { ...post, id: reply, title: '', parent: root, root },
    community: { id: community, name: 'Comunidade' },
    context: { root: post, parent: post },
  };
  assert.equal(
    feedPage({ items: [entry], next: null }).items[0]?.context?.root.id,
    root,
  );
  assert.throws(
    () =>
      feedPage({
        items: [
          {
            ...entry,
            context: {
              root: {
                ...post,
                status: 'deleted',
                title: '',
                text: '',
                author: null,
              },
              parent: post,
            },
          },
        ],
        next: null,
      }),
    AccountError,
  );
  assert.throws(
    () =>
      feedPage({
        items: [
          {
            ...entry,
            context: {
              root: post,
              parent: { ...post, id: crypto.randomUUID() },
            },
          },
        ],
        next: null,
      }),
    AccountError,
  );
});
await test('descrição do perfil aceita texto e emoji, normaliza quebras e recusa controles ocultos', () => {
  for (const [input, expected] of [
    ['  Olá 👋🏽  ', 'Olá 👋🏽'],
    ['a\r\nb', 'a\nb'],
    ['a\n\n\n\nb', 'a\n\nb'],
    ['a\tb', 'a b'],
    ['família 👨‍👩‍👧', 'família 👨‍👩‍👧'],
    ['🙂'.repeat(280), '🙂'.repeat(280)],
    ['', ''],
  ] as const)
    assert.equal(profileDescriptionText(input), expected);
  for (const input of [
    '🙂'.repeat(281),
    'a\nb\nc\nd\ne\nf',
    'texto\u202Einvertido',
    'zero\u200Bwidth',
    'sino\u0007',
    42,
  ])
    assert.throws(() => profileDescriptionText(input), AccountError);
});
