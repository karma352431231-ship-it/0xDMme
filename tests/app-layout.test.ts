import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  communityTarget,
  layoutPreferenceKey,
  panelControlAttributes,
  shellStateAttributes,
  storedLayout,
  toggledChat,
  withChat,
} from '../src/client/app/layout.ts';

await test('arranjo salvo no aparelho volta para o painel completo quando inválido ou ilegível', () => {
  const cases: [string | null | Error, string][] = [
    [null, 'all'],
    ['solo', 'solo'],
    ['nochat', 'nochat'],
    ['grid', 'all'],
    [new Error('bloqueado'), 'all'],
  ];
  for (const [value, layout] of cases)
    assert.equal(
      storedLayout({
        getItem: (key) => {
          assert.equal(key, layoutPreferenceKey);
          if (value instanceof Error) throw value;
          return value;
        },
        setItem: () => {},
      }),
      layout,
    );
});

await test('abrir conversa traz a coluna de volta sem reabrir o feed recolhido', () => {
  assert.equal(withChat('nochat'), 'all');
  assert.equal(withChat('solo'), 'solo');
  assert.equal(withChat('all'), 'all');
  assert.equal(toggledChat('all'), 'nochat');
  assert.equal(toggledChat('nochat'), 'all');
  assert.equal(toggledChat('solo'), 'nochat');
});

await test('links de comunidade viram feed ou DM pública sem misturar identidades', () => {
  assert.deepEqual(
    communityTarget('#comunidades?view=dms&dm=abc&history=local'),
    { kind: 'dm', id: 'abc', local: true },
  );
  assert.deepEqual(communityTarget('#comunidades?view=dms'), {
    kind: 'dm',
    id: null,
    local: false,
  });
  const feed = communityTarget('#comunidades?id=x&post=y');
  assert.equal(feed?.kind, 'feed');
  assert.equal(feed?.kind === 'feed' && feed.params.get('post'), 'y');
  assert.equal(communityTarget('#conversas'), null);
  assert.equal(communityTarget('#publico?handle=lia'), null);
});

await test('estado gravado no app nunca é confundido com um botão de layout', () => {
  // Regressão: o app recebia data-contact-scope, e todo clique virava troca de escopo.
  for (const attribute of shellStateAttributes)
    assert.equal(
      (panelControlAttributes as readonly string[]).includes(attribute),
      false,
      attribute,
    );
});
