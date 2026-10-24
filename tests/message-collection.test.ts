import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { Database } from '../src/server/database/index.ts';
import { MessageService } from '../src/server/messages/index.ts';
import { ObjectStore } from '../src/server/object-store/index.ts';
import { AttachmentService } from '../src/server/attachments/index.ts';
import { SocialDmService } from '../src/server/social-dm/index.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';
import { messageServiceFixture } from './fixtures/message-service.ts';

function collection(t: TestContext) {
  const db = new Database('postgresql://127.0.0.1/hash_talk_test');
  const objects = new ObjectStore('.local/h10-collection-synthetic');
  const service = new MessageService(db, db.devices, objects);
  t.after(async () => {
    await service.close();
    await db.close();
  });
  const row = {
    account_id: crypto.randomUUID(),
    id: crypto.randomUUID(),
    object_hash: 'a'.repeat(64),
  };
  t.mock.method(db.backups, 'garbage', () => Promise.resolve([row]));
  const collected = t.mock.method(db.backups, 'collected', () =>
    Promise.resolve(),
  );
  return { db, objects, service, row, collected };
}

await test('collection marks a backup complete only after its object was discarded', async (t) => {
  const f = collection(t),
    gate = deferred<void>(),
    entered = deferred<void>();
  t.mock.method(f.objects, 'discardPersonal', (hash: string) => {
    assert.equal(hash, f.row.object_hash);
    entered.resolve();
    return gate.promise;
  });
  const cleaning = f.service.cleanPersonal();
  await waitForBoundary(entered.promise);
  assert.equal(f.collected.mock.callCount(), 0);
  gate.resolve();
  await cleaning;
  assert.deepEqual(f.collected.mock.calls[0]?.arguments, [
    f.row.account_id,
    f.row.id,
  ]);
});

await test('object deletion failure leaves collection pending and propagates to its caller', async (t) => {
  const f = collection(t);
  t.mock.method(f.objects, 'discardPersonal', () =>
    Promise.reject(new Error('Synthetic object deletion failure')),
  );
  await assert.rejects(
    f.service.cleanPersonal(),
    /Synthetic object deletion failure/u,
  );
  assert.equal(f.collected.mock.callCount(), 0);
});

await test('failed collection persistence stops the batch without simulating completion', async (t) => {
  const f = collection(t);
  t.mock.method(f.db.backups, 'garbage', () =>
    Promise.resolve([f.row, { ...f.row, id: crypto.randomUUID() }]),
  );
  const discarded = t.mock.method(f.objects, 'discardPersonal', () =>
    Promise.resolve(),
  );
  t.mock.method(f.db.backups, 'collected', () =>
    Promise.reject(new Error('Synthetic collection persistence failure')),
  );
  await assert.rejects(
    f.service.cleanPersonal(),
    /Synthetic collection persistence failure/u,
  );
  assert.equal(discarded.mock.callCount(), 1);
});

await test('personal removal does not return before immediate object collection finishes', async (t) => {
  const objects = new ObjectStore('.local/h10-collection-synthetic');
  const f = await messageServiceFixture(t, objects);
  const gate = deferred<void>(),
    entered = deferred<void>();
  t.mock.method(f.db.backups, 'clean', () =>
    Promise.resolve({ used: 0, released: 0, items: [] }),
  );
  t.mock.method(f.db.backups, 'garbage', () =>
    Promise.resolve([
      {
        account_id: f.session.accountId,
        id: crypto.randomUUID(),
        object_hash: 'a'.repeat(64),
      },
    ]),
  );
  t.mock.method(f.db.backups, 'collected', () => Promise.resolve());
  t.mock.method(objects, 'discardPersonal', () => {
    entered.resolve();
    return gate.promise;
  });
  t.mock.method(AttachmentService.prototype, 'clean', () => Promise.resolve());
  t.mock.method(SocialDmService.prototype, 'clean', () => Promise.resolve());
  let finished = false;
  const result = f.service
    .operate('personal-clean', f.session, await f.proof('personal-clean'))
    .then((value) => {
      finished = true;
      return value;
    });
  await waitForBoundary(entered.promise);
  assert.equal(finished, false);
  gate.resolve();
  assert.deepEqual(await result, { used: 0, released: 0, items: [] });
});
