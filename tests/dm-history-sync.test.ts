import assert from 'node:assert/strict';
import { test } from 'node:test';
import { synchronizeDmHistory } from '../src/client/social-dm/history-sync.ts';
import { deferred } from './fixtures/deferred.ts';

function fixture() {
  const snapshot = {
    anchor: 12,
    removals: 0,
    directory: 'a'.repeat(64),
    profile: crypto.randomUUID(),
  };
  let cursor: unknown = null;
  const pages: number[] = [],
    saved: unknown[] = [];
  const options = {
    snapshot: () => Promise.resolve({ ...snapshot }),
    cursor: () => Promise.resolve(cursor),
    save: (next: unknown) => {
      cursor = next;
      saved.push(next);
      return Promise.resolve();
    },
    page: (_snapshot: unknown, after: number) => {
      pages.push(after);
      return Promise.resolve({
        next: after < 12 ? 12 : null,
        unavailable: [] as string[],
      });
    },
    guard: () => {},
  };
  return {
    snapshot,
    options,
    pages,
    saved,
    cursor: (value: unknown) => {
      cursor = value;
    },
  };
}
await test('DM sincroniza uma vez e abre outras conversas só conferindo snapshot; não regrava o cursor igual', async () => {
  const f = fixture();
  await synchronizeDmHistory(f.options);
  await synchronizeDmHistory(f.options);
  assert.deepEqual(f.pages, [0]);
  assert.equal(f.saved.length, 1);
  f.snapshot.anchor = 14;
  f.options.page = (_snapshot, after) => {
    f.pages.push(after);
    return Promise.resolve({ next: 14, unavailable: [] });
  };
  await synchronizeDmHistory(f.options);
  assert.deepEqual(f.pages, [0, 12]);
});
await test('versão antiga relê edições; remoção ou mudança de autoridade invalida o cursor, e lacunas não avançam', async () => {
  const f = fixture();
  f.cursor({ version: 2, after: 12, removals: 0 });
  await synchronizeDmHistory(f.options);
  f.snapshot.removals++;
  await synchronizeDmHistory(f.options);
  f.snapshot.directory = 'b'.repeat(64);
  await synchronizeDmHistory(f.options);
  assert.deepEqual(f.pages, [0, 0, 0]);
  const g = fixture();
  g.options.page = () =>
    Promise.resolve({ next: 12, unavailable: ['unavailable'] });
  await synchronizeDmHistory(g.options);
  assert.equal(g.saved.length, 0);
});
await test('snapshot alterado durante a leitura e cancelamento não publicam cursor; paginação sem progresso falha', async () => {
  const f = fixture(),
    pending = deferred<{ next: number; unavailable: string[] }>();
  f.options.page = () => pending.promise;
  const read = synchronizeDmHistory(f.options);
  await new Promise<void>((resolve) => setImmediate(resolve));
  f.snapshot.removals++;
  pending.resolve({ next: 12, unavailable: [] });
  await assert.rejects(read, /changed/u);
  assert.equal(f.saved.length, 0);
  const g = fixture();
  g.options.page = () => Promise.resolve({ next: 0, unavailable: [] });
  await assert.rejects(synchronizeDmHistory(g.options), /pagination/u);
  g.options.guard = () => {
    throw new Error('Session changed');
  };
  await assert.rejects(synchronizeDmHistory(g.options), /[Ss]ession/u);
  assert.equal(g.saved.length, 0);
});
