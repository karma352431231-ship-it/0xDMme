import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  groupMediaQuota,
  groupMediaTarget,
  groupMediaWarning,
} from '../src/shared/group-quota/index.ts';
import {
  mediaCleanupRequired,
  selectMediaCleanupBatch,
  mediaCleanupDueAt,
  mediaCleanupDue,
  groupCleanupNotice,
} from '../src/shared/group-retention/index.ts';

await test('limpeza começa em 90%, seleciona mídia antiga até 70% e não antecipa as 24 horas', () => {
  assert.equal(mediaCleanupRequired(groupMediaWarning - 1), 0);
  assert.equal(
    mediaCleanupRequired(groupMediaWarning),
    groupMediaWarning - groupMediaTarget,
  );
  assert.equal(
    mediaCleanupRequired(groupMediaQuota),
    groupMediaQuota - groupMediaTarget,
  );
  const objects = Array.from({ length: 64 }, (_, index) => ({
    id: crypto.randomUUID(),
    sequence: index + 1,
    bytes: 3_000_000,
  }));
  const first = selectMediaCleanupBatch({
    remainingBytes: mediaCleanupRequired(groupMediaQuota),
    after: 0,
    items: objects,
  });
  assert.equal(first.selected.length, 64);
  assert.equal(
    first.remainingBytes,
    groupMediaQuota - groupMediaTarget - 64 * 3_000_000,
  );
  const next = Array.from({ length: 64 }, (_, index) => ({
    id: crypto.randomUUID(),
    sequence: index + 65,
    bytes: 3_000_000,
  }));
  const second = selectMediaCleanupBatch({
    remainingBytes: first.remainingBytes,
    after: first.after,
    items: next,
  });
  assert.equal(second.selected.length, 64);
  assert.equal(second.remainingBytes, 66_000_000);
  const third = selectMediaCleanupBatch({
    remainingBytes: second.remainingBytes,
    after: second.after,
    items: Array.from({ length: 32 }, (_, index) => ({
      id: crypto.randomUUID(),
      sequence: index + 129,
      bytes: 3_000_000,
    })),
  });
  assert.equal(third.selected.length, 22);
  assert.equal(third.remainingBytes, 0);
  const dueAt = mediaCleanupDueAt(10_000);
  assert.equal(dueAt, 10_000 + groupCleanupNotice);
  assert.equal(mediaCleanupDue({ dueAt, now: dueAt - 1 }), false);
  assert.equal(mediaCleanupDue({ dueAt, now: dueAt }), true);
  assert.equal(first.selected[0]?.id, objects[0]?.id);
});

await test('seleção não aceita sequências repetidas, bytes inválidos nem lotes ilimitados', () => {
  const one = { id: crypto.randomUUID(), sequence: 1, bytes: 10 };
  for (const items of [
    [one, one],
    [one, { ...one, id: crypto.randomUUID(), sequence: 0 }],
    [{ ...one, bytes: 0 }],
    [{ ...one, bytes: 3_096_001 }],
    Array.from({ length: 65 }, (_, i) => ({
      ...one,
      id: crypto.randomUUID(),
      sequence: i + 1,
    })),
  ])
    assert.throws(() =>
      selectMediaCleanupBatch({ remainingBytes: 100, after: 0, items }),
    );
  assert.throws(() => mediaCleanupRequired(groupMediaQuota + 1));
  assert.throws(() => mediaCleanupDueAt(Number.MAX_SAFE_INTEGER));
  assert.throws(() => mediaCleanupDue({ now: NaN, dueAt: 10 }));
  assert.deepEqual(
    selectMediaCleanupBatch({ remainingBytes: 0, after: 1, items: [] }),
    { selected: [], remainingBytes: 0, after: 1 },
  );
});
