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
await test('primeira sondagem mantém o histórico fechado até validar a visão completa; falha descarta os nós retidos', () => {
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
await test('aviso durante a leitura inicial permite concluir os mesmos dados só após nova conferência', () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const token = visibility.begin();
  visibility.stage(token, ['histórico verificado']);
  const oldCheck = visibility.verificationVersion(token);
  visibility.hint();
  assert.equal(frames.at(-1), null);
  assert.equal(visibility.complete(token, oldCheck), false);
  assert.throws(() => visibility.complete(token));
  const freshCheck = visibility.verificationVersion(token);
  visibility.hint();
  assert.equal(visibility.complete(token, freshCheck), false);
  assert.equal(
    visibility.complete(token, visibility.verificationVersion(token)),
    true,
  );
  assert.deepEqual(frames.at(-1), ['histórico verificado']);
});
await test('atualizações normais conservam a última visão completa sem publicar partes ou fechar o histórico', async () => {
  for (const update of ['history', 'delivery'] as const) {
    const frames: (readonly string[] | null)[] = [];
    const visibility = new MessageVisibility<string>((rows) =>
      frames.push(rows),
    );
    const initial = visibility.begin();
    visibility.stage(initial, ['já verificada']);
    visibility.complete(initial);
    visibility.hint();
    const token = visibility.refresh(update);
    visibility.stage(token, ['nova visão completa']);
    assert.deepEqual(frames, [null, ['já verificada']]);
    let checks = 0;
    await visibility.confirm(token, () => {
      checks++;
      assert.deepEqual(frames.at(-1), ['já verificada']);
      if (checks === 1) visibility.hint();
      return Promise.resolve();
    });
    assert.equal(checks, 2);
    assert.deepEqual(frames, [
      null,
      ['já verificada'],
      ['nova visão completa'],
    ]);
  }
});
await test('snapshot diferente na sondagem conserva a visão enquanto uma carga completa é conferida', async () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const initial = visibility.begin();
  visibility.stage(initial, ['verificada']);
  visibility.complete(initial);
  const probe = visibility.refresh('delivery');
  visibility.discard(probe);
  assert.throws(() => visibility.complete(probe));
  const full = visibility.refresh();
  visibility.stage(full, ['após mudança']);
  assert.deepEqual(frames.at(-1), ['verificada']);
  await visibility.confirm(full, () => Promise.resolve());
  assert.deepEqual(frames.at(-1), ['após mudança']);
});
await test('exclusão ou invalidação fecha a visão durante trabalho e respostas antigas não a reabrem; falha também fecha', async () => {
  for (const reason of ['removed', 'authorization', 'failed'] as const) {
    const frames: (readonly string[] | null)[] = [];
    const visibility = new MessageVisibility<string>((rows) =>
      frames.push(rows),
    );
    const initial = visibility.begin();
    visibility.stage(initial, ['antiga']);
    visibility.complete(initial);
    const token = visibility.refresh();
    visibility.stage(token, ['resposta antiga']);
    if (reason === 'failed') visibility.fail(token);
    else visibility.close();
    assert.equal(frames.at(-1), null);
    await assert.rejects(visibility.confirm(token, () => Promise.resolve()));
    assert.equal(frames.at(-1), null);
    const retry = visibility.refresh();
    visibility.stage(retry, ['após aplicar exclusões']);
    assert.equal(frames.at(-1), null);
    await visibility.confirm(retry, () => Promise.resolve());
    assert.deepEqual(frames.at(-1), ['após aplicar exclusões']);
  }
});
await test('exclusão divergente ou revogação após aviso descarta a leitura retida sem reabrir conteúdo', () => {
  for (const invalidate of ['fail', 'close'] as const) {
    const frames: (readonly string[] | null)[] = [];
    const visibility = new MessageVisibility<string>((rows) =>
      frames.push(rows),
    );
    const token = visibility.begin();
    visibility.stage(token, ['conteúdo antigo']);
    visibility.hint();
    const check = visibility.verificationVersion(token);
    if (invalidate === 'fail') visibility.fail(token);
    else visibility.close();
    assert.throws(() => visibility.complete(token, check));
    assert.ok(frames.every((rows) => rows === null));
  }
});
await test('aviso durante confirm repete só a conferência, preservando a janela decifrada oculta até concluir', async () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const token = visibility.begin();
  visibility.stage(token, ['janela decifrada uma vez']);
  let checks = 0;
  await visibility.confirm(token, async () => {
    checks++;
    assert.equal(frames.at(-1), null);
    if (checks === 1) visibility.hint();
    await Promise.resolve();
  });
  assert.equal(checks, 2);
  assert.deepEqual(frames.at(-1), ['janela decifrada uma vez']);
});
await test('avisos contínuos têm limite de três confirmações e não publicam snapshot não conferido', async () => {
  const frames: (readonly string[] | null)[] = [];
  const visibility = new MessageVisibility<string>((rows) => frames.push(rows));
  const token = visibility.begin();
  visibility.stage(token, ['conteúdo retido']);
  let checks = 0;
  await assert.rejects(
    visibility.confirm(token, () => {
      checks++;
      visibility.hint();
      return Promise.resolve();
    }),
    /Novas atualizações/,
  );
  assert.equal(checks, 3);
  assert.ok(frames.every((rows) => rows === null));
});
await test('confirm recusado por exclusão e revogação durante confirm permanecem fechados', async () => {
  for (const reason of ['deleted', 'revoked'] as const) {
    const frames: (readonly string[] | null)[] = [];
    const visibility = new MessageVisibility<string>((rows) =>
      frames.push(rows),
    );
    const token = visibility.begin();
    visibility.stage(token, ['não deve abrir']);
    await assert.rejects(
      visibility.confirm(token, () => {
        if (reason === 'deleted')
          return Promise.reject(new Error('snapshot mudou'));
        visibility.close();
        return Promise.resolve();
      }),
    );
    assert.ok(frames.every((rows) => rows === null));
  }
});
