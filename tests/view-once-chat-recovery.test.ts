import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { recordDatabase } from './fixtures/record-database.ts';
import { resumeFixture } from './fixtures/message-resume.ts';
import {
  indexSearch,
  searchMessages,
} from '../src/client/message-search/index.ts';
import { localGet } from '../src/client/message-storage/index.ts';
import { aesKey, newSecret } from '../src/client/device-keys/index.ts';
import { encodeDailyText } from '../src/shared/daily/index.ts';

function storage(t: TestContext): void {
  const db = recordDatabase();
  for (const [name, value] of Object.entries({
    indexedDB: db.factory,
    IDBKeyRange: db.range,
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}

await test('a private history containing view-once text, image and file stays visible and reconnects with the real encrypted search index', async (t) => {
  storage(t);
  const secret = newSecret();
  const f = resumeFixture(true, {
    indexSearch: (authority, rows) =>
      indexSearch({ ...authority, key: () => aesKey(secret) }, rows),
  });
  t.after(() => f.controller.close());
  const before = await f.add('ordinary before');
  const protectedRows = [];
  for (const [index, metadata] of [
    { hash: 'a'.repeat(64), policy: 'mobile' as const },
    {
      hash: 'b'.repeat(64),
      policy: 'mobile' as const,
      file: { name: 'private-photo.png', mime: 'image/png', bytes: 300 },
    },
    { hash: 'c'.repeat(64), policy: 'file' as const },
  ].entries())
    protectedRows.push(
      await f.add(
        encodeDailyText({
          text: '',
          reply: null,
          forwarded: false,
          viewOnce: metadata,
        }),
        f.peer,
        undefined,
        index % 2 === 0,
      ),
    );
  const after = await f.add('ordinary after');
  await f.controller.synchronize();
  assert.deepEqual(
    f.data.frames.at(-1)?.map((x) => x.id),
    [before.id, ...protectedRows.map((x) => x.id), after.id],
  );
  for (const row of protectedRows)
    assert.equal(await localGet(f.session.accountId, 'search:' + row.id), null);
  assert.equal(f.controller.synchronizationIssues.length, 0);
  f.controller.setSession(null);
  f.controller.setSession(f.session);
  f.controller.select(f.peer);
  await f.controller.synchronize();
  assert.equal(f.data.frames.at(-1)?.length, 5);
  assert.equal(f.controller.synchronizationIssues.length, 0);
  await f.access.withVault(false, async (authority) => {
    const found = await searchMessages({
      a: { ...authority, key: () => aesKey(secret) },
      query: 'ordinary',
      after: null,
      guard: () => {},
    });
    assert.equal(found.items.length, 2);
    const hidden = await searchMessages({
      a: { ...authority, key: () => aesKey(secret) },
      query: 'private-photo',
      after: null,
      guard: () => {},
    });
    assert.deepEqual(hidden.items, []);
  });
});
