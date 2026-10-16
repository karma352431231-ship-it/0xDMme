import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { Wallet } from 'ethers';
import { Database } from '../../src/server/database/index.ts';
import type {
  PushJob,
  PushJobCursor,
} from '../../src/server/database/index.ts';
import { readPushJobPage } from '../../src/server/database/push-jobs.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { readWebConfiguration } from '../../src/server/web-configuration/index.ts';
import { pushJob } from '../fixtures/push-job.ts';

await test('push keyset pages preserve timestamp ties and leave newer generations pending', async (t) => {
  const config = readWebConfiguration(process.env);
  if (!new URL(config.databaseUrl).pathname.startsWith('/hash_talk_test'))
    throw new Error('Exclusive synthetic database required.');
  const db = new Database(config.databaseUrl),
    inspector = new pg.Client({ connectionString: config.databaseUrl });
  await db.migrate();
  await inspector.connect();
  const account = new AccountService({
      store: db.authentication,
      origin: 'http://127.0.0.1:45219',
    }),
    wallet = Wallet.createRandom();
  const challenge = await account.challenge({
    address: wallet.address,
    chainId: 1,
    deviceId: crypto.randomUUID(),
  });
  const login = await account.login(
    {
      id: challenge.id,
      signature: await wallet.signMessage(challenge.message),
    },
    challenge.browserToken,
  );
  t.after(async () => {
    for (const table of [
      'push_subscriptions',
      'login_sessions',
      'login_devices',
    ])
      await inspector.query(
        `DELETE FROM hash_talk.${table} WHERE account_id=$1`,
        [login.session.accountId],
      );
    await inspector.query('DELETE FROM hash_talk.accounts WHERE id=$1', [
      login.session.accountId,
    ]);
    await inspector.query(
      'DELETE FROM hash_talk.login_challenges WHERE address=$1',
      [wallet.address.toLowerCase()],
    );
    await inspector.end();
    await db.close();
  });
  // Query-contract fixtures need no device keys or delivery; authorization has separate integration coverage.
  const jobs = Array.from({ length: 50 }, () =>
    pushJob(login.session.accountId),
  );
  await inspector.query(
    `INSERT INTO hash_talk.push_subscriptions(account_id,device_id,endpoint,subscription,pending,generation,attempts,next_attempt,charge)
     SELECT $1,device,subscription->>'endpoint',subscription,true,1,attempts,scheduled::timestamptz,charge
     FROM jsonb_to_recordset($2) AS r(device uuid,subscription jsonb,attempts integer,scheduled text,charge integer)`,
    [
      login.session.accountId,
      JSON.stringify(
        jobs.map((job, i) => ({
          device: job.device_id,
          subscription: job.subscription,
          attempts: i === 49 ? 3 : 0,
          scheduled:
            i === 48
              ? '2999-01-01 00:00:00+00'
              : '2000-01-01 00:00:00.123456+00',
          charge: Buffer.byteLength(JSON.stringify(job.subscription)) + 512,
        })),
      ),
    ],
  );
  const collected: PushJob[] = [];
  let after: PushJobCursor | null = null;
  for (let page = 0; page < 4; page++) {
    const result = await readPushJobPage(inspector, after);
    assert.ok(result.items.length <= 16);
    collected.push(...result.items);
    after = result.next;
    if (page === 0) {
      assert.ok(after?.scheduledAt.includes('.123456'));
      await inspector.query(
        "UPDATE hash_talk.push_subscriptions SET generation=2,next_attempt='1999-01-01 00:00:00+00' WHERE account_id=$1 AND device_id=$2",
        [login.session.accountId, collected[0]!.device_id],
      );
    }
    if (!after) break;
  }
  assert.equal(after, null);
  assert.deepEqual(
    collected.map((job) => job.device_id),
    jobs
      .slice(0, 48)
      .map((job) => job.device_id)
      .toSorted(),
  );
  assert.equal(new Set(collected.map((job) => job.device_id)).size, 48);
  await db.daily.finish(collected[0]!, 'sent');
  const retained = await inspector.query<{
    generation: string;
    pending: boolean;
  }>(
    'SELECT generation::text,pending FROM hash_talk.push_subscriptions WHERE account_id=$1 AND device_id=$2',
    [login.session.accountId, collected[0]!.device_id],
  );
  assert.deepEqual(retained.rows, [{ generation: '2', pending: true }]);
  const refreshed = await readPushJobPage(inspector, null);
  assert.equal(refreshed.items[0]?.generation, '2');
  assert.equal(refreshed.items[0]?.device_id, collected[0]!.device_id);
  assert.equal(
    await db.daily.nextPushAttempt([collected[0]!]),
    Date.parse('2000-01-01T00:00:00.123Z'),
  );
  assert.equal(
    await db.daily.nextPushAttempt(collected),
    Date.parse('2999-01-01T00:00:00Z'),
  );
  assert.equal(
    await db.daily.nextPushAttempt(),
    Date.parse('1999-01-01T00:00:00Z'),
  );
});
