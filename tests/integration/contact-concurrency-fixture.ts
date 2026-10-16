import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import type pg from 'pg';
import type {
  Database,
  ContactAuthority,
} from '../../src/server/database/index.ts';
import { deferred } from '../fixtures/deferred.ts';

interface Context {
  database: Database;
  inspector: pg.Client;
  authority: ContactAuthority;
  peer: ContactAuthority;
}

export async function verifyContactConcurrency(t: TestContext, c: Context) {
  await t.test(
    'authenticated reads coexist on the same account and admission lock',
    async () => {
      await c.inspector.query('BEGIN');
      try {
        await c.inspector.query(
          "SELECT pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'))",
        );
        await c.inspector.query(
          'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR SHARE',
          [c.authority.session.accountId],
        );
        await Promise.all([
          c.database.contacts.state(c.authority),
          c.database.contacts.snapshot(c.authority),
          c.database.contacts.list(c.authority, 'approved', null),
          c.database.messages.snapshot(c.authority),
          c.database.matrix.inbox(c.authority),
          c.database.matrix.groupInbox(c.authority, 0),
          c.database.messageRecovery.current(c.authority),
          c.database.daily.pushPreferences(c.authority),
          c.database.calls.authorize(c.authority, null, (gate) => gate.enabled),
        ]);
      } finally {
        await c.inspector.query('ROLLBACK');
      }
    },
  );
  await t.test(
    'read contracts reject writes and release their locks after failure',
    async () => {
      await assert.rejects(
        c.database.contacts.withMessageRead(c.authority, (client) =>
          client.query(
            'UPDATE hash_talk.accounts SET display_name=$2 WHERE id=$1',
            [c.authority.session.accountId, 'must not persist'],
          ),
        ),
        { code: '25006' },
      );
      await c.database.contacts.state(c.authority);
      await assert.rejects(
        c.database.contacts.withMessageRead(
          { ...c.authority, directory: '0'.repeat(64) },
          () => Promise.resolve('must not be released'),
        ),
        { status: 409 },
      );
    },
  );
  await t.test(
    'reads retain account revocation protection and exclude mutations',
    async () => {
      await verifyHeldRead(c);
    },
  );
  await t.test(
    'a read waiting behind revocation rechecks the committed directory',
    async () => {
      await verifyRevocation(c);
    },
  );
}

async function verifyHeldRead(c: Context): Promise<void> {
  const entered = deferred<number>(),
    release = deferred<void>();
  const before = await c.database.contacts.state(c.authority);
  const reading = c.database.contacts.withMessageRead(
    c.authority,
    async (client) => {
      const result = await client.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      entered.resolve(result.rows[0]!.pid);
      await release.promise;
    },
  );
  void reading.catch((error: unknown) => entered.reject(error));
  let writing: Promise<unknown> | undefined;
  try {
    const holder = await entered.promise;
    await Promise.all([
      c.database.contacts.state(c.authority),
      c.database.contacts.state(c.peer),
    ]);
    await c.inspector.query('BEGIN');
    try {
      await assert.rejects(
        c.inspector.query(
          'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE NOWAIT',
          [c.authority.session.accountId],
        ),
        { code: '55P03' },
      );
    } finally {
      await c.inspector.query('ROLLBACK');
    }
    writing = c.database.contacts.configure(c.authority, {
      revision: before.revision,
      mode: before.mode,
      inviteHash: before.inviteHash,
    });
    void writing.catch(() => undefined);
    await waitForBlocked(c.inspector, holder);
  } finally {
    release.resolve();
    await Promise.all([reading, writing]);
  }
}

async function verifyRevocation(c: Context): Promise<void> {
  await c.inspector.query('BEGIN');
  let reading: Promise<unknown> | undefined;
  try {
    const holder = await c.inspector.query<{ pid: number }>(
      'SELECT pg_backend_pid() AS pid',
    );
    await c.inspector.query(
      'SELECT id FROM hash_talk.accounts WHERE id=$1 FOR UPDATE',
      [c.authority.session.accountId],
    );
    await c.inspector.query(
      'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
      [c.authority.session.accountId, 'f'.repeat(64)],
    );
    reading = c.database.contacts.state(c.authority);
    void reading.catch(() => undefined);
    await waitForBlocked(c.inspector, holder.rows[0]!.pid);
    await c.inspector.query('COMMIT');
    await assert.rejects(reading, { status: 409 });
  } finally {
    await c.inspector.query('ROLLBACK');
    await c.inspector.query(
      'UPDATE hash_talk.device_directories SET head=$2 WHERE account_id=$1',
      [c.authority.session.accountId, c.authority.directory],
    );
    await reading?.catch(() => undefined);
  }
}

async function waitForBlocked(
  inspector: pg.Client,
  holder: number,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = await inspector.query<{ blocked: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='hash-talk' AND $1=ANY(pg_blocking_pids(pid))) AS blocked",
      [holder],
    );
    if (result.rows[0]?.blocked) return;
    await setTimeout(10);
  }
  assert.fail(
    'The coordinated operation did not wait for its conflicting transaction.',
  );
}
