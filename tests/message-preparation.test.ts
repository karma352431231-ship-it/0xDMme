import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HistoryPreparation } from '../src/client/messages/preparation.ts';

await test('preparação concluída fica ociosa até nova atividade, sem reiniciar na manutenção de presença', () => {
  const preparation = new HistoryPreparation();
  const direct = preparation.next()!;
  assert.equal(direct.kind, 'direct');
  preparation.complete(direct, false);
  const groups = preparation.next()!;
  assert.equal(groups.kind, 'groups');
  preparation.complete(groups, false);
  assert.equal(preparation.pending, false);
  assert.equal(preparation.next(), null);
  preparation.request();
  assert.equal(preparation.pending, true);
  assert.equal(preparation.next()?.kind, 'direct');
});

await test('páginas parciais alternam áreas; cancelamento/falha deixa a mesma página pendente', () => {
  const preparation = new HistoryPreparation();
  const direct = preparation.next()!;
  assert.deepEqual(preparation.next(), direct);
  preparation.complete(direct, true);
  const groups = preparation.next()!;
  assert.equal(groups.kind, 'groups');
  preparation.complete(groups, false);
  assert.equal(preparation.next()?.kind, 'direct');
  preparation.complete(preparation.next()!, false);
  assert.equal(preparation.pending, false);
});

await test('aviso durante uma página ou mudança de sessão não é perdido por uma conclusão antiga', () => {
  const preparation = new HistoryPreparation();
  const old = preparation.next()!;
  preparation.request();
  preparation.complete(old, false);
  assert.equal(preparation.next()?.kind, 'direct');
  preparation.complete(preparation.next()!, false);
  assert.equal(preparation.next()?.kind, 'groups');
  preparation.complete(preparation.next()!, false);
  assert.equal(preparation.pending, false);
});
