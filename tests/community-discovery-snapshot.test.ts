import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DiscoverySnapshot } from '../src/client/communities/discovery-page.ts';

const community = crypto.randomUUID();
const post = {
  id: crypto.randomUUID(),
  community,
  author: null,
  title: 'Postagem fictícia',
  text: 'Conteúdo fictício',
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
const page = (changes: Partial<typeof post> = {}) => ({
  items: [
    {
      post: { ...post, ...changes },
      community: { id: community, name: 'Teste' },
    },
  ],
  next: null,
});
const query = 'order=recent&period=all';

await test('rechecagem do mesmo feed valida a resposta e conserva a página; mudanças visíveis exigem novo desenho', () => {
  const snapshot = new DiscoverySnapshot();
  assert.equal(snapshot.read('feed', query, page()).changed, true);
  assert.equal(snapshot.read('feed', query, page()).changed, false);
  for (const changes of [
    { text: 'Texto editado', revision: 2 },
    { score: 3 },
    { replies: 2 },
    { views: 1 },
  ]) {
    assert.equal(snapshot.read('feed', query, page(changes)).changed, true);
    assert.equal(snapshot.read('feed', query, page(changes)).changed, false);
  }
});

await test('exclusão, moderação e remoção de item não mantêm conteúdo antigo no feed', () => {
  for (const status of ['deleted', 'removed']) {
    const snapshot = new DiscoverySnapshot();
    snapshot.read('feed', query, page());
    const removal = page({ status, title: '', text: '', revision: 2 });
    const checked = snapshot.read('feed', query, removal);
    assert.equal(checked.changed, true);
    assert.equal(checked.page.kind, 'feed');
    assert.equal(checked.page.value.items.length, 1);
    assert.equal(
      snapshot.read('feed', query, { items: [], next: null }).changed,
      true,
    );
  }
});

await test('filtros, cursor, escopo e sessão não reutilizam a página de outra consulta', () => {
  const snapshot = new DiscoverySnapshot();
  snapshot.read('feed', query, page());
  assert.equal(
    snapshot.read('feed', 'order=votes&period=week', page()).changed,
    true,
  );
  assert.equal(snapshot.read('following', query, page()).changed, true);
  assert.equal(
    snapshot.read('following', query + '&after=synthetic', page()).changed,
    true,
  );
  snapshot.clear();
  assert.equal(
    snapshot.read('following', query + '&after=synthetic', page()).changed,
    true,
  );
});

await test('resposta adulterada ou maior que a página permitida é recusada antes do reuso; retry ainda compara a última válida', () => {
  const snapshot = new DiscoverySnapshot();
  snapshot.read('feed', query, page());
  assert.throws(() =>
    snapshot.read('feed', query, { ...page(), wallet: 'privada' }),
  );
  assert.throws(() =>
    snapshot.read('feed', query, page({ status: 'deleted' })),
  );
  assert.throws(() =>
    snapshot.read('feed', query, {
      items: Array.from({ length: 25 }, () => page().items[0]),
      next: null,
    }),
  );
  assert.equal(snapshot.read('feed', query, page()).changed, false);
});

await test('ranking valida geração/cursor e refaz página quando a geração ou a ordem muda', () => {
  const snapshot = new DiscoverySnapshot();
  const ranking = {
    items: [],
    next: null,
    generation: crypto.randomUUID(),
    cutoff: '2026-10-10T12:00:00.000Z',
    expiresAt: '2026-10-10T12:01:00.000Z',
  };
  assert.equal(
    snapshot.read('explore', 'order=trending&period=day', ranking).changed,
    true,
  );
  assert.equal(
    snapshot.read('explore', 'order=trending&period=day', ranking).changed,
    false,
  );
  assert.equal(
    snapshot.read('explore', 'order=trending&period=day', {
      ...ranking,
      generation: crypto.randomUUID(),
    }).changed,
    true,
  );
  assert.throws(() =>
    snapshot.read('explore', query, { items: [], next: null }),
  );
});
