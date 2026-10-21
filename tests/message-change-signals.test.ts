import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Socket } from 'node:net';
import { IncomingMessage, ServerResponse } from 'node:http';
import pg from 'pg';
import {
  liveChangeCategories,
  isLiveChangeCategory,
} from '../src/shared/live-changes/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import {
  DatabaseChanges,
  changeCategories,
} from '../src/server/database/changes.ts';
import type { CommittedChange } from '../src/server/database/changes.ts';
import { ChangeBatch } from '../src/server/database/transaction-changes.ts';
import { ContactStore } from '../src/server/database/contacts.ts';
import { MessageLive } from '../src/server/message-live/index.ts';

function session(): AccountSession {
  return {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    address: '0x' + '1'.repeat(40),
    ecosystem: 'evm',
    name: 'Synthetic',
    profileRevision: 0,
    deviceState: 'pending',
    historyAuthorized: false,
  };
}
function response() {
  const output = new ServerResponse(new IncomingMessage(new Socket())),
    frames: string[] = [];
  output.write = (chunk: unknown) => {
    frames.push(String(chunk));
    return true;
  };
  output.end = () => {
    output.emit('close');
    return output;
  };
  return { output, frames };
}
function turn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

await test('live categories are closed and unfamiliar/legacy scopes request general reconciliation', () => {
  assert.ok(liveChangeCategories.every(isLiveChangeCategory));
  for (const input of [
    null,
    undefined,
    [],
    ['unknown'],
    ['private-messages', 'unknown'],
    Array(20).fill('status'),
  ])
    assert.equal(changeCategories(input), null);
  assert.equal(isLiveChangeCategory('message-id'), false);
  assert.deepEqual(changeCategories(['private-messages', 'private-messages']), [
    'private-messages',
  ]);
});

await test('transaction categories and closing signals retain each affected account scope', () => {
  const batch = new ChangeBatch();
  batch.add(['sender', 'recipient'], { category: 'private-messages' });
  batch.add(['sender'], { category: 'private-receipts' });
  batch.add(['recipient'], { category: 'private-messages' }, true);
  batch.add(['unrelated'], { category: 'status' });
  assert.deepEqual(batch.groups(), [
    {
      accounts: ['sender'],
      categories: ['private-messages', 'private-receipts'],
      authorization: false,
      removed: false,
    },
    {
      accounts: ['recipient'],
      categories: ['private-messages'],
      authorization: false,
      removed: true,
    },
    {
      accounts: ['unrelated'],
      categories: ['status'],
      authorization: false,
      removed: false,
    },
  ]);
  batch.add(['sender'], {});
  assert.equal(batch.groups()[0]?.categories, null);
  assert.deepEqual(batch.groups()[1]?.categories, ['private-messages']);
});

await test('coordinated commit publishes categorized hints; failure rolls back without events', async (t) => {
  const pool = new pg.Pool(),
    client = Object.assign(new pg.Client(), { release() {} });
  const statements: string[] = [],
    notifications: unknown[] = [],
    observed: CommittedChange[] = [];
  t.mock.method(pool, 'connect', () => Promise.resolve(client));
  t.mock.method(client, 'query', (sql: string, values?: string[]) => {
    statements.push(sql);
    if (sql.includes('pg_notify'))
      notifications.push(JSON.parse(values?.[0] ?? '') as unknown);
    if (sql === 'COMMIT') assert.equal(observed.length, 0);
    return Promise.resolve({
      command: 'SELECT',
      rowCount: 0,
      oid: 0,
      rows: [],
      fields: [],
    });
  });
  const changes = new DatabaseChanges();
  changes.subscribe({
    notify: (event) => observed.push(event),
    failed: () => assert.fail('Signal failure'),
  });
  const contacts = new ContactStore({
    pool,
    changes,
    relayChanges: true,
    allocations: undefined,
    capacity: 1_000_000,
  });
  await assert.rejects(
    contacts.withMaintenance((c) => {
      contacts.changed(c, ['recipient'], { category: 'private-messages' });
      contacts.removed(c, ['recipient'], 'private-messages');
      throw new Error('Rejected admission');
    }),
    /Rejected admission/,
  );
  assert.equal(observed.length, 0);
  assert.deepEqual(notifications, []);
  assert.ok(statements.includes('ROLLBACK'));
  await contacts.withMaintenance((c) => {
    contacts.changed(c, ['sender', 'recipient'], {
      category: 'private-messages',
    });
    contacts.changed(c, ['sender'], { category: 'private-receipts' });
    return Promise.resolve();
  });
  assert.equal(observed.length, 2);
  assert.deepEqual(
    observed.map((e) => [e.accounts, e.categories]),
    [
      [['sender'], ['private-messages', 'private-receipts']],
      [['recipient'], ['private-messages']],
    ],
  );
  assert.deepEqual(
    notifications.map((entry) => Object.keys(entry as object).sort()),
    [
      ['accounts', 'authorization', 'categories', 'removed'],
      ['accounts', 'authorization', 'categories', 'removed'],
    ],
  );
  await pool.end();
});

await test('legacy and categorized streams coalesce bounded empty frames without leaking entities', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const changes = new DatabaseChanges(),
    live = new MessageLive(changes),
    owner = session();
  const legacy = response(),
    modern = response(),
    unrelated = response();
  let checks = 0;
  t.after(() => live.close());
  for (const target of [legacy, modern])
    live.open({
      session: owner,
      response: target.output,
      categories: target === modern,
      validate: () => {
        checks++;
        return Promise.resolve(true);
      },
    });
  live.open({
    session: session(),
    response: unrelated.output,
    categories: true,
    validate: () => Promise.resolve(true),
  });
  for (let count = 0; count < 100; count++)
    changes.committed([owner.accountId], {
      categories: [...liveChangeCategories],
    });
  t.mock.timers.tick(99);
  assert.equal(checks, 0);
  t.mock.timers.tick(1);
  await turn();
  assert.equal(checks, 2);
  assert.equal(
    legacy.frames.filter((frame) => frame.includes('event: changed')).length,
    1,
  );
  assert.equal(modern.frames.length, liveChangeCategories.length + 1);
  for (const category of liveChangeCategories)
    assert.ok(modern.frames.includes(`event: ${category}\ndata: {}\n\n`));
  assert.equal(unrelated.frames.length, 1);
  for (const frame of [...legacy.frames, ...modern.frames]) {
    assert.match(frame, /^event: [a-z-]+\ndata: \{\}\n\n$/u);
    assert.ok(!frame.includes(owner.accountId));
    assert.ok(!frame.includes(owner.deviceId));
  }
});

await test('unclassified changes supersede category hints while call and immediate closing controls survive', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const changes = new DatabaseChanges(),
    live = new MessageLive(changes),
    owner = session(),
    target = response();
  t.after(() => live.close());
  let release: ((value: boolean) => void) | undefined;
  live.open({
    session: owner,
    response: target.output,
    categories: true,
    callWakeups: true,
    validate: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  changes.committed([owner.accountId], { categories: ['private-messages'] });
  live.wakeCalls([owner.accountId]);
  changes.committed([owner.accountId]);
  changes.committed([owner.accountId], { categories: ['status'] });
  t.mock.timers.tick(100);
  await turn();
  changes.committed([owner.accountId], {
    categories: ['contacts'],
    removed: true,
    authorization: true,
  });
  assert.ok(target.frames.includes('event: authorization\ndata: {}\n\n'));
  assert.ok(target.frames.includes('event: removed\ndata: {}\n\n'));
  assert.ok(!target.frames.some((frame) => frame.includes('event: changed')));
  release?.(true);
  await turn();
  assert.ok(target.frames.includes('event: changed\ndata: {}\n\n'));
  assert.ok(target.frames.includes('event: call\ndata: {}\n\n'));
  assert.ok(
    !target.frames.some((frame) =>
      /event: (private-messages|status|contacts)/u.test(frame),
    ),
  );
});
