import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageVisibility } from '../src/client/message-visibility/index.ts';
import type { HistoryUpdate } from '../src/client/message-visibility/index.ts';

await test('paginação e falha de sincronização nunca publicam um histórico intermediário', () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const token = visibility.begin();
  visibility.stage(token, ['mantida']);
  assert.deepEqual(frames, [null]);
  visibility.fail(token);
  assert.deepEqual(frames, [null, null]);
  assert.throws(() => visibility.complete(token));
  const retry = visibility.begin();
  visibility.stage(retry, ['mantida após aplicar exclusões']);
  visibility.complete(retry);
  assert.deepEqual(frames.at(-1), ['mantida após aplicar exclusões']);
  assert.throws(() => visibility.complete(retry));
});
await test('resposta antiga e falha antiga não reabrem nem interrompem a nova conta/aparelho', () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const old = visibility.begin();
  visibility.stage(old, ['mensagem antiga']);
  const current = visibility.begin();
  assert.throws(() => visibility.stage(old, ['atrasada']));
  assert.throws(() => visibility.complete(old));
  visibility.fail(old);
  visibility.stage(current, ['conta atual']);
  visibility.complete(current);
  assert.deepEqual(frames, [null, null, ['conta atual']]);
  visibility.close();
  assert.equal(frames.at(-1), null);
});
await test('sondagem de entrega oculta antes da rede e somente libera a visão completa validada; falha descarta os nós retidos', () => {
  const frames: { rows: readonly string[] | null; update: HistoryUpdate }[] =
    [];
  const visibility = new MessageVisibility<string>((rows, update) =>
    frames.push({ rows, update }),
  );
  const token = visibility.begin('delivery');
  assert.deepEqual(frames, [{ rows: null, update: 'delivery' }]);
  visibility.stage(token, ['mensagem conferida']);
  assert.equal(frames.length, 1);
  visibility.complete(token);
  assert.deepEqual(frames.at(-1), {
    rows: ['mensagem conferida'],
    update: 'delivery',
  });
  const failed = visibility.begin('delivery');
  visibility.stage(failed, ['não conferida']);
  visibility.fail(failed);
  assert.deepEqual(frames.at(-1), { rows: null, update: 'history' });
  assert.throws(() => visibility.complete(failed));
});
await test('revogação ou saída da conversa invalida a sondagem de entrega em andamento', () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const token = visibility.begin('delivery');
  visibility.close();
  assert.throws(() => visibility.stage(token, ['resposta atrasada']));
  assert.throws(() => visibility.complete(token));
  assert.ok(frames.every((rows) => rows === null));
});
