import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type pg from 'pg';
import type { AccountSession } from '../../src/shared/account/index.ts';
import type { VaultService } from '../../src/server/vault/index.ts';
import { commitHash, operationBytes } from '../../src/shared/vault/index.ts';
import type { VaultCommit } from '../../src/shared/vault/index.ts';
import { readPage } from '../../src/client/vault-sync/protocol.ts';

export async function verifyVaultReservationCapacity(
  t: TestContext,
  input: {
    inspector: pg.Client;
    vault: VaultService;
    session: AccountSession;
    prepare: (value: string) => Promise<{ commit: VaultCommit }>;
  },
) {
  await t.test(
    'vault reservations use charged bytes beyond 256 pending uploads',
    async () => {
      const drafts = await Promise.all(
        Array.from({ length: 256 }, (_, i) => input.prepare(`pending-${i}`)),
      );
      const records = await Promise.all(
        drafts.map(async ({ commit }) => ({
          id: commit.id,
          hash: await commitHash(commit),
          object_hash: commit.block.hash,
          commit,
          charge: operationBytes(commit),
        })),
      );
      await input.inspector.query(
        `INSERT INTO hash_talk.vault_operations(account_id,id,hash,object_hash,commit,charge,state)
       SELECT $1,id,hash,object_hash,commit,charge,'reserved' FROM jsonb_to_recordset($2) AS r(id uuid,hash text,object_hash text,commit jsonb,charge integer)`,
        [input.session.accountId, JSON.stringify(records)],
      );
      const next = await input.prepare(
        'new reservation beyond the count ceiling',
      );
      const ids = [...records.map((r) => r.id), next.commit.id];
      try {
        const before = readPage(
          await input.vault.operate('read', input.session, { after: 0 }),
        );
        assert.equal(before.pending.length, 4);
        await input.vault.operate('reserve', input.session, {
          commit: next.commit,
        });
        await input.vault.operate('reserve', input.session, {
          commit: next.commit,
        });
        const preferred = ids.toSorted().at(-1)!;
        const after = readPage(
          await input.vault.operate('read', input.session, {
            after: 0,
            pendingId: preferred,
          }),
        );
        assert.equal(after.pending.length, 4);
        assert.equal(new Set(after.pending.map((c) => c.id)).size, 4);
        assert.ok(after.pending.some((c) => c.id === preferred));
        assert.equal(after.used - before.used, operationBytes(next.commit));
        const absent = readPage(
          await input.vault.operate('read', input.session, {
            after: 0,
            pendingId: crypto.randomUUID(),
          }),
        );
        assert.equal(absent.pending.length, 4);
        await assert.rejects(
          input.vault.operate('read', input.session, {
            after: 0,
            pendingId: 'invalid',
          }),
          { status: 400 },
        );
        await input.vault.operate('discard', input.session, {
          id: next.commit.id,
        });
        assert.equal(
          readPage(
            await input.vault.operate('read', input.session, { after: 0 }),
          ).used,
          before.used,
        );
      } finally {
        await input.inspector.query(
          "DELETE FROM hash_talk.vault_operations WHERE account_id=$1 AND id=ANY($2::uuid[]) AND state<>'accepted'",
          [input.session.accountId, ids],
        );
      }
    },
  );
}
