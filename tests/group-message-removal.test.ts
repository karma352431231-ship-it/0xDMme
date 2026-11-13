import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { GroupController } from '../src/client/groups/controller.ts';
import type { GroupSummary } from '../src/client/groups/controller.ts';
import { GroupAuthority } from '../src/client/groups/authority.ts';
import type { GroupView } from '../src/client/groups/reader.ts';
import { ApiResponseError } from '../src/client/api-response/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type { VaultAccess } from '../src/client/vault-authority/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import { deferred } from './fixtures/deferred.ts';

/**
 * Deleting an own group message keeps the open history (13/11/2026): no
 * historyPending (which hides the history), no cleared windows; only the
 * row leaves once the server accepts.
 */
function setup(t: TestContext, reply: () => Promise<void>) {
  const session = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
  } as AccountSession;
  const access: VaultAccess = {
    withVault: () => Promise.reject(new Error('not used')),
    withLocalVault: () => Promise.reject(new Error('not used')),
  };
  const controller = new GroupController(
    access,
    new VaultSync(access),
    () => true,
  );
  controller.setSession(session);
  const groupId = crypto.randomUUID();
  const selected = {
    state: { groupId, owner: session.accountId, members: [] },
    title: 'Group',
    head: 'b'.repeat(64),
  } as unknown as GroupSummary;
  controller.selected = selected;
  const view = (text: string, sequence: number): GroupView => ({
    id: crypto.randomUUID(),
    groupId,
    sequence,
    epoch: 1,
    hash: 'c'.repeat(64),
    sender: session.accountId,
    own: true,
    kind: 'text',
    text,
    unavailableMedia: [],
  });
  controller.views = [view('one', 1), view('two', 2), view('three', 3)];
  const calls: number[] = [];
  t.mock.method(GroupAuthority.prototype, 'mutate', () => {
    calls.push(1);
    return reply();
  });
  return { controller, calls };
}

await test('an own group deletion keeps the history shown and removes only its row once accepted', async (t) => {
  const answer = deferred<void>();
  const { controller, calls } = setup(t, () => answer.promise);
  const target = controller.views[1]!;
  const before = controller.views;
  const removing = controller.removeMessage(target);
  assert.equal(controller.historyPending, false, 'history hidden at start');
  assert.equal(controller.views, before, 'row left before the server agreed');
  await controller.removeMessage(target);
  assert.equal(calls.length, 1, 'a repeated tap sent a second request');
  assert.equal(controller.expectingOwnRemoval, true);
  answer.resolve();
  await removing;
  assert.equal(controller.historyPending, false);
  assert.deepEqual(
    controller.views.map((view) => view.text),
    ['one', 'three'],
  );
  assert.equal(controller.views[0], before[0], 'surviving rows were rebuilt');
});

await test('a refused group deletion keeps the message; losing access hides the group as before', async (t) => {
  const refusal = new ApiResponseError({
    operation: 'group-message-delete',
    status: 409,
    failure: 'http',
  });
  const refused = setup(t, () => Promise.reject(refusal));
  const kept = refused.controller.views[1]!;
  await assert.rejects(refused.controller.removeMessage(kept));
  assert.equal(refused.controller.views.length, 3);
  assert.equal(refused.controller.historyPending, false);
  assert.equal(refused.controller.expectingOwnRemoval, false);

  const revoked = setup(t, () =>
    Promise.reject(
      new ApiResponseError({
        operation: 'group-message-delete',
        status: 403,
        failure: 'http',
      }),
    ),
  );
  await assert.rejects(
    revoked.controller.removeMessage(revoked.controller.views[0]!),
  );
  assert.deepEqual(revoked.controller.views, []);
});

await test('a lost reply leaves the row until the next verified group read decides', async (t) => {
  const { controller } = setup(t, () =>
    Promise.reject(new TypeError('Failed to fetch')),
  );
  const target = controller.views[2]!;
  await assert.rejects(controller.removeMessage(target));
  assert.equal(controller.views.length, 3);
  assert.equal(controller.expectingOwnRemoval, true);
  assert.equal(controller.ownRemovalDone(target.id), false);
});
