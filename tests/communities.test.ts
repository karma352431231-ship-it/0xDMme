import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import {
  community,
  communityMeta,
  communityPage,
  communityState,
  communityText,
  communityBody,
  communityReport,
  sanction,
} from '../src/shared/communities/index.ts';
const profile = { id: crypto.randomUUID(), handle: 'sintetico', avatar: null };
const value = () => ({
  id: crypto.randomUUID(),
  name: 'Memes e discussões',
  description: 'Descrição',
  rules: 'Respeite os participantes.',
  revision: 1,
  archived: false,
  avatar: null,
  owner: profile,
  followers: 0,
});
await test('comunidades preservam texto Unicode, recusam controles invisíveis e limitam entradas', () => {
  assert.deepEqual(
    communityMeta({
      name: ' Memes 😄 ',
      description: '',
      rules: 'Linha 1\r\nLinha 2',
    }),
    { name: 'Memes 😄', description: '', rules: 'Linha 1\nLinha 2' },
  );
  for (const name of ['', 'x'.repeat(101), 'duas\nlinhas', 'a\u200bb', 'a\0b'])
    assert.throws(
      () => communityMeta({ name, description: '', rules: '' }),
      AccountError,
    );
  assert.throws(
    () =>
      communityMeta({
        name: 'Teste',
        description: '',
        rules: '',
        owner: profile,
      }),
    AccountError,
  );
  assert.throws(() => communityText('x'.repeat(2001), 2000), AccountError);
});
await test('respostas públicas e páginas recusam vínculo privado, fotos sem aprovação e listas enormes', () => {
  const data = value();
  assert.deepEqual(community(data), data);
  for (const field of ['accountId', 'wallet', 'pendingPhoto', 'transfer_to'])
    assert.throws(
      () => community({ ...data, [field]: 'segredo' }),
      AccountError,
    );
  assert.throws(
    () => community({ ...data, owner: { ...profile, address: 'wallet' } }),
    AccountError,
  );
  assert.throws(
    () => community({ ...data, avatar: '/sem-moderacao' }),
    AccountError,
  );
  assert.throws(() => community({ ...data, followers: -1 }), AccountError);
  assert.throws(
    () =>
      communityPage({ items: Array.from({ length: 25 }, value), next: null }),
    AccountError,
  );
  assert.throws(
    () => communityPage({ items: [], next: 'cursor-inválido' }),
    AccountError,
  );
});
await test('estado próprio valida funções, sanções e denúncias sem identidade do denunciante', () => {
  const data = {
    community: value(),
    role: 'participant',
    following: false,
    canPost: true,
    pendingPhoto: null,
    sanction: null,
    transfer: null,
  };
  assert.deepEqual(communityState(data), data);
  assert.throws(() => communityState({ ...data, role: 'admin' }), AccountError);
  const record = {
    id: crypto.randomUUID(),
    target: profile,
    reason: 'Regra local',
    until: null,
    lifted: false,
    appeal: null,
    decision: null,
  };
  assert.deepEqual(sanction(record), record);
  assert.throws(() => sanction({ ...record, until: 'amanhã' }), AccountError);
  const report = {
    id: crypto.randomUUID(),
    reason: 'Conteúdo inadequado',
    resolved: false,
    decision: null,
  };
  assert.deepEqual(communityReport(report), report);
  assert.throws(
    () => communityReport({ ...report, author: profile.id }),
    AccountError,
  );
});
await test('prova de comunidade não se transfere entre conta, aparelho, operação ou alvo', () => {
  const account = crypto.randomUUID(),
    device = crypto.randomUUID(),
    proof = { directory: 'a'.repeat(64), payload: { id: crypto.randomUUID() } };
  const body = communityBody(account, device, 'follow', proof);
  assert.notEqual(
    body,
    communityBody(crypto.randomUUID(), device, 'follow', proof),
  );
  assert.notEqual(
    body,
    communityBody(account, crypto.randomUUID(), 'follow', proof),
  );
  assert.notEqual(body, communityBody(account, device, 'archive', proof));
  assert.notEqual(
    body,
    communityBody(account, device, 'follow', {
      ...proof,
      payload: { id: crypto.randomUUID() },
    }),
  );
});
