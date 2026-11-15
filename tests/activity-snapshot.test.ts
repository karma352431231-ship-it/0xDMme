import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { publicActivityReader } from '../src/client/activity/index.ts';
import { SigningLane } from '../src/client/devices/signing-lane.ts';
import type { VaultAccess } from '../src/client/vault-authority/index.ts';
import { readPublicActivity } from '../src/server/activity-snapshot/index.ts';
import { CommunityService } from '../src/server/communities/index.ts';
import { PublicProfileService } from '../src/server/public-profile/index.ts';
import type {
  CommunityPostStore,
  CommunityStore,
  DeviceStore,
  ProfileSocialStore,
  PublicProfileStore,
} from '../src/server/database/index.ts';
import { AccountError, object } from '../src/shared/account/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import { activitySnapshotPath } from '../src/shared/activity-snapshot/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';

async function fixture() {
  const device = await groupParticipant({ deviceName: 'Test device' });
  const session = device.authority.session as AccountSession;
  const calls: string[] = [];
  let positionReads = 0;
  let currentHead = device.head;
  const lane = new SigningLane({
    verified: () => ({ ...device.authority, events: 1, current: () => true }),
    position: () => {
      positionReads++;
      return Promise.resolve({ head: device.head, events: 0, revision: 1 });
    },
    exclusive: () => assert.fail('Expected a verified signing lane'),
  });
  const access: VaultAccess = {
    withSigner: (work) => lane.run(work),
    withVault: () => assert.fail('Public reads do not open the vault'),
    withLocalVault: () => assert.fail('Public reads do not use local storage'),
  };
  const devices = {
    current: (accountId: string) => {
      assert.equal(accountId, session.accountId);
      return Promise.resolve({
        head: currentHead,
        event: device.directory,
        revision: 1,
      });
    },
  } as DeviceStore;
  const store = {
    operate: (operation: string) => {
      calls.push(operation);
      return Promise.resolve({ items: [], next: null });
    },
  };
  const profile = {
    moderationNotices: () => {
      calls.push('moderation-notices');
      return Promise.resolve([]);
    },
    mentionOperation: () => {
      calls.push('mention-notifications');
      return Promise.reject(new AccountError(403, 'Public profile required.'));
    },
  } as unknown as PublicProfileStore;
  const communities = new CommunityService(
    store as unknown as CommunityStore,
    devices,
    store as unknown as CommunityPostStore,
  );
  const profiles = new PublicProfileService(
    profile,
    devices,
    store as unknown as ProfileSocialStore,
  );
  function fetchWith(
    t: TestContext,
    change: (input: unknown) => unknown = (input) => input,
  ) {
    return t.mock.method(
      globalThis,
      'fetch',
      async (path: string, init: RequestInit) => {
        assert.equal(path, activitySnapshotPath);
        assert.equal(init.method, 'POST');
        assert.equal(
          new Headers(init.headers).get('X-Hash-Talk-CSRF'),
          session.csrf,
        );
        assert.ok(typeof init.body === 'string');
        const input: unknown = JSON.parse(init.body);
        return Response.json(
          await readPublicActivity(
            { communities, profiles },
            () => Promise.resolve(session),
            change(input),
            () => true,
          ),
        );
      },
    );
  }
  return {
    read: publicActivityReader(access),
    fetchWith,
    calls,
    revoke: () => {
      currentHead = 'f'.repeat(64);
    },
    positionReads: () => positionReads,
  };
}

await test('one directory read and one request carry six independently authorized bell reads', async (t) => {
  const f = await fixture();
  const fetch = f.fetchWith(t);
  const read = await f.read(() => true);
  assert.ok(read);
  assert.deepEqual(read('replies'), { items: [], next: null });
  assert.deepEqual(read('moderation'), []);
  assert.throws(() => read('mentions'), /Public profile required/);
  assert.deepEqual(read('follows'), { items: [], next: null });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(f.positionReads(), 1);
  assert.deepEqual(f.calls, [
    'post-notifications',
    'list',
    'moderation-notices',
    'mention-notifications',
    'post-upvote-notifications',
    'follow-notifications',
  ]);
});

await test('a stale directory cannot reach any bell store', async (t) => {
  const f = await fixture();
  f.fetchWith(t);
  f.revoke();
  const read = await f.read(() => true);
  assert.ok(read);
  assert.throws(() => read('replies'), /Device has no current authorization/);
  assert.throws(
    () => read('moderation'),
    /Device has no current authorization/,
  );
  assert.deepEqual(f.calls, []);
});

await test('a proof cannot be used for another bell source', async (t) => {
  const f = await fixture();
  f.fetchWith(t, (input) => {
    const envelope = object(input);
    const signatures = object(envelope['signatures']);
    signatures['upvotes'] = signatures['replies'];
    return envelope;
  });
  const read = await f.read(() => true);
  assert.ok(read);
  assert.throws(() => read('upvotes'));
  assert.ok(!f.calls.includes('post-upvote-notifications'));
  assert.ok(f.calls.includes('post-notifications'));
});

await test('only the missing route enables the original source reads', async (t) => {
  const f = await fixture();
  const responses = [
    Response.json({ error: 'Request not authorized.' }, { status: 403 }),
    Response.json({ error: 'Operation not found.' }, { status: 404 }),
  ];
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    const response = responses.shift();
    assert.ok(response);
    return Promise.resolve(response);
  });
  await assert.rejects(
    f.read(() => true),
    /Request not authorized/,
  );
  assert.equal(await f.read(() => true), null);
  assert.equal(await f.read(() => true), null);
  assert.equal(fetch.mock.callCount(), 2);
});
