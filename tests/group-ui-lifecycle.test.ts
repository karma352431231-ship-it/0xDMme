import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupUiFixture } from './fixtures/group-ui.ts';
import type { GroupView } from '../src/client/groups/reader.ts';
import { fixtureGroupPhoto } from './fixtures/group-photo.ts';
import type { CommunityNode } from './fixtures/community-dom.ts';

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

await test('group settings track owner/admin/member roles and keep local copies read-only', async () => {
  const f = groupUiFixture();
  await f.ui.open(f.group);
  const ownerButtons = f.nodes['groupMembers']!.querySelectorAll('button');
  assert.deepEqual(
    ownerButtons.map((button) => button.textContent),
    ['Remove', 'Make administrator', 'Make owner'],
  );
  assert.equal(f.nodes['groupManage']!.hidden, false);
  assert.equal(f.nodes['groupClear']!.hidden, false);
  assert.equal(f.nodes['groupDelete']!.hidden, false);
  assert.equal(f.nodes['groupLeave']!.hidden, false);
  for (const role of ['admin', 'member'] as const) {
    f.controller.selected!.state.members[0]!.role = role;
    f.controller.selected!.state.owner = f.other;
    await f.refresh();
    assert.equal(f.nodes['groupManage']!.hidden, role === 'member');
    assert.equal(f.nodes['groupAvatar']!.disabled, role === 'member');
    assert.equal(f.nodes['groupClear']!.hidden, true);
    assert.equal(f.nodes['groupDelete']!.hidden, true);
    assert.equal(f.nodes['groupLeave']!.hidden, false);
    assert.deepEqual(
      f.nodes['groupMembers']!.querySelectorAll('button').map(
        (button) => button.textContent,
      ),
      role === 'admin' ? ['Remove'] : [],
    );
  }
  f.controller.selected!.localOnly = true;
  f.controller.selected!.state.members[0]!.role = 'owner';
  f.controller.selected!.state.owner = f.account;
  await f.refresh();
  for (const key of [
    'groupManage',
    'groupClear',
    'groupDelete',
    'groupLeave',
    'groupCompose',
  ])
    assert.equal(f.nodes[key]!.hidden, true, key);
  assert.deepEqual(f.nodes['groupMembers']!.querySelectorAll('button'), []);
  f.ui.setSession(null);
});

await test('the owner hands ownership over after confirmation, without the member accepting; older offers can still be accepted', async () => {
  const f = groupUiFixture();
  await f.ui.open(f.group);
  const handover = f.nodes['groupMembers']!.querySelectorAll('button').find(
    (node) => node.textContent === 'Make owner',
  )!;
  f.state.confirm = false;
  handover.click();
  await turn();
  assert.equal(
    f.calls.some((call) => call.startsWith('transfer:')),
    false,
  );
  f.state.confirm = true;
  handover.click();
  await turn();
  assert.equal(f.calls.at(-1), `transfer:${f.other}`);
  f.controller.incoming = [
    {
      id: 'offer',
      groupId: f.group.state.groupId,
      actor: f.other,
      kind: 'transfer',
    },
  ];
  await f.refresh();
  const accept = f.nodes['groupIncoming']!.querySelectorAll('button')[0]!;
  assert.equal(accept.textContent, 'Accept ownership');
  accept.click();
  await turn();
  assert.ok(f.calls.includes('respond:transfer:true'));
  f.ui.setSession(null);
});

await test('the owner leaves by naming the new owner; closing the choice changes nothing', async () => {
  const f = groupUiFixture();
  await f.ui.open(f.group);
  const membership = () =>
    f.calls.filter((call) => call.startsWith('transfer:') || call === 'leave');
  const choice = () =>
    f.nodes['groupSettings']!.querySelectorAll(
      '.group-handover',
    )[0] as unknown as CommunityNode & { open: boolean; close(): void };
  f.nodes['groupLeave']!.click();
  await turn();
  assert.equal(choice().open, true);
  choice().close();
  await turn();
  assert.deepEqual(membership(), []);
  f.nodes['groupLeave']!.click();
  await turn();
  const successor = choice()
    .querySelectorAll('button')
    .find((button) => button.className !== 'group-close')!;
  successor.click();
  await turn();
  await turn();
  assert.deepEqual(membership(), [`transfer:${f.other}`, 'leave']);
  f.ui.setSession(null);
});

await test('vault reads and paging follow the open panel and owner-only cleanup keeps its confirmation', async () => {
  const f = groupUiFixture();
  await f.ui.open(f.group);
  assert.equal(
    f.calls.some((call) => call.startsWith('vault:')),
    false,
  );
  f.nodes['groupVault']!.open = true;
  f.nodes['groupVault']!.dispatchEvent(new Event('toggle'));
  await turn();
  assert.equal(f.calls.at(-1), 'vault:0');
  assert.match(
    f.nodes['groupUsage']!.textContent,
    /2\.00 \/ 500 MB · media: 3\.00 \/ 1500 MB/,
  );
  assert.match(f.nodes['groupCleanupItems']!.textContent, /1\.00 MB/);
  await f.click('groupCleanupMore');
  assert.equal(f.calls.at(-1), 'vault:8');
  f.state.confirm = false;
  await f.click('groupClear');
  assert.equal(f.calls.includes('clear-vault'), false);
  f.state.confirm = true;
  await f.click('groupClear');
  assert.ok(f.calls.includes('clear-vault'));
  // Reopening finishes with the existing hidden "Group opened" notice.
  assert.equal(f.nodes['groupNotice']!.textContent, '');
  const reads = f.calls.filter((call) => call.startsWith('vault:')).length;
  f.controller.selected!.localOnly = true;
  await f.refresh();
  assert.equal(
    f.calls.filter((call) => call.startsWith('vault:')).length,
    reads,
  );
  assert.equal(f.nodes['groupUsage']!.textContent, '');
  f.ui.setSession(null);
});

await test('recording and voice-preview guards preserve the current group until the preview is removed', async () => {
  const f = groupUiFixture();
  await f.ui.open(f.group);
  f.voice.active = true;
  await assert.rejects(f.ui.open('another-group'), /voice preview/);
  assert.throws(() => f.ui.deselect(), /voice preview/);
  assert.equal(f.ui.selected!.state.groupId, f.group.state.groupId);
  f.ui.leave();
  assert.ok(f.calls.includes('stop-recording'));
  const bytes = new Uint8Array([1, 2, 3]);
  f.attachments.selected = { voice: {}, bytes };
  assert.equal(f.ui.recording, true);
  assert.equal(f.ui.canActivate(), false);
  await assert.rejects(f.ui.open('another-group'), /voice preview/);
  f.ui.setSession(null);
  assert.deepEqual([...bytes], [0, 0, 0]);
  assert.equal(f.ui.recording, false);
  assert.equal(f.ui.canActivate(), true);
});

await test('receipt refresh preserves unchanged media, while leaving and session changes invalidate its work', async () => {
  const f = groupUiFixture();
  f.controller.views = [
    {
      id: crypto.randomUUID(),
      groupId: f.group.state.groupId,
      text: 'Synthetic attachment',
      kind: 'attachment',
      sender: f.other,
      hash: 'b'.repeat(64),
      own: false,
      unavailableMedia: [],
    } as unknown as GroupView,
  ];
  await f.ui.open(f.group);
  const history = f.nodes['groupHistory']!,
    row = history.children[0],
    signal = f.media[0]!;
  assert.equal(signal.aborted, false);
  f.controller.views[0]!.read = true;
  await f.ui.changed('receipts');
  assert.equal(history.children[0], row);
  assert.equal(f.media.length, 1);
  assert.equal(signal.aborted, false);
  f.ui.leave();
  assert.equal(signal.aborted, true);
  await f.refresh();
  const resumed = f.media.at(-1)!;
  assert.equal(resumed.aborted, false);
  f.ui.setSession(null);
  assert.equal(resumed.aborted, true);
  assert.equal(history.children.length, 0);
});

await test('a pending group photo never paints after the account session is cleared', async () => {
  const f = groupUiFixture();
  f.state.deferPhoto = true;
  await f.ui.open(f.group);
  assert.equal(f.state.photoLoads, 1);
  f.ui.setSession(null);
  f.photo.resolve(fixtureGroupPhoto());
  await turn();
  assert.equal(f.nodes['groupAvatar']!.querySelector('img'), null);
  assert.equal(f.nodes['groupSettingsAvatar']!.querySelector('img'), null);
  assert.equal(f.nodes['groupSettings']!.open, false);
});

await test('group composition preserves drafts on local failure and clears them only after local acceptance', async () => {
  const f = groupUiFixture();
  await f.ui.open(f.group);
  const input = f.nodes['groupText']!,
    form = f.nodes['groupCompose']!,
    bytes = new Uint8Array([1, 2, 3]);
  input.value = 'Synthetic draft';
  f.attachments.selected = { bytes };
  f.state.composeFailure = true;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await turn();
  assert.equal(f.errors.length, 1);
  assert.equal(input.value, 'Synthetic draft');
  assert.deepEqual([...bytes], [1, 2, 3]);
  assert.equal(f.calls.includes('send'), false);
  f.state.composeFailure = false;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await turn();
  assert.equal(input.value, '');
  assert.deepEqual([...bytes], [0, 0, 0]);
  assert.equal(f.attachments.selected, null);
  assert.ok(f.calls.includes('send'));
  assert.equal(f.errors.length, 1);
  f.ui.setSession(null);
});

await test('browser interruption stops recording, while ordinary suspension retains its preview and revocation clears it', async () => {
  const f = groupUiFixture();
  await f.ui.open(f.group);
  f.voice.active = true;
  const departure = new Event('beforeunload', { cancelable: true });
  f.window.dispatchEvent(departure);
  assert.equal(departure.defaultPrevented, true);
  Object.assign(f.document, { visibilityState: 'hidden' });
  f.document.dispatchEvent(new Event('visibilitychange'));
  assert.ok(f.calls.includes('stop-recording'));
  const bytes = new Uint8Array([1, 2, 3]);
  f.attachments.selected = { voice: {}, bytes };
  f.ui.suspend();
  assert.equal(f.ui.recording, true);
  assert.deepEqual([...bytes], [1, 2, 3]);
  f.ui.suspend(true);
  assert.equal(f.ui.recording, false);
  assert.deepEqual([...bytes], [0, 0, 0]);
  f.ui.setSession(null);
});

await test('queued group texts preserve immediate typing and do not read history after acceptance', async () => {
  const f = groupUiFixture();
  await f.ui.open(f.group);
  const input = f.nodes['groupText']!,
    form = f.nodes['groupCompose']!;
  const reads = f.state.historyReads;
  f.state.holdTextSend = true;
  for (const text of ['First queued text', 'Second queued text']) {
    input.value = text;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    assert.equal(input.value, '');
  }
  await turn();
  assert.deepEqual(
    f.state.savedTexts.map((draft) => draft.text),
    ['First queued text', 'Second queued text'],
  );
  assert.equal(new Set(f.state.savedTexts.map((draft) => draft.id)).size, 2);
  assert.equal(f.state.historyReads, reads);
  assert.match(f.nodes['groupHistory']!.textContent, /First queued text/);
  input.value = 'Continue typing';
  f.state.textSend.resolve();
  await turn();
  assert.equal(f.state.historyReads, reads);
  assert.equal(input.value, 'Continue typing');
  assert.deepEqual(f.errors, []);
  f.ui.setSession(null);
});

await test('a queued group save failure reports through the existing notice and retries with the same ID', async () => {
  const f = groupUiFixture();
  await f.ui.open(f.group);
  f.state.textSaveFailure = true;
  f.nodes['groupText']!.value = 'Retry the same draft';
  f.nodes['groupCompose']!.dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await turn();
  assert.notEqual(f.nodes['groupNotice']!.textContent, '');
  const retry = f.nodes['groupHistory']!.querySelector('.message-send-failed')!;
  assert.ok(retry);
  f.state.textSaveFailure = false;
  retry.click();
  await turn();
  assert.equal(f.state.textAttempts.length, 2);
  assert.equal(new Set(f.state.textAttempts).size, 1);
  assert.equal(f.state.savedTexts.length, 1);
  f.ui.setSession(null);
});

await test('co-member contact actions keep invitation-only wallets private', async () => {
  const f = groupUiFixture(),
    alerts: string[] = [];
  Object.assign(f.window, { alert: (text: string) => alerts.push(text) });
  f.state.aliases.delete(f.other);
  await f.ui.open(f.group);
  await turn();
  const add = f.nodes['groupMembers']!.querySelectorAll('button').find(
    (button) => button.textContent === 'Add to contacts',
  )!;
  assert.ok(add);
  add.click();
  await turn();
  assert.match(alerts[0]!, /invitation only/);
  assert.deepEqual(f.errors, []);
  f.ui.setSession(null);
});
