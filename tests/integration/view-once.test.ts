import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { snapshots } from '../fixtures/message-removal-database.ts';
import { createHash } from 'node:crypto';
import { proof } from '../fixtures/message-removal-database.ts';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import {
  messagePair,
  messageUser,
  admissionPacket,
} from '../fixtures/message-allocation-database.ts';
import type { MessageUser } from '../fixtures/message-allocation-database.ts';
import { assertStorageReconciled } from '../fixtures/storage-reservation-database.ts';
import {
  globalBytes,
  currentGlobalUsageSources,
} from '../fixtures/global-usage-database.ts';
import {
  viewOnceHeader,
  viewOnceHeaderBody,
} from '../../src/shared/view-once/index.ts';
import { digest } from '../../src/shared/devices/index.ts';
import { AccountError, encode } from '../../src/shared/account/index.ts';
import type { ViewOnceHeader } from '../../src/shared/view-once/index.ts';

await test('single-use deliveries authenticate participants, consume atomically, gate mobile pixels and reconcile storage', async (t) => {
  const c = await messageReceiptFixture(t);
  const pair = await messagePair(c);
  const stranger = await messageUser(c);
  const operate = (
    actor: MessageUser,
    operation: string,
    data: Record<string, unknown>,
    installed = false,
  ) =>
    c.db.viewOnce.operate(
      actor,
      'view-once-' + operation,
      {
        scope: 'private',
        peer:
          actor === pair.sender
            ? pair.recipient.session.accountId
            : pair.sender.session.accountId,
        ...data,
      },
      installed,
    );
  async function upload(policy: ViewOnceHeader['policy'], publish = true) {
    const packet = admissionPacket(pair);
    const ciphertext = Buffer.alloc(400_000, 13);
    const header = viewOnceHeader({
      version: 1,
      id: packet.id,
      scope: 'private',
      policy,
      sender: packet.sender,
      recipient: packet.recipient,
      bytes: ciphertext.length,
      hash: createHash('sha256').update(ciphertext).digest('hex'),
      iv: encode(new Uint8Array(12)),
      key: {
        ...packet.archives[1],
        ciphertext: Buffer.alloc(48).toString('base64'),
        ephemeral: Buffer.alloc(32).toString('base64').replace(/=+$/u, ''),
        mac: Buffer.alloc(8).toString('base64').replace(/=+$/u, ''),
      },
    });
    const hash = await digest(viewOnceHeaderBody(header));
    packet.viewOnce = { hash };
    assert.deepEqual(await operate(pair.sender, 'create', { header }), {
      offset: 0,
      ready: false,
    });
    assert.deepEqual(await operate(pair.sender, 'create', { header }), {
      offset: 0,
      ready: false,
    });
    await assert.rejects(
      operate(pair.recipient, 'part', {
        id: packet.id,
        hash,
        offset: 0,
        bytes: encode(ciphertext.subarray(0, 12)),
      }),
      { status: 403 },
    );
    for (let offset = 0; offset < ciphertext.length; offset += 192 * 1024)
      await operate(pair.sender, 'part', {
        id: packet.id,
        hash,
        offset,
        bytes: encode(ciphertext.subarray(offset, offset + 192 * 1024)),
      });
    assert.deepEqual(await operate(pair.sender, 'create', { header }), {
      offset: ciphertext.length,
      ready: true,
    });
    await assert.rejects(
      operate(pair.sender, 'part', {
        id: packet.id,
        hash,
        offset: 0,
        bytes: encode(Buffer.alloc(12, 14)),
      }),
      { status: 409 },
    );
    if (publish)
      await c.db.messages.admit(
        pair.sender,
        packet,
        await digest(JSON.stringify(packet)),
      );
    return { header, packet, hash, ciphertext, data: { id: packet.id, hash } };
  }
  await t.test(
    'browser denial preserves the sole delivery and history exports contain only the packet',
    async () => {
      const value = await upload('mobile');
      await assert.rejects(operate(pair.recipient, 'open', value.data), {
        status: 403,
      });
      await assert.rejects(operate(pair.sender, 'open', value.data, true), {
        status: 410,
      });
      await assert.rejects(operate(stranger, 'open', value.data, true));
      await assert.rejects(
        operate(
          {
            ...pair.recipient,
            session: { ...pair.recipient.session, csrf: 'invalid' },
          },
          'open',
          { ...value.data, peer: pair.sender.session.accountId },
          true,
        ),
        { status: 401 },
      );
      const snapshot = await c.db.messages.snapshot(pair.recipient);
      const backup = await c.db.messages.backupWindow(
        pair.recipient,
        [value.packet.id],
        snapshot,
      );
      assert.deepEqual(backup, [{ id: value.packet.id, packet: value.packet }]);
      const requests = await Promise.allSettled([
        operate(pair.recipient, 'open', value.data, true),
        operate(pair.recipient, 'open', value.data, true),
      ]);
      assert.equal(requests.filter((x) => x.status === 'fulfilled').length, 1);
      assert.equal(
        requests.filter(
          (x) =>
            x.status === 'rejected' &&
            x.reason instanceof AccountError &&
            x.reason.status === 410,
        ).length,
        1,
      );
      const delivery = requests.find((x) => x.status === 'fulfilled');
      assert.deepEqual(
        delivery?.status === 'fulfilled' ? delivery.value : null,
        { header: value.header, bytes: value.ciphertext.toString('base64') },
      );
      const row = (
        await c.inspector.query<{
          header: ViewOnceHeader | null;
          bytes: number;
          charge: string;
        }>(
          'SELECT header,octet_length(ciphertext) AS bytes,charge FROM hash_talk.view_once_payloads WHERE id=$1',
          [value.packet.id],
        )
      ).rows[0];
      assert.deepEqual(row, { header: null, bytes: 0, charge: '512' });
      assert.deepEqual(await operate(pair.recipient, 'status', value.data), {
        consumed: true,
        ready: true,
        keyId: null,
      });
      await assert.rejects(
        operate(pair.sender, 'create', { header: value.header }),
        { status: 410 },
      );
    },
  );
  await t.test(
    'files can download from a browser once, while unattached payloads cannot be opened',
    async () => {
      const pending = await upload('file', false);
      await assert.rejects(operate(pair.recipient, 'open', pending.data), {
        status: 410,
      });
      await operate(pair.sender, 'cancel', pending.data);
      const value = await upload('file');
      assert.deepEqual(await operate(pair.recipient, 'open', value.data), {
        header: value.header,
        bytes: value.ciphertext.toString('base64'),
      });
      await assert.rejects(operate(pair.recipient, 'open', value.data), {
        status: 410,
      });
      await assert.rejects(operate(pair.sender, 'cancel', value.data), {
        status: 409,
      });
    },
  );
  await t.test(
    'deletion removes independent content and expiration cleans only unlinked uploads',
    async () => {
      const value = await upload('mobile');
      await c.db.messages.remove(
        pair.sender,
        value.packet.id,
        await digest(JSON.stringify(value.packet)),
        proof(pair.sender),
      );
      assert.equal(
        (
          await c.inspector.query(
            'SELECT id FROM hash_talk.view_once_payloads WHERE id=$1',
            [value.packet.id],
          )
        ).rowCount,
        0,
      );
      const linked = await upload('file');
      const orphan = await upload('file', false);
      await c.inspector.query(
        "UPDATE hash_talk.view_once_payloads SET created_at=clock_timestamp()-interval '25 hours' WHERE id=ANY($1::uuid[])",
        [[linked.packet.id, orphan.packet.id]],
      );
      await c.db.viewOnce.clean();
      assert.equal(
        (
          await c.inspector.query(
            'SELECT id FROM hash_talk.view_once_payloads WHERE id=$1',
            [orphan.packet.id],
          )
        ).rowCount,
        0,
      );
      assert.equal(
        (
          await c.inspector.query(
            'SELECT id FROM hash_talk.view_once_payloads WHERE id=$1',
            [linked.packet.id],
          )
        ).rowCount,
        1,
      );
    },
  );
  await t.test(
    'reservations reject insufficient capacity atomically and all ledgers match source data',
    async () => {
      const pending = await upload('file', false);
      const before = await globalBytes(c.inspector);
      c.room.bytes = 0n;
      try {
        await assert.rejects(
          operate(pair.sender, 'create', {
            header: { ...pending.header, id: crypto.randomUUID() },
          }),
          { status: 503 },
        );
      } finally {
        c.room.bytes = 1_000_000_000_000n;
      }
      assert.equal(await globalBytes(c.inspector), before);
      await assertStorageReconciled(c.inspector, [
        pair.sender.session.accountId,
        pair.recipient.session.accountId,
        stranger.session.accountId,
      ]);
      const sources = await currentGlobalUsageSources(c.inspector);
      assert.ok(sources.some((x) => x.name === 'view_once_payloads'));
      const mismatch = await c.inspector.query(
        'SELECT q.account_id FROM hash_talk.account_quota_usage q FULL JOIN hash_talk.account_quota_totals t USING(account_id) WHERE q.used_bytes IS DISTINCT FROM t.used_bytes',
      );
      assert.equal(mismatch.rowCount, 0);
      await c.db.migrate();
    },
  );
});

await test('populated 106→107 migration preserves every prior source row, ledger and checksum', async (t) => {
  const c = await messageReceiptFixture(t, { through: 106 });
  const pair = await messagePair(c);
  const packet = admissionPacket(pair);
  await c.db.messages.admit(
    pair.sender,
    packet,
    await digest(JSON.stringify(packet)),
  );
  const before = await snapshots(c);
  const catalog = (
    await c.inspector.query(
      'SELECT * FROM hash_talk.schema_migrations ORDER BY version',
    )
  ).rows as unknown;
  await c.db.migrate();
  const after = await snapshots(c);
  assert.equal(after.bytes, before.bytes);
  assert.deepEqual(
    after.sources.filter((x) => x.name !== 'view_once_payloads'),
    before.sources,
  );
  assert.deepEqual(
    (
      await c.inspector.query(
        'SELECT * FROM hash_talk.schema_migrations WHERE version<=106 ORDER BY version',
      )
    ).rows,
    catalog,
  );
  const contract = JSON.parse(
    execFileSync('python3', ['tests/fixtures/view-once-migration-review.py'], {
      encoding: 'utf8',
    }),
  ) as Record<string, string>;
  for (const sql of Object.values(contract)) {
    const result = await c.inspector.query<Record<string, unknown>>(sql);
    const last = Array.isArray(result)
      ? (result as (typeof result)[]).at(-1)!
      : result;
    assert.deepEqual(Object.values(last.rows[0]!), [true]);
  }
});
