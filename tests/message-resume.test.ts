import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { resumeFixture } from './fixtures/message-resume.ts';

await test('retomadas sem mudança conferem estado/entrega e confirmam sem reler índice ou conteúdo', async () => {
  const { controller, data, add } = resumeFixture();
  await add('Mensagem já carregada');
  await controller.synchronize();
  assert.equal(data.frames.at(-1)?.[0]?.text, 'Mensagem já carregada');
  for (let resume = 0; resume < 3; resume++) {
    controller.pause();
    assert.equal(data.frames.at(-1), null);
    const before = data.requests.length;
    assert.equal(await controller.probe(), false);
    assert.deepEqual(data.requests.slice(before), [
      'snapshot',
      'delivery',
      'confirm',
    ]);
    assert.equal(data.frames.at(-1)?.[0]?.text, 'Mensagem já carregada');
  }
  assert.equal(data.requests.filter((op) => op === 'page').length, 1);
  assert.equal(data.cacheReads.length, 1);
});

await test('mensagem nova exige atualização, preserva janela antiga e reutiliza seu conteúdo verificado', async () => {
  const { controller, data, add } = resumeFixture();
  const first = await add('Primeira');
  await controller.synchronize();
  data.snapshot.revision++;
  const second = await add('Nova mensagem');
  controller.hint();
  assert.equal(await controller.probe(), true);
  assert.equal(data.frames.at(-1)?.length, 1);
  await controller.synchronize();
  assert.deepEqual(
    data.frames.at(-1)?.map((row) => row.text),
    ['Primeira', 'Nova mensagem'],
  );
  assert.equal(
    data.cacheReads.filter((name) => name === `cache:${first.id}`).length,
    1,
  );
  assert.equal(
    data.cacheReads.filter((name) => name === `cache:${second.id}`).length,
    1,
  );
  assert.equal(data.requests.filter((op) => op === 'page').length, 2);
});

await test('mudança durante a pausa não reabre a visão anterior antes da atualização completa', async () => {
  const { controller, data, add } = resumeFixture();
  await add('Antiga');
  await controller.synchronize();
  controller.pause();
  data.snapshot.revision++;
  await add('Recebida na pausa');
  assert.equal(await controller.probe(), true);
  assert.equal(data.frames.at(-1), null);
  await controller.synchronize();
  assert.equal(data.frames.at(-1)?.length, 2);
});

await test('exclusão/invalidação e troca de sessão descartam o reuso mesmo se o snapshot retornado for igual', async () => {
  for (const invalidate of ['hide', 'close', 'session'] as const) {
    const { controller, data, add, session } = resumeFixture();
    await add('Histórico confirmado');
    await controller.synchronize();
    if (invalidate === 'session')
      controller.setSession({ ...session, csrf: 'd'.repeat(64) });
    else controller[invalidate]();
    assert.equal(data.frames.at(-1), null);
    assert.equal(await controller.probe(), true);
    assert.equal(data.frames.at(-1), null);
    await controller.synchronize();
    assert.equal(data.requests.filter((op) => op === 'page').length, 2);
    assert.equal(data.cacheReads.length, 2);
  }
});

await test('falha na conferência ou confirmação fecha o histórico e impede fallback para a janela retida', async () => {
  for (const operation of ['snapshot', 'confirm']) {
    const { controller, data, add } = resumeFixture();
    await add('Histórico confirmado');
    await controller.synchronize();
    controller.pause();
    data.failure = operation;
    await assert.rejects(controller.probe(), /Sem autorização/);
    assert.equal(data.frames.at(-1), null);
    data.failure = null;
    assert.equal(await controller.probe(), true);
    assert.equal(data.frames.at(-1), null);
  }
});

await test('pausa durante a confirmação cancela a publicação e não transforma dados em andamento em histórico reutilizável', async () => {
  const { controller, data, add } = resumeFixture();
  await add('Ainda em conferência');
  let release: (() => void) | undefined;
  data.confirmation = () =>
    new Promise<Response>((resolve) => {
      release = () => resolve(Response.json({}));
    });
  const loading = controller.synchronize();
  const rejected = assert.rejects(loading, /substituída/);
  const deadline = Date.now() + 2000;
  while (!release && Date.now() < deadline) await setImmediate();
  assert.ok(release, 'A leitura não chegou à confirmação dentro do prazo.');
  controller.pause();
  release();
  await rejected;
  assert.ok(data.frames.every((rows) => rows === null));
  data.confirmation = null;
  assert.equal(await controller.probe(), true);
  assert.equal(data.frames.at(-1), null);
});
