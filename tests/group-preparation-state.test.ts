import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  advanceCoverage,
  owedLimit,
} from '../src/client/groups/preparation-state.ts';
import type {
  ConfirmedRead,
  Coverage,
} from '../src/client/groups/preparation-state.ts';
import { GroupPreparationPlan } from '../src/client/groups/preparation-plan.ts';
import type { PreparationSteps } from '../src/client/groups/preparation-plan.ts';
import { IncompleteGroupIndex } from '../src/client/groups/message-index.ts';

const ids = (count: number): string[] =>
  Array.from({ length: count }, () => crypto.randomUUID());
const complete: Coverage = {
  joined: 3,
  high: 100,
  revision: 40,
  older: null,
  owed: [],
  held: [],
};
const read = (input: Partial<ConfirmedRead> = {}): ConfirmedRead => ({
  joined: 3,
  snapshot: { revision: 50, anchor: 120 },
  from: 40,
  newer: null,
  settled: [],
  held: [],
  ...input,
});

await test('a journal read that reaches back to the coverage extends it to the new cut', () => {
  assert.deepEqual(advanceCoverage(complete, read()), {
    ...complete,
    high: 120,
    revision: 50,
  });
  // Starting earlier than the coverage still includes all of its changes.
  assert.equal(advanceCoverage(complete, read({ from: 12 }))?.high, 120);
});

await test('a journal starting after the coverage leaves it, unless a latest window starts a new pass', () => {
  assert.deepEqual(advanceCoverage(complete, read({ from: 45 })), complete);
  assert.deepEqual(advanceCoverage(complete, read({ from: 45, start: 105 })), {
    joined: 3,
    high: 120,
    revision: 50,
    older: 105,
    owed: [],
    held: [],
  });
});

await test('a full pass after a journal gap owes only the newer packets and the held ones', () => {
  const held = ids(2),
    newer = ids(20),
    next = advanceCoverage(
      { ...complete, held },
      read({ from: null, newer, settled: newer.slice(0, 4) }),
    );
  assert.equal(next?.high, 120);
  assert.equal(next?.older, null);
  assert.deepEqual(next?.owed, [...newer.slice(4), ...held]);
  assert.deepEqual(next?.held, []);
});

await test('a gap with too many packets, a server without cuts or another period prepares everything again', () => {
  const start = { from: null, start: 110 } as const;
  for (const [coverage, input] of [
    [complete, read({ ...start, newer: ids(owedLimit + 1) })],
    [complete, read({ ...start, newer: null })],
    [{ ...complete, high: null }, read({ ...start, newer: [] })],
    [complete, read({ ...start, newer: [], joined: 9 })],
  ] satisfies [Coverage, ConfirmedRead][]) {
    const next = advanceCoverage(coverage, input);
    assert.equal(next?.older, 110);
    assert.deepEqual(next?.owed, []);
  }
  assert.equal(
    advanceCoverage(null, read({ from: null, newer: [] })),
    null,
    'Only a latest window can start a coverage',
  );
});

await test('held packets wait for media, settle once read and stay bounded', () => {
  const waiting = ids(70);
  const held = advanceCoverage(complete, read({ held: waiting }))!;
  assert.deepEqual(held.held, waiting.slice(-64));
  const owed = advanceCoverage(
    { ...held, owed: waiting.slice(-2) },
    read({ settled: waiting.slice(-3), held: [] }),
  )!;
  assert.deepEqual(owed.owed, []);
  assert.ok(!owed.held.some((id) => waiting.slice(-3).includes(id)));
});

await test('older pages move the first pass only from the recorded cursor', () => {
  const filling = { ...complete, older: 80 };
  assert.equal(
    advanceCoverage(filling, read({ older: { from: 80, to: 48 } }))?.older,
    48,
  );
  assert.equal(
    advanceCoverage(filling, read({ older: { from: 64, to: 32 } }))?.older,
    80,
  );
  assert.equal(
    advanceCoverage(filling, read({ older: { from: 80, to: null } }))?.older,
    null,
  );
});

function steps(log: string[], plan: { fill: Map<string, number> }) {
  return {
    list: (after: string | null) => {
      log.push(`list:${after}`);
      return Promise.resolve(
        after === null
          ? { groups: ['A', 'B'], next: 'B' }
          : { groups: ['C'], next: null },
      );
    },
    latest: (group: string) => {
      log.push(`latest:${group}`);
      return Promise.resolve((plan.fill.get(group) ?? 0) > 0);
    },
    fill: (group: string) => {
      log.push(`fill:${group}`);
      const left = (plan.fill.get(group) ?? 0) - 1;
      plan.fill.set(group, left);
      return Promise.resolve(left > 0);
    },
    shouldYield: () => false,
  } satisfies PreparationSteps;
}

await test('every latest window comes before older history, and a new request starts another latest pass', async () => {
  const log: string[] = [],
    state = { fill: new Map([['A', 9]]) },
    plan = new GroupPreparationPlan();
  plan.requested(1);
  assert.equal(await plan.run(steps(log, state)), true);
  assert.deepEqual(log, [
    'list:null',
    'latest:A',
    'latest:B',
    'list:B',
    'latest:C',
    'fill:A',
    'fill:A',
    'fill:A',
  ]);
  log.length = 0;
  plan.requested(2);
  await plan.run(steps(log, state));
  assert.deepEqual(log.slice(0, 4), [
    'list:null',
    'latest:A',
    'latest:B',
    'list:B',
  ]);
  log.length = 0;
  plan.requested(2);
  while (await plan.run(steps(log, state)));
  assert.ok(!log.some((entry) => entry.startsWith('latest')));
  assert.equal(plan.complete, true);
});

await test('a turn stops for waiting work and for an index that needs another turn', async () => {
  const log: string[] = [],
    plan = new GroupPreparationPlan();
  let waiting = false,
    incomplete = true;
  const base = steps(log, { fill: new Map() });
  const yielding: PreparationSteps = {
    ...base,
    latest: async (group) => {
      if (group === 'B' && incomplete) {
        incomplete = false;
        throw new IncompleteGroupIndex();
      }
      waiting = true;
      return base.latest(group);
    },
    shouldYield: () => waiting,
  };
  assert.equal(await plan.run(yielding), true);
  assert.deepEqual(log, ['list:null', 'latest:A']);
  waiting = false;
  assert.equal(await plan.run(yielding), true);
  assert.deepEqual(log, ['list:null', 'latest:A'], 'B continues next turn');
  waiting = false;
  assert.equal(await plan.run(yielding), true);
  assert.deepEqual(log.at(-1), 'latest:B');
});
