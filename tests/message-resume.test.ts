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

await test('alternar conversas confirmadas confere snapshot e entrega sem reler índice, relações ou cache', async () => {
  const { controller, data, add, peer } = resumeFixture();
  const other = crypto.randomUUID();
  await add('Primeira conversa');
  await add('Segunda conversa', other);
  await controller.synchronize();
  controller.select(other);
  assert.equal(data.frames.at(-1), null);
  assert.equal(await controller.probe(), true);
  await controller.synchronize();
  assert.equal(data.frames.at(-1)?.[0]?.text, 'Segunda conversa');
  for (const selected of [peer, other, peer]) {
    controller.select(selected);
    assert.equal(data.frames.at(-1), null);
    const before = data.requests.length;
    assert.equal(await controller.probe(), false);
    assert.deepEqual(data.requests.slice(before), [
      'snapshot',
      'delivery',
      'confirm',
    ]);
    assert.equal(data.frames.at(-1)?.[0]?.peer, selected);
  }
  assert.equal(data.requests.filter((op) => op === 'page').length, 1);
  assert.equal(data.requests.filter((op) => op === 'relations').length, 2);
  assert.equal(data.cacheReads.length, 2);
});

await test('a sondagem fornece o snapshot para a carga seguinte sem repetir o pedido', async () => {
  const { controller, data, add } = resumeFixture();
  await add('Nova');
  assert.equal(await controller.probe(), true);
  await controller.synchronize();
  assert.equal(data.requests.filter((op) => op === 'snapshot').length, 1);
  assert.equal(data.frames.at(-1)?.[0]?.text, 'Nova');
});

await test('preparação sem conversa selecionada deixa todo o conteúdo pronto antes do primeiro clique', async () => {
  const { controller, data, add, peer } = resumeFixture();
  const other = crypto.randomUUID();
  await add('Primeira conversa');
  await add('Segunda conversa', other);
  controller.select(null);
  assert.equal(
    await controller.synchronizeAll(new AbortController().signal),
    false,
  );
  assert.equal(data.frames.at(-1), null);
  assert.equal(data.cacheReads.length, 2);
  const before = data.requests.length;
  for (const selected of [peer, other]) {
    controller.select(selected);
    assert.equal(await controller.probe(), true);
    await controller.synchronize();
    assert.equal(data.frames.at(-1)?.[0]?.peer, selected);
  }
  assert.ok(!data.requests.slice(before).includes('page'));
  assert.ok(!data.requests.includes('backup-window'));
});

await test('exclusão e falha descartam também as outras conversas guardadas', async () => {
  for (const cause of ['hide', 'confirm'] as const) {
    const { controller, data, add, peer } = resumeFixture();
    const other = crypto.randomUUID();
    await add('Primeira');
    await add('Segunda', other);
    await controller.synchronize();
    controller.select(other);
    await controller.synchronize();
    if (cause === 'hide') controller.hide();
    else {
      data.failure = 'confirm';
      await assert.rejects(controller.probe(), /Sem autorização/);
      data.failure = null;
    }
    controller.select(peer);
    assert.equal(await controller.probe(), true);
    assert.equal(data.frames.at(-1), null);
  }
});

await test('candidato de outra conversa com snapshot antigo só reaparece após atualizar e confirmar', async () => {
  const { controller, data, add, peer } = resumeFixture();
  const other = crypto.randomUUID();
  await add('Primeira');
  await add('Segunda', other);
  await controller.synchronize();
  controller.select(other);
  await controller.synchronize();
  data.snapshot.revision++;
  await add('Nova na primeira');
  controller.select(peer);
  assert.equal(await controller.probe(), true);
  assert.equal(data.frames.at(-1), null);
  await controller.synchronize();
  assert.deepEqual(
    data.frames.at(-1)?.map((row) => row.text),
    ['Primeira', 'Nova na primeira'],
  );
});

await test('snapshot mudado entre sondagem e carga recusa publicação mesmo com conteúdo preparado', async () => {
  const { controller, data, add } = resumeFixture();
  await add('Fictícia');
  assert.equal(await controller.probe(), true);
  data.snapshot.revision++;
  await assert.rejects(controller.synchronize(), /Estado alterado/);
  assert.equal(data.frames.at(-1), null);
});

await test('histórico grande continua o índice parcialmente conferido ao retomar em vez de reiniciar', async () => {
  const { controller, data, add, peer } = resumeFixture();
  for (let index = 0; index < 144; index++) await add(`Fictícia ${index}`);
  await assert.rejects(controller.synchronize(), /parcialmente conferido/);
  assert.equal(data.frames.at(-1), null);
  assert.equal(data.requests.filter((op) => op === 'page').length, 8);
  controller.pause();
  controller.select(peer);
  await controller.synchronize();
  assert.equal(data.requests.filter((op) => op === 'page').length, 9);
  assert.equal(data.frames.at(-1)?.length, 16);
  assert.equal(data.frames.at(-1)?.[0]?.text, 'Fictícia 128');
});
