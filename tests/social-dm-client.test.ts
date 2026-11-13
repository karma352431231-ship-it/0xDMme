import { deferred } from './fixtures/deferred.ts';
import { object } from '../src/shared/account/index.ts';
import type { SocialContext } from '../src/client/social-dm/index.ts';
import type { BackupRecord } from '../src/client/backup-records/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from '../src/shared/account/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import { VaultSync } from '../src/client/vault-sync/index.ts';
import { SocialDms } from '../src/client/social-dm/index.ts';

await test("DM cancels before sending if the session changes during signing and never uses another account's authority", async (t) => {
  const session: AccountSession = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    name: 'Sintético',
    address: `0x${'1'.repeat(40)}`,
    ecosystem: 'evm',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    profileRevision: 0,
    walletConfirmed: true,
  };
  let started: () => void = () => {
      throw new Error('Não iniciado.');
    },
    finish: (signature: string) => void = () => {
      throw new Error('Não iniciado.');
    };
  const signing = new Promise<void>((resolve) => {
      started = resolve;
    }),
    signed = new Promise<string>((resolve) => {
      finish = resolve;
    });
  const authority: VaultAuthority = {
    session,
    offline: false,
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    sign: () => {
      started();
      return signed;
    },
    key: () => Promise.reject(new Error('Sem chave neste teste.')),
  };
  const access: VaultAccess = {
    withVault: (_offline, work) => work(authority),
    withLocalVault: (_locator, work) => work(authority),
  };
  const controller = new SocialDms(access, new VaultSync(access)),
    fetch = t.mock.method(globalThis, 'fetch', () =>
      Promise.resolve(Response.json({ status: 'saved' })),
    );
  controller.setSession(session);
  const pending = controller.request('request', { peer: crypto.randomUUID() }),
    rejection = assert.rejects(pending, /[Ss]ession/);
  await signing;
  controller.setSession(null);
  finish('a'.repeat(88));
  await rejection;
  assert.equal(fetch.mock.callCount(), 0);
  controller.setSession({ ...session, accountId: crypto.randomUUID() });
  await assert.rejects(
    controller.request('list', { after: null }),
    /another account/,
  );
  assert.equal(fetch.mock.callCount(), 0);
});

await test('public author deletion shares its crypto turn but signs and reports every target independently', async (t) => {
  const access: VaultAccess = {
    withVault: () =>
      Promise.reject(new Error('Use the existing crypto-turn boundary')),
    withLocalVault: () => Promise.reject(new Error('Not used')),
  };
  const controller = new SocialDms(access, new VaultSync(access));
  const reply = deferred<void>();
  const requests: string[] = [],
    signatures: string[] = [];
  let turns = 0;
  const context = {
    authority: {
      session: { accountId: 'public-profile', deviceId: 'public-device' },
      directory: 'public-head',
      events: [{}],
      sign: (body: string) => {
        signatures.push(body);
        return Promise.resolve('synthetic-signature');
      },
    },
    api: async (operation: string, payload: Record<string, unknown>) => {
      assert.equal(operation, 'delete');
      const proof = object(payload['proof']),
        target = object(proof['payload']);
      assert.equal(target['recipient'], 'peer-profile');
      assert.equal(target['revision'], 1);
      assert.equal(proof['deviceId'], 'public-device');
      requests.push(String(target['id']));
      await reply.promise;
      if (target['id'] === 'second') throw new Error('Synthetic refusal');
    },
  } as unknown as SocialContext;
  const withCrypto: SocialDms['withCrypto'] = (work) => {
    turns++;
    return work(context);
  };
  t.mock.method(controller, 'withCrypto', withCrypto);
  const items = ['first', 'second'].map((id) => ({
    id,
    own: true,
    hash: 'a'.repeat(64),
  })) as Extract<BackupRecord, { type: 'dm-message' }>[];
  const removing = controller.removeMany('peer-profile', items);
  await Promise.resolve();
  assert.deepEqual(requests, ['first', 'second']);
  assert.equal(turns, 1);
  assert.equal(signatures.length, 2);
  assert.ok(signatures.every((body) => body.includes('dm-delete')));
  reply.resolve();
  assert.deepEqual(
    (await removing).map((result) => result.status),
    ['fulfilled', 'rejected'],
  );
  await assert.rejects(
    controller.removeMany('peer-profile', [{ ...items[0]!, own: false }]),
  );
  assert.equal(
    turns,
    1,
    'non-author targets are refused before acquiring authority',
  );
});
