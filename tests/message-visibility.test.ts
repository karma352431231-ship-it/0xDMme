import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageVisibility } from '../src/client/message-visibility/index.ts';

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
