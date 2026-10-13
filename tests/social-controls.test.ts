import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  withinPostEditWindow,
  postEditWindowMs,
} from '../src/shared/community-posts/index.ts';
import {
  isNewMember,
  newMemberWindowMs,
  communityBadges,
} from '../src/shared/community-badges/index.ts';
import { PrivatePhotoDraft } from '../src/client/account-profile/index.ts';
import { postPreviewText } from '../src/client/communities/post-preview.ts';
import { emptyProfile } from '../src/client/account-profile/index.ts';
import { PrivatePreferencesDraft } from '../src/client/account-profile/index.ts';
import {
  publicationTitle,
  publicationQuote,
} from '../src/client/activity/publications.ts';

await test('edição termina na primeira hora original; badge de ingresso termina em dois dias, sem data inventada', () => {
  const time = Date.now(),
    created = new Date(time);
  assert.equal(withinPostEditWindow(created, time), true);
  assert.equal(
    withinPostEditWindow(created, time + postEditWindowMs - 1),
    true,
  );
  assert.equal(withinPostEditWindow(created, time + postEditWindowMs), false);
  assert.equal(withinPostEditWindow(created, time - 1), false);
  assert.equal(isNewMember(created, time + newMemberWindowMs - 1), true);
  assert.equal(isNewMember(created, time + newMemberWindowMs), false);
  assert.equal(isNewMember(null, time), false);
});
await test('badges não admitem poderes, identidade privada ou identificadores falsos', () => {
  const owner = { kind: 'owner', id: null, label: 'Dono' };
  assert.deepEqual(communityBadges([owner]), [owner]);
  for (const badge of [
    { ...owner, id: crypto.randomUUID() },
    { ...owner, kind: 'admin' },
    { ...owner, wallet: 'privada' },
    { ...owner, kind: 'custom' },
  ])
    assert.throws(() => communityBadges([badge]));
});
await test('trocar/remover foto privada só altera o perfil compartilhável após confirmar', async () => {
  const profile = emptyProfile();
  profile.photo = {
    type: 'image/png',
    bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]),
  };
  const original = profile.photo;
  const draft = new PrivatePhotoDraft(),
    bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 2]);
  await draft.choose(new File([bytes], 'nova.png', { type: 'image/png' }));
  assert.equal(profile.photo, original);
  assert.notEqual(draft.value(profile.photo), original);
  draft.commit(profile);
  assert.deepEqual(profile.photo?.bytes, bytes);
  assert.ok(original.bytes.every((byte) => byte === 0));
  draft.remove();
  assert.ok(profile.photo);
  assert.equal(draft.value(profile.photo), null);
  draft.clear();
  assert.ok(draft.value(profile.photo));
});
await test('falha de arquivo conserva o rascunho anterior e o perfil confirmado', async () => {
  const profile = emptyProfile(),
    draft = new PrivatePhotoDraft();
  const good = new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
    'a.png',
    { type: 'image/png' },
  );
  await draft.choose(good);
  const previous = draft.value(null);
  await assert.rejects(
    draft.choose(new File(['texto'], 'b.png', { type: 'image/png' })),
  );
  assert.equal(draft.value(null), previous);
  assert.equal(profile.photo, null);
});
await test('prévias limitam caracteres e linhas e preservam texto curto e emoji inteiro', () => {
  assert.equal(postPreviewText('Curto 😄'), 'Curto 😄');
  assert.equal([...postPreviewText('😄'.repeat(601))].length, 600);
  assert.equal(postPreviewText('linha\n'.repeat(12)).split('\n').length, 8);
  const prefix = 'a'.repeat(580) + ' ';
  assert.equal(
    postPreviewText(prefix + 'https://example.com/' + 'b'.repeat(200)),
    prefix,
  );
});
await test('preferências ativas não mudam durante o rascunho e podem ser descartadas', () => {
  const profile = emptyProfile(),
    draft = new PrivatePreferencesDraft();
  draft.set(profile.preferences, 'online', true);
  assert.equal(profile.preferences.online, false);
  assert.equal(draft.value(profile.preferences).online, true);
  draft.clear();
  assert.equal(draft.value(profile.preferences).online, false);
  draft.set(profile.preferences, 'online', true);
  draft.commit(profile);
  assert.equal(profile.preferences.online, true);
});
await test('avisos distinguem posts de replies e nunca mostram texto oculto', () => {
  assert.equal(publicationTitle('teste', 'post'), '@teste posted');
  assert.equal(publicationTitle('teste', 'reply'), '@teste replied');
  assert.equal(
    publicationQuote(
      { text: 'Conteúdo oculto', media: false, status: 'removed' },
      'post',
    ),
    'Publication hidden by moderation.',
  );
});
