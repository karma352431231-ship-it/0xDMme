import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { Daily } from '../src/client/daily/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';

function receiptFixture(t: TestContext) {
  const session: AccountSession = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Synthetic',
    profileRevision: 0,
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: '2027-01-01T00:00:00.000Z',
  };
  const authority: VaultAuthority = {
    session,
    offline: false,
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    key: () => Promise.reject(new Error('No key in this transport test')),
    sign: () => Promise.resolve('synthetic-signature'),
  };
  const state = {
    authorityReads: 0,
    current: true,
    operations: [] as string[],
    before: () => Promise.resolve(),
    afterRead: () => {},
    failure: false,
  };
  const access: VaultAccess = {
    withVault: async (_offline, work) => {
      state.authorityReads++;
      await state.before();
      return work(authority);
    },
    withLocalVault: () =>
      Promise.reject(new Error('Offline outside this contract')),
  };
  const daily = new Daily(access, new VaultSync(access));
  daily.setSession(session);
  t.mock.method(globalThis, 'fetch', (url: string) => {
    const operation = url.split('/').at(-1)!;
    state.operations.push(operation);
    if (state.failure)
      return Promise.resolve(
        Response.json({ error: 'Denied' }, { status: 403 }),
      );
    if (operation === 'daily-read') state.afterRead();
    return Promise.resolve(
      Response.json(operation === 'daily-receipts' ? ['own'] : {}),
    );
  });
  const window = {
    peer: crypto.randomUUID(),
    incoming: ['incoming'],
    outgoing: ['own'],
    current: () => state.current,
  };
  return { daily, state, window, session };
}

await test('visible read and receipts share one current authority and preserve returned checks', async (t) => {
  const { daily, state, window } = receiptFixture(t);
  assert.deepEqual(await daily.readConversation(window), new Set(['own']));
  assert.equal(state.authorityReads, 1);
  assert.deepEqual(state.operations, ['daily-read', 'daily-receipts']);
});

await test('empty or ineligible windows send no reads; incoming-only and own-only windows skip empty requests', async (t) => {
  const { daily, state, window } = receiptFixture(t);
  state.current = false;
  assert.equal(await daily.readConversation(window), null);
  state.current = true;
  assert.deepEqual(
    await daily.readConversation({ ...window, incoming: [], outgoing: [] }),
    new Set(),
  );
  assert.equal(state.authorityReads, 0);
  await daily.readConversation({ ...window, outgoing: [] });
  await daily.readConversation({ ...window, incoming: [] });
  assert.deepEqual(state.operations, ['daily-read', 'daily-receipts']);
});

await test('navigation while waiting for authority or acknowledging read discards the old window', async (t) => {
  const { daily, state, window } = receiptFixture(t);
  state.before = () => {
    state.current = false;
    return Promise.resolve();
  };
  assert.equal(await daily.readConversation(window), null);
  assert.equal(state.operations.length, 0);
  state.before = () => Promise.resolve();
  state.current = true;
  state.afterRead = () => {
    state.current = false;
  };
  assert.equal(await daily.readConversation(window), null);
  assert.deepEqual(state.operations, ['daily-read']);
});

await test('session change and rejected read never request or project receipts', async (t) => {
  const { daily, state, window, session } = receiptFixture(t);
  state.afterRead = () =>
    daily.setSession({ ...session, csrf: 'c'.repeat(64) });
  await assert.rejects(daily.readConversation(window), /Sessão alterada/);
  assert.deepEqual(state.operations, ['daily-read']);
  state.operations.length = 0;
  state.failure = true;
  await assert.rejects(daily.readConversation(window), /Denied/);
  assert.deepEqual(state.operations, ['daily-read']);
});
