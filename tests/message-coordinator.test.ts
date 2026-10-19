import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coordinatorFixture } from './fixtures/message-coordinator.ts';
import { decodeDailyText } from '../src/shared/daily/index.ts';
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

await test('consecutive Enter submissions remain enabled while a previous transmission is held', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('captured'));
  f.state.holdSend = true;
  for (const text of ['AAAAA', 'AAAAABBB', 'DADASEQWE']) {
    f.input.value = text;
    f.submit();
    await turn();
    assert.equal(
      f.send.disabled,
      false,
      'A saved text must not block the next Enter behind network IO.',
    );
    assert.equal(f.input.value, '');
  }
  assert.deepEqual(
    f.drafts.map((item) => decodeDailyText(item.text).text),
    ['AAAAA', 'AAAAABBB', 'DADASEQWE'],
  );
  assert.ok(!f.calls.includes('heartbeat'));
  f.state.holdSend = false;
  f.sending.resolve();
  await turn();
});

await test('typing after Enter is never cleared by the preceding delayed local save', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('captured'));
  f.state.holdSave = true;
  f.input.value = 'First';
  f.submit();
  f.input.value = 'Next draft';
  f.saving.resolve();
  await turn();
  assert.equal(f.input.value, 'Next draft');
});

await test('an automatic history recheck admits text while holding the network, but removal still disables sending immediately', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('captured'));
  f.state.holdHistory = true;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.equal(f.calls.filter((call) => call === 'synchronize').length, 2);
  assert.equal(f.send.disabled, false);
  f.input.value = 'During automatic recheck';
  f.submit();
  await turn();
  assert.equal(
    decodeDailyText(f.drafts[0]!.text).text,
    'During automatic recheck',
  );
  assert.equal(f.input.value, '');
  f.emit('removed');
  assert.equal(
    f.send.disabled,
    true,
    'Immediate invalidation must retain its send gate.',
  );
  f.history.resolve();
  await turn();
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

for (const outcome of ['logout', 'failure', 'navigation'] as const)
  await test(`a queued startup tap cannot open a conversation after ${outcome}`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = coordinatorFixture(t);
    f.state.holdInitialization = true;
    f.messages.ready();
    t.mock.timers.tick(150);
    await turn();
    f.clickPeer(peer('stale'));
    if (outcome !== 'failure') {
      if (outcome === 'logout') f.messages.setSession(null);
      else f.messages.leave();
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

await test('leaving cancels an opening already waiting for the current maintenance step', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.holdGroups = true;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  t.mock.timers.tick(1000);
  await turn();
  f.clickPeer(peer('cancelled'));
  f.messages.leave();
  f.groupLoad.resolve();
  await turn();
  assert.ok(!f.calls.includes('select:cancelled'));
  assert.ok(!f.calls.includes('open-panel'));
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

await test('verified history and startup resume do not await an automatic profile publication', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.withProfile = true;
  f.state.holdProfile = true;
  f.state.probeChanged = true;
  t.after(() => f.profile.resolve());
  let opened = false;
  const opening = f.messages.openContact(peer('chosen')).then(() => {
    opened = true;
  });
  await turn();
  assert.ok(
    f.calls.includes('synchronize'),
    'Profile transmission must not precede verified history.',
  );
  assert.ok(f.calls.includes('read'));
  assert.equal(opened, true);
  await opening;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  assert.equal(
    f.calls.filter((call) => call === 'synchronize').length,
    2,
    'Startup resumes the verified selection before profile transmission.',
  );
  await finishStartupMaintenance(t);
  assert.deepEqual(
    f.calls.filter((call) => call.startsWith('profile:')),
    ['profile:chosen'],
    'The selected approved contact is included even outside the loaded directory page.',
  );
  assert.ok(f.calls.indexOf('read') < f.calls.indexOf('profile:chosen'));
  f.profile.resolve();
  await turn();
});

await test('automatic selected-history refresh keeps maintenance priority while explicit opening stays interactive', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('chosen'));
  assert.deepEqual(f.priorities, [
    { operation: 'probe', priority: 'interactive' },
    { operation: 'pins', priority: 'interactive' },
    { operation: 'synchronize', priority: 'interactive' },
  ]);
  f.priorities.length = 0;
  f.messages.ready();
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(
    f.priorities.filter((entry) => entry.operation !== 'pins'),
    [
      { operation: 'probe', priority: undefined },
      { operation: 'synchronize', priority: undefined },
    ],
  );
});

await test('a live change prioritizes the visible conversation recheck without promoting hidden maintenance', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('chosen'));
  f.priorities.length = 0;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(
    f.priorities.filter((entry) => entry.operation !== 'pins'),
    [
      { operation: 'probe', priority: 'interactive' },
      { operation: 'synchronize', priority: 'interactive' },
    ],
  );
  f.priorities.length = 0;
  f.state.visibilityState = 'hidden';
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.deepEqual(
    f.priorities.filter((entry) => entry.operation !== 'pins'),
    [
      { operation: 'probe', priority: undefined },
      { operation: 'synchronize', priority: undefined },
    ],
  );
});

await test('a text saved during a live recheck transmits before unrelated maintenance, which resumes afterward', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('foreground'));
  f.state.holdHistory = true;
  f.state.holdGroups = true;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  f.input.value = 'Send before unrelated updates';
  f.submit();
  await turn();
  const before = f.calls.length;
  f.state.holdHistory = false;
  f.history.resolve();
  await turn();
  assert.ok(
    f.calls.slice(before).includes('send-pending'),
    'A saved user message must not wait for another maintenance owner.',
  );
  assert.ok(!f.calls.slice(before).includes('groups'));
  assert.equal(
    f.priorities.findLast((entry) => entry.operation === 'send')?.priority,
    'interactive',
  );
  t.mock.timers.tick(1000);
  await turn();
  t.mock.timers.tick(150);
  await turn();
  assert.ok(f.calls.slice(before).includes('groups'));
  f.state.holdGroups = false;
  f.groupLoad.resolve();
  await turn();
});

await test('a newer visible live hint yields after current contacts before unrelated groups, without aborting current work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = coordinatorFixture(t);
  f.state.probeChanged = true;
  await f.messages.openContact(peer('receiving'));
  f.state.holdContacts = true;
  f.state.holdGroups = true;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  const before = f.calls.length;
  f.emit('changed');
  t.mock.timers.tick(150);
  await turn();
  assert.ok(
    !f.calls.slice(before).includes('probe'),
    'The current contact owner finishes first',
  );
  f.state.holdContacts = false;
  f.contactLoad.resolve();
  await turn();
  t.mock.timers.tick(150);
  await turn();
  assert.ok(
    f.calls.slice(before).includes('probe'),
    'A fresh visible hint must not wait for unrelated groups',
  );
  assert.equal(
    f.priorities.findLast((entry) => entry.operation === 'probe')?.priority,
    'interactive',
  );
  f.state.holdGroups = false;
  f.groupLoad.resolve();
  await turn();
});
