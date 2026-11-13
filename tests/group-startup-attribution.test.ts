import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupDirectoryPrelude } from '../src/tools/chat-diagnostics/group-startup.ts';
import type { AuthorityWorkSummary } from '../src/tools/chat-diagnostics/flow.ts';
import type { GroupStartupStage } from '../src/shared/chat-sync-diagnostics/load.ts';
import type { AuthorityKind } from '../src/shared/chat-sync-diagnostics/flow.ts';

const origin = 7060;
function work(input: {
  slot: number;
  queue?: number;
  load?: number;
  kind?: AuthorityKind;
  queued: number;
  acquired: number;
  finished: number;
}): AuthorityWorkSummary {
  return {
    slot: input.slot,
    events: [
      ['queued', input.queued],
      ['admitted', input.queued],
      ['start', input.acquired],
      ['complete', input.finished],
    ].map(([workPhase, at]) => ({
      kind: 'reuse-authority-work',
      ms: Number(at),
      workPhase: String(workPhase),
      workClockMs: origin + Number(at),
      authorityKind: input.kind ?? 'vault',
      ...(input.load === undefined ? {} : { load: input.load }),
      ...(input.queue === undefined ? {} : { authorityQueue: input.queue }),
    })),
  };
}
function mark(
  prelude: GroupDirectoryPrelude,
  stage: GroupStartupStage,
  at: number,
) {
  prelude.observe({
    kind: 'reuse-load',
    ms: origin + at,
    load: 1,
    loadKind: 'group-directory',
    loadStage: stage,
    loadMs: at,
    loadClockMs: origin + at,
  });
}
function fixture() {
  const prelude = new GroupDirectoryPrelude();
  mark(prelude, 'identities-start', 0);
  mark(prelude, 'identities-end', 700);
  mark(prelude, 'vault-request', 700);
  mark(prelude, 'vault-acquired', 1870);
  mark(prelude, 'vault-ready', 2250);
  mark(prelude, 'group-mode-start', 2250);
  mark(prelude, 'group-mode-end', 2450);
  mark(prelude, 'group-list-send', 2550);
  return prelude;
}

await test('the 2550ms pre-list gap partitions linked queue time, execution and overlapping stages exactly once', () => {
  const report = fixture().report(1, {
    overflow: false,
    authority: [
      work({
        slot: 1,
        queue: 1,
        load: 1,
        kind: 'group-directory',
        queued: 700,
        acquired: 1870,
        finished: 2700,
      }),
      work({
        slot: 2,
        queue: 1,
        kind: 'conversation-previews',
        queued: 650,
        acquired: 700,
        finished: 1870,
      }),
    ],
  });
  assert.ok(report.available);
  assert.equal(report.elapsedMs, 2550);
  assert.deepEqual(report.durationsMs, {
    identities: 700,
    vaultQueue: 1170,
    vaultExecution: 680,
    vaultAuthorization: 380,
    groupMode: 200,
    groupListPreparation: 100,
  });
  assert.equal(report.accounting.queueMs, 1170);
  assert.equal(report.accounting.executionMs, 1380);
  assert.equal(report.accounting.unattributedMs, 0);
  assert.deepEqual(report.work[0]?.blockers, [
    { category: 'conversation-previews', elapsedMs: 1170 },
  ]);
  assert.ok(
    report.overlaps.some(
      (overlap) =>
        overlap.stages.includes('groupMode') &&
        overlap.stages.includes('vaultExecution') &&
        overlap.elapsedMs === 200,
    ),
  );
});

await test('an unlinked 1170ms queue span and a holder in another queue cannot establish a group wait', () => {
  const prelude = new GroupDirectoryPrelude();
  mark(prelude, 'identities-start', 0);
  mark(prelude, 'identities-end', 700);
  mark(prelude, 'group-list-send', 2550);
  const report = prelude.report(1, {
    overflow: false,
    authority: [
      work({
        slot: 1,
        queue: 1,
        load: 99,
        queued: 700,
        acquired: 1870,
        finished: 1900,
      }),
    ],
  });
  assert.ok(report.available);
  assert.equal(report.accounting.queueMs, 0);
  assert.equal(report.accounting.unattributedMs, 1850);
  assert.deepEqual(report.accounting.unattributedIntervals, [
    { startMs: 700, endMs: 2550 },
  ]);
  const otherQueue = fixture().report(1, {
    overflow: false,
    authority: [
      work({
        slot: 1,
        queue: 1,
        load: 1,
        kind: 'group-directory',
        queued: 700,
        acquired: 1870,
        finished: 2700,
      }),
      work({
        slot: 2,
        queue: 2,
        kind: 'conversation-previews',
        queued: 650,
        acquired: 700,
        finished: 1870,
      }),
    ],
  });
  assert.ok(otherQueue.available);
  assert.deepEqual(otherQueue.work[0]?.blockers, [
    { category: 'unobserved', elapsedMs: 1170 },
  ]);
});

await test('queue time nested in identity loading is subtracted from execution and reports changing occupants', () => {
  const prelude = new GroupDirectoryPrelude();
  mark(prelude, 'identities-start', 0);
  mark(prelude, 'identities-end', 2000);
  mark(prelude, 'group-list-send', 2550);
  const report = prelude.report(1, {
    overflow: false,
    authority: [
      work({
        slot: 1,
        queue: 1,
        load: 1,
        kind: 'group-identities',
        queued: 100,
        acquired: 1270,
        finished: 2000,
      }),
      work({
        slot: 2,
        queue: 1,
        kind: 'conversation-previews',
        queued: 0,
        acquired: 100,
        finished: 500,
      }),
      work({
        slot: 3,
        queue: 1,
        kind: 'group',
        queued: 0,
        acquired: 500,
        finished: 1270,
      }),
    ],
  });
  assert.ok(report.available);
  assert.equal(report.accounting.queueMs, 1170);
  assert.equal(report.accounting.executionMs, 830);
  assert.equal(report.accounting.unattributedMs, 550);
  assert.deepEqual(report.work[0]?.blockers, [
    { category: 'conversation-previews', elapsedMs: 400 },
    { category: 'group', elapsedMs: 770 },
  ]);
  assert.ok(
    report.overlaps.some(
      (overlap) =>
        overlap.stages.includes('identities') &&
        overlap.stages.includes('vaultQueue') &&
        overlap.elapsedMs === 1170,
    ),
  );
});

await test('missing clocks, incomplete dispatch and diagnostic truncation stay explicit', () => {
  const old = new GroupDirectoryPrelude();
  old.observe({
    kind: 'reuse-load',
    ms: 1,
    loadMs: 0,
    loadStage: 'identities-start',
  });
  assert.equal(
    old.report(1, { authority: [], overflow: false }).available,
    false,
  );
  const partial = new GroupDirectoryPrelude();
  mark(partial, 'identities-start', 0);
  assert.equal(
    partial.report(1, { authority: [], overflow: false }).available,
    false,
  );
  for (let i = 0; i < 40; i++) mark(partial, 'group-mode-start', i + 1);
  mark(partial, 'group-list-send', 2550);
  const report = partial.report(1, { authority: [], overflow: true });
  assert.ok(report.available);
  assert.equal(report.coverage.authorityOverflow, true);
  assert.ok(report.coverage.droppedMilestones > 0);
  assert.equal(report.accounting.unattributedMs, 2550);
});
