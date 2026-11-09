import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountError } from '../src/shared/account/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import { SocialDms } from '../src/client/social-dm/index.ts';
import { SocialTextOutbox } from '../src/client/social-dm/text-outbox.ts';
import { RemovalIndex } from '../src/client/personal-removals/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';

for (const status of [410, 503])
  await test(`public text failure ${status} reconciles signed removals only for a gone original, at most once`, async (t) => {
    const owner = await groupParticipant();
    const access: VaultAccess = {
      withVault: (_offline, work) => work(owner.authority),
      withLocalVault: (_locator, work) => work(owner.authority),
    };
    const controller = new SocialDms(access, new VaultSync(access));
    controller.setSession(owner.authority.session as AccountSession);
    let attempts = 0;
    const failure = new AccountError(status, 'Original unavailable.');
    t.mock.method(SocialTextOutbox.prototype, 'sendPending', () => {
      attempts++;
      return Promise.reject(failure);
    });
    const removals = t.mock.method(
      RemovalIndex.prototype,
      'load',
      (a: VaultAuthority, guard: () => void) => {
        assert.equal(a, owner.authority);
        guard();
        return Promise.resolve();
      },
    );
    await assert.rejects(
      controller.sendPending(),
      (error) => error === failure,
    );
    assert.equal(attempts, status === 410 ? 2 : 1);
    assert.equal(removals.mock.callCount(), status === 410 ? 1 : 0);
  });

await test('a session replacement during removal reconciliation cannot restart the old public text queue', async (t) => {
  const owner = await groupParticipant();
  const access: VaultAccess = {
    withVault: (_offline, work) => work(owner.authority),
    withLocalVault: (_locator, work) => work(owner.authority),
  };
  const controller = new SocialDms(access, new VaultSync(access));
  controller.setSession(owner.authority.session as AccountSession);
  const sending = t.mock.method(SocialTextOutbox.prototype, 'sendPending', () =>
    Promise.reject(new AccountError(410, 'Gone.')),
  );
  t.mock.method(RemovalIndex.prototype, 'load', () => {
    controller.setSession(null);
    return Promise.resolve();
  });
  await assert.rejects(controller.sendPending(), /Session changed/u);
  assert.equal(sending.mock.callCount(), 1);
});
