import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coordinatorFixture } from './fixtures/message-coordinator.ts';
import type { Peer } from '../src/shared/contacts/index.ts';
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
async function finishStartupMaintenance(
  t: import('node:test').TestContext,
): Promise<void> {
  for (let step = 0; step < 5; step++) {
    t.mock.timers.tick(1000);
    await turn();
  }
}
const peer = (accountId: string): Peer => ({
  accountId,
  ecosystem: 'evm',
  address: '0x' + '1'.repeat(40),
  name: 'Synthetic',
});

await test('a row clicked after publication opens before unrelated startup work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdInitialization = true;
  f.messages.ready();
  f.preferences();
  await turn();
  assert.ok(
    !f.calls.includes('heartbeat'),
    'Profile initialization must not precede the directory',
  );
  t.mock.timers.tick(150);
  await turn();
  assert.ok(f.calls.includes('contacts'));
  f.clickPeer(peer('chosen'));
  await turn();
  assert.ok(
    !f.calls.includes('select:chosen'),
    'Never change the SDK selection during initialization',
  );
  f.initialization.resolve();
  await turn();
  assert.ok(f.calls.includes('select:chosen'));
  assert.ok(f.calls.includes('open-panel'));
  assert.ok(f.calls.includes('probe'));
  assert.ok(f.calls.includes('read'));
  assert.ok(!f.calls.includes('groups'));
  assert.ok(!f.calls.includes('heartbeat'));
});

await test('rapid startup taps keep only the latest recipient', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdInitialization = true;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  f.clickPeer(peer('first'));
  f.clickPeer(peer('last'));
  f.initialization.resolve();
  await turn();
  assert.ok(!f.calls.includes('select:first'));
  assert.ok(f.calls.includes('select:last'));
});

await test('the chosen conversation permits drafting while verification runs and sending before global warmups', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdInitialization = true;
  f.state.holdHistory = true;
  f.state.probeChanged = true;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  f.clickPeer(peer('chosen'));
  f.initialization.resolve();
  await turn();
  assert.ok(f.calls.includes('open-panel'));
  assert.equal(f.input.disabled, false);
  assert.equal(
    f.send.disabled,
    true,
    'Unverified history must not permit sending',
  );
  f.input.value = 'Synthetic edited draft';
  f.history.resolve();
  await turn();
  assert.equal(f.input.value, 'Synthetic edited draft');
  assert.equal(f.send.disabled, false);
  assert.ok(!f.calls.includes('groups'));
  f.submit();
  await turn();
  assert.ok(f.calls.includes('compose:chosen'));
  assert.ok(!f.calls.includes('heartbeat'));
});

for (const outcome of ['logout', 'failure'] as const)
  await test(`a queued startup tap cannot open a conversation after ${outcome}`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = coordinatorFixture(t);
    f.state.holdInitialization = true;
    f.messages.ready();
    t.mock.timers.tick(150);
    await turn();
    f.clickPeer(peer('stale'));
    if (outcome === 'logout') {
      f.messages.setSession(null);
      f.initialization.resolve();
    } else
      f.initialization.reject(new Error('Synthetic initialization failure'));
    await turn();
    assert.ok(!f.calls.includes('select:stale'));
    assert.ok(!f.calls.includes('groups'));
  });

await test('a user opening waits for one current maintenance step, not every startup task', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdGroups = true;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  assert.ok(f.calls.includes('groups'));
  const opening = f.messages.openContact(peer('chosen'));
  await turn();
  assert.ok(!f.calls.includes('select:chosen'));
  f.groupLoad.resolve();
  await opening;
  assert.ok(f.calls.includes('select:chosen'));
  assert.ok(!f.calls.includes('heartbeat'));
});

await test('returning from page cache resumes startup maintenance and preference handling', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  f.pageHide(true);
  t.mock.timers.tick(10000);
  await turn();
  assert.ok(!f.calls.includes('groups'));
  f.pageShow();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
  const before = f.calls.length;
  f.preferences();
  await turn();
  assert.ok(f.calls.slice(before).includes('heartbeat'));
});

await test('tela prepara mensagens sem clique; ready e retorno de aba não reinicializam a sessão', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.calls.filter((op) => op === 'initialize').length, 1);
  await finishStartupMaintenance(t);
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
  await finishStartupMaintenance(t);
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
  assert.ok(!calls.includes('pins'));
});

await test('janela sem reuso confere identidades antes de carregar o histórico', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  f.state.probeChanged = true;
  const before = f.calls.length;
  await f.messages.openContact({
    accountId: 'peer',
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Sintético',
  });
  const calls = f.calls.slice(before);
  assert.ok(calls.indexOf('probe') < calls.indexOf('pins'));
  assert.ok(calls.indexOf('pins') < calls.indexOf('synchronize'));
});

await test('trocar de aba com stream atualizado conserva a visão e a página em preparação', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdPage = true;
  f.messages.ready();
  f.emit('ready');
  t.mock.timers.tick(150);
  await turn();
  await finishStartupMaintenance(t);
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
  await finishStartupMaintenance(t);
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
