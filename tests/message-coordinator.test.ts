import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coordinatorFixture } from './fixtures/message-coordinator.ts';
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

await test('tela prepara mensagens sem clique; ready e retorno de aba não reinicializam a sessão', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.calls.filter((op) => op === 'initialize').length, 1);
  t.mock.timers.tick(1000);
  await turn();
  assert.equal(f.calls.filter((op) => op === 'preload').length, 1);
  for (let index = 0; index < 3; index++) {
    f.visibility('hidden');
    f.visibility('visible');
    f.emit('ready');
    t.mock.timers.tick(150);
    await turn();
  }
  assert.equal(f.calls.filter((op) => op === 'initialize').length, 1);
});

await test('changed mantém a página em andamento; exclusão cancela e fecha imediatamente', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdPage = true;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  const signal = f.state.signals[0];
  assert.ok(signal);
  const before = f.calls.length;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(signal.aborted, false);
  assert.ok(!f.calls.slice(before).includes('abort-direct'));
  f.emit('removed');
  assert.equal(signal.aborted, true);
  assert.ok(f.calls.includes('removed'));
  f.page.resolve(false);
  await turn();
});

await test('abrir outra conversa marca sua leitura sem repetir a manutenção de todas as conversas', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  const before = f.calls.length;
  await f.messages.openContact({
    accountId: 'peer',
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Sintético',
  });
  const calls = f.calls.slice(before);
  assert.ok(calls.includes('probe'));
  assert.ok(calls.includes('read'));
  assert.ok(!calls.includes('heartbeat'));
  assert.ok(!calls.includes('states'));
});

await test('trocar de aba com stream atualizado conserva a visão e a página em preparação', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdPage = true;
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  const signal = f.state.signals[0];
  assert.ok(signal);
  const before = f.calls.length;
  f.visibility('hidden');
  f.visibility('visible');
  t.mock.timers.tick(150);
  await turn();
  const calls = f.calls.slice(before);
  assert.equal(signal.aborted, false);
  assert.ok(!calls.includes('pause'));
  assert.ok(!calls.includes('live-stop'));
  assert.ok(!calls.includes('contacts'));
  f.page.resolve(false);
  await turn();
});

await test('suspensão efetiva cancela preparação e fecha a visão; retomada reconecta e confere', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdPage = true;
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  const signal = f.state.signals[0];
  assert.ok(signal);
  const before = f.calls.length;
  f.freeze();
  assert.equal(signal.aborted, true);
  assert.ok(f.calls.slice(before).includes('pause'));
  f.page.resolve(false);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  const frozen = f.calls.length;
  f.resume();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  assert.ok(f.calls.slice(frozen).includes('contacts'));
  assert.ok(f.calls.slice(frozen).includes('live-start'));
});

await test('retorno com stream desatualizado fecha antes de reconectar, mesmo sem evento freeze', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  f.visibility('hidden');
  f.state.liveCurrent = false;
  const before = f.calls.length;
  f.visibility('visible');
  const calls = f.calls.slice(before);
  assert.ok(calls.includes('pause'));
  assert.ok(calls.includes('live-stop'));
  assert.ok(calls.indexOf('pause') < calls.indexOf('live-start'));
});

await test('aviso recebido em hidden atualiza a conversa sem marcar leitura', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  await f.messages.openContact({
    accountId: 'peer',
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Sintético',
  });
  f.visibility('hidden');
  const before = f.calls.length;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  const calls = f.calls.slice(before);
  assert.ok(calls.includes('probe'));
  assert.ok(!calls.includes('read'));
});

await test('queda de conexão e exclusão em hidden fecham a conversa imediatamente', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  f.visibility('hidden');
  const before = f.calls.length;
  f.lose();
  assert.ok(f.calls.slice(before).includes('pause'));
  f.emit('removed');
  assert.ok(f.calls.slice(before).includes('removed'));
  assert.ok(f.calls.slice(before).includes('suspend-groups'));
});

await test('a healthy idle group does not schedule a sync just because it is visible', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  f.state.groupVisible = true;
  const before = f.calls.length;
  for (let index = 0; index < 3; index++) await f.tick();
  assert.ok(!f.calls.slice(before).includes('group-retry'));
  f.state.groupPending = true;
  await f.tick();
  assert.ok(f.calls.slice(before).includes('group-retry'));
});
