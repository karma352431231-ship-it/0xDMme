import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Database } from '../../src/server/database/index.ts';
import type { ContactAuthority } from '../../src/server/database/contacts.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { PublicProfileService } from '../../src/server/public-profile/index.ts';
import { CommunityService } from '../../src/server/communities/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { groupEventProof } from '../../src/shared/groups/index.ts';
import type { GroupEvent } from '../../src/shared/groups/index.ts';
import { sign } from '../../src/shared/devices/index.ts';
import { createCommunityAccount } from './community-fixture.ts';
import { waitForBlocked } from './contact-concurrency-fixture.ts';

interface SnapshotRead {
  inspector: pg.Client;
  authority: ContactAuthority;
  read: (authority: ContactAuthority) => Promise<unknown>;
}

async function sharedReaders(input: SnapshotRead): Promise<unknown[]> {
  await input.inspector.query('BEGIN');
  try {
    await input.inspector.query(
      "SELECT pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'))",
    );
    await input.inspector.query(
      'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR SHARE',
      [input.authority.session.accountId],
    );
    const reads = [input.read(input.authority), input.read(input.authority)];
    try {
      return await Promise.all(reads);
    } finally {
      await Promise.allSettled(reads);
    }
  } finally {
    await input.inspector.query('ROLLBACK');
  }
}

async function queuedRevocation(input: SnapshotRead): Promise<void> {
  await input.inspector.query('BEGIN');
  let reading: Promise<unknown> | undefined;
  try {
    const holder = await input.inspector.query<{ pid: number }>(
      'SELECT pg_backend_pid() AS pid',
    );
    await input.inspector.query(
      'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
      [input.authority.session.accountId],
    );
    await input.inspector.query(
      'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
      [input.authority.session.accountId, 'f'.repeat(64)],
    );
    reading = input.read(input.authority);
    void reading.catch(() => undefined);
    await waitForBlocked(input.inspector, holder.rows[0]!.pid);
    await input.inspector.query('COMMIT');
    await assert.rejects(reading, { status: 409 });
  } finally {
    await input.inspector.query('ROLLBACK');
    await input.inspector.query(
      'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
      [input.authority.session.accountId, input.authority.directory],
    );
    await reading?.catch(() => undefined);
  }
}

await test('group and social snapshots share read admission while retaining current authority', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive synthetic database required.');
  const name =
    'hash_talk_test_scoped_reads_' + crypto.randomUUID().replaceAll('-', '');
  const administrator = new pg.Client({ connectionString: config.databaseUrl });
  await administrator.connect();
  await administrator.query(
    `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`,
  );
  const url = new URL(config.databaseUrl);
  url.pathname = '/' + name;
  const db = new Database(url.href),
    inspector = new pg.Client({ connectionString: url.href });
  t.after(async () => {
    await Promise.all([db.close(), inspector.end()]);
    await administrator.query(`DROP DATABASE "${name}"`);
    await administrator.end();
  });
  await db.migrate();
  await inspector.connect();
  const options = {
    account: new AccountService({
      store: db.authentication,
      origin: 'http://127.0.0.1:45127',
    }),
    devices: new DeviceService(db.devices),
    profiles: new PublicProfileService(db.publicProfiles, db.devices),
    communities: new CommunityService(db.communities, db.devices),
    accounts: [],
    addresses: [],
  };
  const owner = await createCommunityAccount(options),
    outsider = await createCommunityAccount(options);
  const profile = await owner.publicIdentity(
    'pdbc_' + crypto.randomUUID().replaceAll('-', '').slice(0, 12),
  );
  const authority = {
    session: owner.login.session,
    directory: owner.directory,
  };
  const event: GroupEvent = {
    version: 1,
    groupId: crypto.randomUUID(),
    revision: 1,
    epoch: 1,
    previous: null,
    kind: 'create',
    actor: authority.session.accountId,
    deviceId: authority.session.deviceId,
    directory: authority.directory,
    authorityRevision: 1,
    target: null,
    owner: authority.session.accountId,
    members: [
      { accountId: authority.session.accountId, role: 'owner', joined: 1 },
    ],
    consent: null,
    signature: '',
  };
  event.signature = await sign(owner.identity.signing, groupEventProof(event));
  await db.groups.commit(authority, { event });
  const groupRead: SnapshotRead = {
    inspector,
    authority,
    read: (a) => db.groups.current(a, event.groupId),
  };
  const socialRead: SnapshotRead = {
    inspector,
    authority,
    read: (a) => db.socialHistory.snapshot(a),
  };
  const before = (
    await inspector.query(
      'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton',
    )
  ).rows;

  await t.test(
    'current group reads coexist with shared admission and account locks',
    async () => {
      assert.deepEqual(await sharedReaders(groupRead), [event, event]);
    },
  );
  await t.test(
    'social snapshot reads coexist and retain the absent-profile null contract',
    async () => {
      const expected = {
        anchor: 0,
        removals: 0,
        directory: authority.directory,
        profile: profile.id,
      };
      assert.deepEqual(await sharedReaders(socialRead), [expected, expected]);
      const absent = {
        ...socialRead,
        authority: {
          session: outsider.login.session,
          directory: outsider.directory,
        },
      };
      assert.deepEqual(await sharedReaders(absent), [null, null]);
    },
  );
  await t.test('group reads recheck a device revoked while waiting', () =>
    queuedRevocation(groupRead),
  );
  await t.test('social snapshots recheck a device revoked while waiting', () =>
    queuedRevocation(socialRead),
  );
  await t.test(
    'reads reject a stale session and retain group membership isolation',
    async () => {
      const stale = {
        ...authority,
        session: { ...authority.session, csrf: '0'.repeat(64) },
      };
      await assert.rejects(groupRead.read(stale), { status: 401 });
      await assert.rejects(socialRead.read(stale), { status: 401 });
      await assert.rejects(
        groupRead.read({
          session: outsider.login.session,
          directory: outsider.directory,
        }),
        { status: 403 },
      );
    },
  );
  await t.test(
    'group mutations remain exclusive even for an unchanged replay',
    async () => {
      await inspector.query('BEGIN');
      try {
        await inspector.query(
          "SELECT pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'))",
        );
        await assert.rejects(db.groups.commit(authority, { event }), {
          code: '55P03',
        });
      } finally {
        await inspector.query('ROLLBACK');
      }
      assert.deepEqual(
        await db.groups.current(authority, event.groupId),
        event,
      );
    },
  );
  assert.deepEqual(
    (
      await inspector.query(
        'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton',
      )
    ).rows,
    before,
  );
});
