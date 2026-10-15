import { postPreviewText } from '../src/client/communities/post-preview.ts';
import { mentionLookup } from '../src/server/public-profile/mentions.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mentionHref,
  mentionPlainText,
  mentionSpans,
  mentionText,
  mentionToken,
  mentionQuery,
} from '../src/shared/public-mentions/index.ts';
import { MentionDraft } from '../src/client/public-mentions/draft.ts';
import { communityNameKey } from '../src/shared/community-name/index.ts';
import { profileDescriptionText } from '../src/shared/profile-social/index.ts';
import { communityMeta } from '../src/shared/communities/index.ts';
const user = { kind: 'user' as const, id: crypto.randomUUID(), label: 'ana' };
const group = {
  kind: 'community' as const,
  id: crypto.randomUUID(),
  label: 'Comunidade [Arte]',
};
await test('menções conservam UUID independente do nome, e links só apontam ao app', () => {
  const text = `Olá ${mentionToken(user)} e ${mentionToken(group)}!`;
  assert.equal(mentionPlainText(text), 'Olá @ana e @Comunidade [Arte]!');
  assert.equal(mentionSpans(text).length, 2);
  assert.equal(mentionHref(group), `#communities?id=${group.id}`);
  assert.equal(mentionHref(user), `#users?id=${user.id}`);
  for (const unsafe of [
    '@[ana](javascript:alert(1))',
    '@[ana](https://site.invalid)',
    '@[ana](u:invalid)',
    `@[${'a'.repeat(101)}](u:${user.id})`,
  ])
    assert.equal(mentionSpans(unsafe).length, 0);
});
await test('editar ao redor preserva a identidade, editar ou excluir o @ desfaz a menção', () => {
  const draft = new MentionDraft('Olá ' + mentionToken(user) + '!');
  draft.update('Oi, Olá @ana!');
  assert.match(draft.value(), new RegExp(user.id));
  draft.update('Oi, Olá @ana! Tudo bem?');
  assert.match(draft.value(), new RegExp(user.id));
  draft.update('Oi, Olá @anabela! Tudo bem?');
  assert.equal(mentionSpans(draft.value()).length, 0);
  draft.reset(mentionToken(group));
  draft.update('');
  assert.equal(draft.value(), '');
});
await test('seleção substitui só a busca e mantém outras referências após o cursor', () => {
  const draft = new MentionDraft('Olá @co e ' + mentionToken(user));
  const query = draft.query(7);
  assert.deepEqual(query, { start: 4, end: 7, text: 'co' });
  const caret = draft.select(4, 7, group);
  assert.equal(draft.text.slice(0, caret), 'Olá @Comunidade [Arte] ');
  assert.deepEqual(
    mentionSpans(draft.value()).map((span) => span.id),
    [group.id, user.id],
  );
  assert.equal(draft.query(caret), null);
});
await test('limites contam o texto visível, mantendo orçamento de referências e descrições anteriores', () => {
  const text = 'a'.repeat(275) + ' ' + mentionToken(user);
  assert.equal(mentionPlainText(text).length, 280);
  assert.equal(profileDescriptionText(text), text);
  assert.throws(() => profileDescriptionText('a' + text));
  assert.throws(() =>
    mentionText(
      Array.from({ length: 33 }, () => mentionToken(user)).join(' '),
      4000,
    ),
  );
  assert.equal(
    communityMeta({ name: 'Arte', description: mentionToken(group), rules: '' })
      .description,
    mentionToken(group),
  );
});
await test('nomes únicos e buscas normalizam caixa, espaços e formas equivalentes sem retirar acentos', () => {
  assert.equal(
    communityNameKey('  Comunidade   Ａrte '),
    communityNameKey('comunidade arte'),
  );
  assert.equal(communityNameKey('ÁRTE'), communityNameKey('árte'));
  assert.equal(communityNameKey('ΟΣ'), communityNameKey('ος'));
  assert.equal(
    communityNameKey('İstanbul'),
    communityNameKey('i\u0307stanbul'),
  );
  assert.notEqual(communityNameKey('João'), communityNameKey('Joao'));
  assert.equal(mentionQuery('  COMUNIDADE   ARTE '), 'comunidade arte');
  assert.throws(() => mentionQuery('a'));
  assert.throws(() => mentionQuery('x'.repeat(101)));
});

await test('prévia conta caracteres visíveis e nunca corta uma referência ao meio', () => {
  const text = 'x'.repeat(598) + mentionToken(user) + ' fim';
  assert.equal(postPreviewText(text), 'x'.repeat(598));
  const complete = mentionToken(user) + 'x'.repeat(700);
  assert.equal(mentionPlainText(postPreviewText(complete)).length, 600);
  assert.equal(mentionSpans(postPreviewText(complete)).length, 1);
});
await test('busca pública recusa filtros extras e dados privados; alvo por UUID valida o identificador', async () => {
  const profile = { id: user.id, handle: user.label, avatar: null };
  const ports = {
    suggestions: () => Promise.resolve([profile]),
    readById: (id: string) => {
      assert.equal(id, user.id);
      return Promise.resolve(profile);
    },
  };
  assert.deepEqual(
    await mentionLookup(
      new URL('https://0xdmme.app/api/public-profiles/_/suggestions?q=an'),
      ports,
    ),
    [profile],
  );
  assert.deepEqual(
    await mentionLookup(
      new URL('https://0xdmme.app/api/public-profiles/id/' + user.id),
      ports,
    ),
    profile,
  );
  for (const path of [
    '_/suggestions?q=a',
    '_/suggestions?q=an&q=be',
    '_/suggestions?q=an&wallet=x',
    'id/invalid',
  ])
    await assert.rejects(
      mentionLookup(
        new URL('https://0xdmme.app/api/public-profiles/' + path),
        ports,
      ),
    );
  await assert.rejects(
    mentionLookup(
      new URL('https://0xdmme.app/api/public-profiles/_/suggestions?q=an'),
      {
        suggestions: () => Promise.resolve([{ ...profile, wallet: 'private' }]),
      },
    ),
  );
});
