import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callLogLifetime,
  callLogLimit,
  emptyCallLog,
  mergeCallLogs,
  parseCallLog,
  visibleMissedCalls,
} from '../src/client/calls/index.ts';

const now = 10 * callLogLifetime;
const id = () => crypto.randomUUID();
const peer = crypto.randomUUID();

await test('call answered on another device leaves the missed-call list', () => {
  const call = { id: id(), peer, at: now - 1000 };
  const ringingHere = { ...emptyCallLog(), missed: [call] };
  const answeredThere = {
    ...emptyCallLog(),
    answered: [{ id: call.id, at: now - 900 }],
  };
  const merged = mergeCallLogs([ringingHere, answeredThere], now);
  assert.deepEqual(visibleMissedCalls(merged), []);
});

await test('device versions merge without duplicating a call', () => {
  const call = { id: id(), peer, at: now - 1000 };
  const other = { id: id(), peer, at: now - 500 };
  const merged = mergeCallLogs(
    [
      { ...emptyCallLog(), missed: [call] },
      { ...emptyCallLog(), missed: [call, other] },
    ],
    now,
  );
  assert.deepEqual(
    visibleMissedCalls(merged).map((row) => row.id),
    [other.id, call.id],
  );
});

await test('retention: 30 days, 50 most recent and nothing before cleanup', () => {
  const old = { id: id(), peer, at: now - callLogLifetime - 1 };
  const many = Array.from({ length: callLogLimit + 5 }, (_, i) => ({
    id: id(),
    peer,
    at: now - i - 1,
  }));
  const kept = mergeCallLogs(
    [{ ...emptyCallLog(), missed: [old, ...many] }],
    now,
  );
  assert.equal(kept.missed.length, callLogLimit);
  assert.equal(
    kept.missed.some((row) => row.id === old.id),
    false,
  );
  const cleared = mergeCallLogs(
    [kept, { ...emptyCallLog(), clearedAt: now - 10 }],
    now,
  );
  assert.equal(cleared.missed.length, 9);
  assert.equal(cleared.clearedAt, now - 10);
});

await test('malformed vault record is rejected', () => {
  const valid = JSON.stringify({
    version: 1,
    missed: [{ id: id(), peer, at: 5 }],
    answered: [],
    clearedAt: 0,
  });
  assert.equal(parseCallLog(valid).missed.length, 1);
  for (const text of [
    JSON.stringify({ version: 2, missed: [], answered: [], clearedAt: 0 }),
    JSON.stringify({
      version: 1,
      missed: [{ id: 'x', peer, at: 1 }],
      answered: [],
      clearedAt: 0,
    }),
    JSON.stringify({ version: 1, missed: [], answered: [], clearedAt: -1 }),
  ])
    assert.throws(() => parseCallLog(text));
});
