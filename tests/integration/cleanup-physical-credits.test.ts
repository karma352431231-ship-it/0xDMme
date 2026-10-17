import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentAllocator } from '../../src/server/database/content-allocations.ts';
import { contentSqlTransactionBytes } from '../../src/server/database/content-capacity.ts';
import { VolumeContentCapacity } from '../../src/server/storage-capacity/index.ts';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import type { MessageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import { expectNoAllocations } from '../fixtures/content-allocation-database.ts';

const basic = contentSqlTransactionBytes;
async function owners(c: MessageReceiptFixture, work: () => Promise<void>) {
  await Promise.all([c.writer.query('BEGIN'), c.reader.query('BEGIN')]);
  try {
    await work();
  } finally {
    await Promise.all([c.writer.query('ROLLBACK'), c.reader.query('ROLLBACK')]);
    c.room.bytes = 1_000_000_000_000n;
    await c.allocator.collect();
    await expectNoAllocations(c.inspector);
  }
}

await test('cleanup SQL beyond the basic allowance competes for durable physical credits', async (t) => {
  const c = await messageReceiptFixture(t),
    allocator = new ContentAllocator(c.pool, () => Promise.resolve(1000n));
  await t.test(
    'two cleanup owners cannot spend the same spare bytes; the exact boundary succeeds',
    async () => {
      await owners(c, async () => {
        const grant = await allocator.reserve(
          c.writer,
          basic + 600,
          'message-remove',
        );
        assert.deepEqual(
          await allocator.reserve(c.writer, basic + 600, 'message-remove'),
          grant,
        );
        await assert.rejects(
          allocator.reserve(c.writer, basic + 599, 'message-remove'),
          { status: 503 },
        );
        await assert.rejects(
          allocator.reserve(c.reader, basic + 401, 'personal-clean'),
          { status: 503 },
        );
        await allocator.reserve(c.reader, basic + 400, 'personal-clean');
        assert.equal(await allocator.finish(grant), false);
      });
    },
  );
  for (const cleanupFirst of [false, true])
    await t.test(
      `cleanup and real growth share spare bytes in both orders (cleanup first: ${cleanupFirst})`,
      async () => {
        await owners(c, async () => {
          if (cleanupFirst) {
            await allocator.reserve(c.writer, basic + 600, 'personal-clean');
            await assert.rejects(allocator.reserve(c.reader, 401), {
              status: 503,
            });
            await allocator.reserve(c.reader, 400);
          } else {
            await allocator.reserve(c.writer, 400);
            await assert.rejects(
              allocator.reserve(c.reader, basic + 601, 'message-remove'),
              { status: 503 },
            );
            await allocator.reserve(c.reader, basic + 600, 'message-remove');
          }
        });
      },
    );
  await t.test(
    'savepoint rollback and coordinator replacement retain excess until the owner finishes',
    async () => {
      await owners(c, async () => {
        await c.writer.query('SAVEPOINT cleanup');
        const grant = await allocator.reserve(
          c.writer,
          basic + 1000,
          'personal-clean',
        );
        await c.writer.query('ROLLBACK TO SAVEPOINT cleanup');
        const replacement = new ContentAllocator(c.pool, () =>
          Promise.resolve(1000n),
        );
        assert.equal(await replacement.finish(grant), false);
        assert.equal(await replacement.collect(), 0);
        await assert.rejects(replacement.reserve(c.reader, 1), { status: 503 });
        await c.writer.query('ROLLBACK');
        await replacement.reserve(c.reader, 1000);
      });
    },
  );
  await t.test(
    'ordinary maintenance remains available without spare room and vault lifecycle keeps its specific bound',
    async () => {
      await owners(c, async () => {
        const noRoom = new ContentAllocator(c.pool, () => Promise.resolve(0n));
        await noRoom.reserve(c.writer, basic, 'message-remove');
        await noRoom.reserve(c.reader, basic, 'personal-clean');
        await assert.rejects(
          noRoom.reserve(c.inspector, basic + 1, 'vault-maintain'),
          { status: 503 },
        );
      });
    },
  );
  await t.test(
    'legacy physical preflight and final admission include the retained cleanup excess',
    async () => {
      await owners(c, async () => {
        const policy = new VolumeContentCapacity({
          read: () => Promise.resolve(c.room.bytes),
        });
        await c.inspector.query('BEGIN');
        await c.inspector.query('SELECT pg_current_xact_id()');
        const headroom = await policy.allocationHeadroom(c.inspector);
        await c.inspector.query('ROLLBACK');
        c.room.bytes = c.room.bytes - headroom + 48n * 1024n * 1024n;
        assert.equal(
          await policy.fits(c.inspector, {
            logicalBytes: 0,
            additionalBytes: 9 * 1024 * 1024,
          }),
          true,
        );
        const grant = await c.allocator.reserve(
          c.writer,
          basic + 16 * 1024 * 1024,
          'personal-clean',
        );
        assert.equal(
          await policy.fits(c.inspector, {
            logicalBytes: 0,
            additionalBytes: 9 * 1024 * 1024,
          }),
          false,
        );
        c.room.bytes -= 40n * 1024n * 1024n;
        await assert.rejects(
          policy.assert(c.reader, { logicalBytes: 0, intent: 'growth' }),
          { status: 503 },
        );
        await c.reader.query('ROLLBACK');
        await c.writer.query('ROLLBACK');
        await c.allocator.finish(grant);
        assert.equal(
          await policy.fits(c.inspector, {
            logicalBytes: 0,
            additionalBytes: 0,
          }),
          true,
        );
      });
    },
  );
});
