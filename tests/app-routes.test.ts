import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appRoute,
  canonicalAppHash,
  publicPostHash,
} from '../src/shared/app-routes/index.ts';
import { pageKey, requestedSettingsSection } from '../src/client/app/pages.ts';
import {
  splitHref,
  splitTarget,
  standalonePanelHref,
  samePanelTarget,
} from '../src/client/app/panel-route.ts';

await test('English destinations and legacy links resolve the same pages without rewriting wallet or invitation fragments', () => {
  for (const [legacy, current, page] of [
    ['conversas', 'chats', 'conversas'],
    ['comunidades', 'communities', 'comunidades'],
    ['perfil', 'settings', 'perfil'],
    ['publico', 'users', 'publico'],
    ['contatos', 'contacts', 'contatos'],
    ['atividade', 'activity', 'atividade'],
    ['cofre', 'vault', 'cofre'],
    ['analise', 'review', 'analise'],
  ]) {
    assert.equal(canonicalAppHash('#' + legacy), '/' + current);
    assert.equal(pageKey('/' + current), page);
    assert.equal(pageKey('#' + legacy), page);
  }
  assert.equal(canonicalAppHash('#perfil?secao=privacy'), '/settings/privacy');
  assert.equal(requestedSettingsSection('/settings/privacy'), 'privacy');
  for (const hash of [
    '#configuracoes?ticket=private',
    '#contatos?convite=private',
    '#contacts?invite=private',
    '#grupo=private',
    '#workspace',
  ])
    assert.equal(canonicalAppHash(hash), null);
  assert.equal(appRoute('#constructor'), null);
});

await test('public profiles, community posts and split layout retain their own URL on reload', () => {
  const id = crypto.randomUUID(),
    post = crypto.randomUUID(),
    dm = crypto.randomUUID();
  const target = {
    kind: 'feed' as const,
    params: new URLSearchParams({ id, post }),
  };
  const href = splitHref({
    layout: 'all',
    target,
    dm: { id: dm, local: false },
  });
  assert.equal(pageKey(href), 'conversas');
  const restored = splitTarget(href)!;
  assert.equal(restored.layout, 'all');
  assert.equal(samePanelTarget(restored.target, target), true);
  assert.deepEqual(restored.dm, { id: dm, local: false });
  const profile = splitHref({
    layout: 'all',
    target: { kind: 'profile', handle: 'chosen_name' },
    dm: null,
  });
  assert.equal(
    standalonePanelHref(profile, false, false),
    '/users/handle/chosen_name',
  );
  assert.equal(
    standalonePanelHref(href, false, false),
    `/communities/dms?dm=${dm}`,
  );
  assert.equal(standalonePanelHref(profile, true, true), null);
  const solo = splitTarget(
    splitHref({ layout: 'solo', target, dm: { id: dm, local: false } }),
  )!;
  assert.equal(solo.layout, 'solo');
  assert.deepEqual(solo.dm, { id: dm, local: false });
  assert.equal(samePanelTarget(solo.target, target), true);
  const directory = splitHref({
    layout: 'all',
    target,
    dm: { id: null, local: false },
  });
  assert.deepEqual(splitTarget(directory)?.dm, { id: null, local: false });
  assert.equal(
    standalonePanelHref(directory, false, false),
    '/communities/dms',
  );
  assert.equal(standalonePanelHref(directory, false, true), null);
});

await test('push navigation remains restricted to public post UUIDs and accepts older workers', () => {
  const id = crypto.randomUUID(),
    post = crypto.randomUUID();
  const expected = `/communities/id/${id}/posts/${post}`;
  assert.equal(publicPostHash(expected), expected);
  assert.equal(publicPostHash(`#comunidades?id=${id}&post=${post}`), expected);
  for (const hash of [
    `${expected}&wallet=private`,
    '#settings?section=devices',
    '#users?handle=name',
    '#communities?id=bad&post=bad',
    '#communities?id=' + id + '&id=' + id,
  ])
    assert.equal(publicPostHash(hash), null);
});
