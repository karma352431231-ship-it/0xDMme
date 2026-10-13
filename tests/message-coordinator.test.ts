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
  assert.ok(f.calls.includes('hide'));
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
