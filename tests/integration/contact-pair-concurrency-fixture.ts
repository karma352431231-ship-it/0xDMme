import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import type {
  Database,
  ContactAuthority,
} from '../../src/server/database/index.ts';
import { deferred } from '../fixtures/deferred.ts';
import { waitForBlocked } from './contact-concurrency-fixture.ts';

export async function verifyContactPairConcurrency(
  t: TestContext,
  input: {
    database: Database;
    inspector: pg.Client;
    pair: [ContactAuthority, ContactAuthority];
    other: [ContactAuthority, ContactAuthority];
  },
) {
  const { database, inspector, pair, other } = input;
  await inspector.query(
    "INSERT INTO hash_talk.contact_relations(lo,hi,requester,state) VALUES(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'approved')",
    [other[0].session.accountId, other[1].session.accountId],
  );
  await t.test(
    'unrelated participant pairs enter admission concurrently',
    async () => {
      const entered = deferred<void>(),
        release = deferred<void>();
      const first = database.contacts.withMessageConsent(
        pair[0],
        pair[1].session.accountId,
        async () => {
          entered.resolve();
          await release.promise;
        },
      );
      void first.catch((error: unknown) => entered.reject(error));
      try {
        await entered.promise;
        assert.equal(
          await database.contacts.withMessageConsent(
            other[0],
            other[1].session.accountId,
            () => Promise.resolve('independent'),
          ),
          'independent',
        );
        await database.contacts.state(other[0]);
      } finally {
        release.resolve();
        await first;
      }
    },
  );
  await t.test(
    'opposite directions wait on the same ordered participant locks',
    async () => {
      const entered = deferred<number>(),
        release = deferred<void>();
      const first = database.contacts.withMessageConsent(
        pair[0],
        pair[1].session.accountId,
        async (client) => {
          const result = await client.query<{ pid: number }>(
            'SELECT pg_backend_pid() AS pid',
          );
          entered.resolve(result.rows[0]!.pid);
          await release.promise;
        },
      );
      void first.catch((error: unknown) => entered.reject(error));
      let second: Promise<unknown> | undefined;
      try {
        const holder = await entered.promise;
        second = database.contacts.withMessageConsent(
          pair[1],
          pair[0].session.accountId,
          () => Promise.resolve('second'),
        );
        void second.catch(() => undefined);
        await waitForBlocked(inspector, holder);
      } finally {
        release.resolve();
        await Promise.all([first, second]);
      }
    },
  );
}
